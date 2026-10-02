import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Contract } from "@peteshepley/game-relay/protocol";
import {
  PING_INTERVAL_MS,
  createRelayTransport,
  loadSession
} from "./relayTransport.ts";
import type { LobbyEvent } from "./relayTransport.ts";
import { TEST_GAME, recordingTarget } from "./testTarget.ts";

// A minimal in-test WebSocket: the transport talks to this instead of a real
// socket, so we can drive server->client messages and inspect what the client
// sent. Node 22 ships a real global WebSocket, so we must stub it.
class MockWebSocket {
  static OPEN = 1;
  static last: MockWebSocket | null = null;
  readyState = 0;
  sent: unknown[] = [];
  url: string;
  private listeners: Record<string, ((event: unknown) => void)[]> = {};

  constructor(url: string) {
    this.url = url;
    MockWebSocket.last = this;
  }
  addEventListener(type: string, cb: (event: unknown) => void) {
    (this.listeners[type] ??= []).push(cb);
  }
  removeEventListener(type: string, cb: (event: unknown) => void) {
    this.listeners[type] = (this.listeners[type] ?? []).filter(
      (fn) => fn !== cb
    );
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.readyState = 3;
    this.emit("close", {});
  }
  // --- test drivers ---
  open() {
    this.readyState = MockWebSocket.OPEN;
    this.emit("open", {});
  }
  receive(message: unknown) {
    this.emit("message", { data: JSON.stringify(message) });
  }
  private emit(type: string, event: unknown) {
    for (const cb of this.listeners[type] ?? []) cb(event);
  }
}

// sessionStorage is a browser global; a Map-backed stand-in is enough.
function memoryStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key)
  };
}

beforeEach(() => {
  vi.stubGlobal("WebSocket", MockWebSocket);
  vi.stubGlobal("sessionStorage", memoryStorage());
  MockWebSocket.last = null;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const contract: Contract = {
  game: "test-game",
  seed: 42,
  dealer: "a",
  seats: [
    { id: "a", name: "Ada" },
    { id: "b", name: "Bo" },
    { id: "c", name: "Cy" }
  ]
};

function connect(onEvent: (event: LobbyEvent) => void = () => {}) {
  const target = recordingTarget();
  const transport = createRelayTransport({
    game: TEST_GAME,
    target,
    url: "ws://test",
    onEvent
  });
  return { target, transport, socket: MockWebSocket.last! };
}

test("create queues until open, then sends the game id and seat bounds", () => {
  const { transport, socket } = connect();

  transport.create("Ada");
  expect(socket.sent).toEqual([]); // queued while connecting

  socket.open();
  expect(socket.sent).toEqual([
    {
      kind: "create",
      game: "test-game",
      name: "Ada",
      rnd: expect.any(Number),
      minSeats: 2,
      maxSeats: 4
    }
  ]);

  transport.destroy();
});

test("join carries the game id so the relay can refuse a wrong-game code", () => {
  const { transport, socket } = connect();
  socket.open();
  transport.join("ABC123", "Bo");
  expect(socket.sent).toEqual([
    {
      kind: "join",
      code: "ABC123",
      game: "test-game",
      name: "Bo",
      rnd: expect.any(Number)
    }
  ]);
  transport.destroy();
});

test("being seated saves the session and reports seat, code and role", () => {
  const events: LobbyEvent[] = [];
  const { transport, socket } = connect((e) => events.push(e));
  socket.open();
  transport.join("ABC123", "Cy");

  socket.receive({ kind: "joined", code: "ABC123", token: "tok", seat: "c" });
  expect(events).toContainEqual({
    type: "seated",
    code: "ABC123",
    seat: "c",
    creator: false
  });
  expect(loadSession(TEST_GAME)).toEqual({
    code: "ABC123",
    token: "tok",
    seat: "c"
  });

  const roster = {
    seats: [{ id: "a", name: "Ada", connected: true }],
    minSeats: 2,
    maxSeats: 4,
    started: false
  };
  socket.receive({ kind: "roster", ...roster });
  expect(events).toContainEqual({
    type: "roster",
    roster: { kind: "roster", ...roster }
  });

  transport.destroy();
});

test("a start contract boots the target at our own seat and reports started", () => {
  const events: LobbyEvent[] = [];
  const { target, transport, socket } = connect((e) => events.push(e));
  socket.open();
  transport.join("ABC123", "Bo");
  socket.receive({ kind: "joined", code: "ABC123", token: "tok", seat: "b" });

  socket.receive({ kind: "start", ...contract });
  expect(events).toContainEqual({ type: "started" });
  expect(target.recorded.viewerSeat).toBe("b");
  expect(target.recorded.contract).toEqual(contract);

  transport.destroy();
});

test("begin sends begin", () => {
  const { transport, socket } = connect();
  socket.open();
  transport.begin();
  expect(socket.sent).toEqual([{ kind: "begin" }]);
  transport.destroy();
});

test("stamped actions apply in order; submit never applies locally", () => {
  const { target, transport, socket } = connect();
  socket.open();
  socket.receive({ kind: "start", ...contract });

  transport.submit({ type: "play" });
  expect(target.recorded.actions).toEqual([]);
  expect(socket.sent).toContainEqual({
    kind: "submit",
    action: { type: "play" }
  });

  socket.receive({ kind: "action", seq: 1, action: { type: "play" } });
  socket.receive({ kind: "action", seq: 1, action: { type: "play" } }); // dup
  socket.receive({ kind: "action", seq: 2, action: { type: "pass" } });
  expect(target.recorded.actions).toEqual([{ type: "play" }, { type: "pass" }]);

  transport.destroy();
});

test("a gap in the stamp stream triggers a resync request", () => {
  const { target, transport, socket } = connect();
  socket.open();
  socket.receive({ kind: "start", ...contract });
  socket.sent.length = 0;

  socket.receive({ kind: "action", seq: 2, action: { type: "play" } });
  expect(socket.sent).toContainEqual({ kind: "resyncRequest" });
  expect(target.recorded.actions).toEqual([]);

  transport.destroy();
});

test("reconnect presents the token and resync rebuilds from contract + log", () => {
  const { target, transport, socket } = connect();
  socket.open();
  transport.reconnect({ code: "ABC123", token: "tok", seat: "c" });
  expect(socket.sent).toEqual([
    { kind: "reconnect", code: "ABC123", token: "tok" }
  ]);

  socket.receive({
    kind: "resync",
    ...contract,
    log: [
      { seq: 1, action: { type: "play" } },
      { seq: 2, action: { type: "pass" } }
    ]
  });
  expect(target.recorded.viewerSeat).toBe("c");
  expect(target.recorded.actions).toEqual([{ type: "play" }, { type: "pass" }]);

  transport.destroy();
});

test("a stale-token error clears the saved session", () => {
  const { transport, socket } = connect();
  socket.open();
  socket.receive({ kind: "created", code: "ABC123", token: "tok", seat: "a" });
  expect(loadSession(TEST_GAME)).not.toBeNull();
  socket.receive({ kind: "error", reason: "badToken" });
  expect(loadSession(TEST_GAME)).toBeNull();
  transport.destroy();
});

test("pings on an interval while open, and stops on close", () => {
  vi.useFakeTimers();
  const { transport, socket } = connect();
  socket.open();

  vi.advanceTimersByTime(PING_INTERVAL_MS);
  expect(socket.sent).toEqual([{ kind: "ping" }]);

  transport.destroy();
  vi.advanceTimersByTime(PING_INTERVAL_MS * 3);
  expect(socket.sent).toEqual([{ kind: "ping" }]);
});
