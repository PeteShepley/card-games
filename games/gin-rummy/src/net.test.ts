import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createLoopbackTransport } from "@card-games/card-kit/net/loopback.ts";
import { createRelayTransport } from "@card-games/card-kit/net/relayTransport.ts";
import { asContractTarget, createGameStore } from "./store.ts";
import { GIN_RUMMY } from "./game.ts";

// The kit's transports driving gin's real store and engine: the contract
// from the shared relay (seats as a list) must boot the same game the
// gin-only relay did, and a resync must rebuild it exactly.

class MockWebSocket {
  static OPEN = 1;
  static last: MockWebSocket | null = null;
  readyState = 0;
  sent: unknown[] = [];
  private listeners: Record<string, ((event: unknown) => void)[]> = {};
  constructor() {
    MockWebSocket.last = this;
  }
  addEventListener(type: string, cb: (event: unknown) => void) {
    (this.listeners[type] ??= []).push(cb);
  }
  removeEventListener() {}
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {}
  open() {
    this.readyState = MockWebSocket.OPEN;
    for (const cb of this.listeners.open ?? []) cb({});
  }
  receive(message: unknown) {
    for (const cb of this.listeners.message ?? [])
      cb({ data: JSON.stringify(message) });
  }
}

beforeEach(() => {
  vi.stubGlobal("WebSocket", MockWebSocket);
  vi.stubGlobal("sessionStorage", {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {}
  });
});
afterEach(() => vi.unstubAllGlobals());

const contract = {
  game: "gin-rummy",
  seed: 42,
  dealer: "a",
  seats: [
    { id: "a", name: "Ada" },
    { id: "b", name: "Bo" }
  ]
};

test("a relay contract boots gin with both names at the viewer's seat", () => {
  const store = createGameStore();
  const transport = createRelayTransport({
    game: GIN_RUMMY,
    target: asContractTarget(store),
    url: "ws://test",
    onEvent: () => {}
  });
  const socket = MockWebSocket.last!;
  socket.open();
  socket.receive({ kind: "joined", code: "ABC123", token: "tok", seat: "b" });
  socket.receive({ kind: "start", ...contract });

  const snapshot = store.getSnapshot();
  expect(snapshot.viewerSeat).toBe("b");
  expect(snapshot.names).toEqual({ a: "Ada", b: "Bo" });
  expect(snapshot.game?.dealer).toBe("a");
  expect(snapshot.game?.phase).toBe("awaitingStart");

  socket.receive({ kind: "action", seq: 1, action: { type: "startHand" } });
  expect(store.getSnapshot().game?.phase).toBe("upcardOfferNonDealer");
  transport.destroy();
});

test("resync rebuilds gin exactly from the contract plus the log", () => {
  const store = createGameStore();
  const transport = createRelayTransport({
    game: GIN_RUMMY,
    target: asContractTarget(store),
    url: "ws://test",
    onEvent: () => {}
  });
  const socket = MockWebSocket.last!;
  socket.open();
  transport.reconnect({ code: "ABC123", token: "tok", seat: "b" });
  socket.receive({
    kind: "resync",
    ...contract,
    log: [
      { seq: 1, action: { type: "startHand" } },
      { seq: 2, action: { type: "passUpcard", seat: "b" } }
    ]
  });

  const reference = createGameStore();
  reference.start({
    seed: 42,
    dealer: "a",
    viewerSeat: "b",
    names: { a: "Ada", b: "Bo" }
  });
  reference.apply({ type: "startHand" });
  reference.apply({ type: "passUpcard", seat: "b" });
  expect(store.getSnapshot().game).toEqual(reference.getSnapshot().game);
  transport.destroy();
});

test("two loopback tabs keep identical gin state", async () => {
  vi.unstubAllGlobals(); // the loopback needs the real BroadcastChannel only
  const flush = async () => {
    for (let round = 0; round < 5; round++)
      await new Promise((resolve) => setTimeout(resolve, 0));
  };
  const channelName = "gin-net-test";
  const creatorStore = createGameStore();
  const creator = createLoopbackTransport({
    game: GIN_RUMMY,
    role: "creator",
    target: asContractTarget(creatorStore),
    seed: 42,
    channelName
  });
  const joinerStore = createGameStore();
  const joiner = createLoopbackTransport({
    game: GIN_RUMMY,
    role: "joiner",
    target: asContractTarget(joinerStore),
    channelName
  });
  await flush();

  creator.submit({ type: "startHand" });
  await flush();
  joiner.submit({ type: "passUpcard", seat: "b" });
  await flush();
  expect(creatorStore.getSnapshot().game?.phase).toBe("upcardOfferDealer");
  expect(joinerStore.getSnapshot().game).toEqual(
    creatorStore.getSnapshot().game
  );
  expect(joinerStore.getSnapshot().viewerSeat).toBe("b");

  creator.destroy();
  joiner.destroy();
});
