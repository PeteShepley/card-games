import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cards } from "@card-games/card-kit/testCards.ts";
import { createRelayTransport } from "@card-games/card-kit/net/relayTransport.ts";
import { asContractTarget, createGameStore } from "./store.ts";
import { CRAZY_EIGHTS } from "./game.ts";
import { describeAction, resultLine, statusLine } from "./status.ts";
import { initialState, playableCards } from "./engine/game.ts";
import type { EngineState } from "./engine/game.ts";

const names = { a: "Ada", b: "Bo", c: "Cy" };

function started() {
  const store = createGameStore();
  store.start({ seed: 42, seats: ["a", "b", "c"], dealer: "a", viewerSeat: "b", names });
  store.apply({ type: "startHand" });
  return store;
}

describe("store", () => {
  test("start builds a fresh table; startHand deals it", () => {
    const store = started();
    const { game, viewerSeat } = store.getSnapshot();
    expect(viewerSeat).toBe("b");
    expect(game?.phase).toBe("play");
    expect(game?.hands.b).toHaveLength(5);
  });

  test("accepted actions append to the feed; rejected ones change nothing", () => {
    const store = started();
    const before = store.getSnapshot();
    store.apply({ type: "draw", seat: "a" }); // not a's turn
    expect(store.getSnapshot()).toBe(before);

    store.apply({ type: "draw", seat: "b" });
    expect(store.getSnapshot().feed.map((e) => e.text)).toEqual(["Bo drew"]);
  });

  test("the feed keeps only the latest few entries", () => {
    const store = started();
    for (let i = 0; i < 8; i++) store.apply({ type: "draw", seat: "b" });
    expect(store.getSnapshot().feed).toHaveLength(5);
  });

  test("an action before any contract is a programming error", () => {
    expect(() => createGameStore().apply({ type: "startHand" })).toThrow();
  });
});

describe("status", () => {
  const playing: EngineState = {
    ...initialState(1, ["a", "b", "c"], "a"),
    phase: "play",
    discardPile: cards("9:hearts"),
    activeSuit: "hearts",
    toAct: "b"
  };

  test("says whose turn it is and the suit to follow", () => {
    expect(statusLine(playing, "b", names)).toBe("Your turn — play a match or an 8, or draw (♥ to follow)");
    expect(statusLine(playing, "a", names)).toBe("Waiting for Bo (♥ to follow)");
  });

  test("describes plays, wild suits, draws and passes", () => {
    expect(describeAction(playing, { type: "play", seat: "b", card: cards("9:spades")[0] }, names)).toBe(
      "Bo played 9♠"
    );
    expect(
      describeAction(playing, { type: "play", seat: "b", card: cards("8:clubs")[0], suit: "spades" }, names)
    ).toBe("Bo played 8♣ — spades now");
    expect(describeAction(playing, { type: "draw", seat: "c" }, names)).toBe("Cy drew (pile reshuffled)");
    expect(describeAction(playing, { type: "pass", seat: "c" }, names)).toBe("Cy passed");
  });

  test("announces the hand result from the viewer's side", () => {
    const over: EngineState = {
      ...playing,
      phase: "handOver",
      toAct: null,
      result: { type: "out", winner: "b", points: 42 }
    };
    expect(resultLine(over, "b", names)).toBe("You went out — +42 points");
    expect(resultLine(over, "a", names)).toBe("Bo went out — +42 points");
    expect(
      resultLine({ ...over, result: { type: "blocked", winner: null, points: 0 } }, "a", names)
    ).toBe("Blocked — nobody wins this hand");
  });
});

// The kit's relay transport driving the crazy-eights store for a
// three-seat room: the contract's seat list becomes the table's order.
describe("over the relay", () => {
  class MockWebSocket {
    static OPEN = 1;
    static last: MockWebSocket | null = null;
    readyState = 0;
    private listeners: Record<string, ((event: unknown) => void)[]> = {};
    constructor() {
      MockWebSocket.last = this;
    }
    addEventListener(type: string, cb: (event: unknown) => void) {
      (this.listeners[type] ??= []).push(cb);
    }
    removeEventListener() {}
    send() {}
    close() {}
    open() {
      this.readyState = 1;
      for (const cb of this.listeners.open ?? []) cb({});
    }
    receive(message: unknown) {
      for (const cb of this.listeners.message ?? []) cb({ data: JSON.stringify(message) });
    }
  }

  beforeEach(() => {
    vi.stubGlobal("WebSocket", MockWebSocket);
    vi.stubGlobal("sessionStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
  });
  afterEach(() => vi.unstubAllGlobals());

  test("a three-seat contract seats everyone in order with their names", () => {
    const store = createGameStore();
    const transport = createRelayTransport({
      game: CRAZY_EIGHTS,
      target: asContractTarget(store),
      url: "ws://test",
      onEvent: () => {}
    });
    const socket = MockWebSocket.last!;
    socket.open();
    socket.receive({ kind: "joined", code: "ABC123", token: "t", seat: "c" });
    socket.receive({
      kind: "start",
      game: "crazy-eights",
      seed: 42,
      dealer: "a",
      seats: [
        { id: "a", name: "Ada" },
        { id: "b", name: "Bo" },
        { id: "c", name: "Cy" }
      ]
    });
    socket.receive({ kind: "action", seq: 1, action: { type: "startHand" } });

    const { game, viewerSeat, names: seated } = store.getSnapshot();
    expect(viewerSeat).toBe("c");
    expect(seated).toEqual(names);
    expect(game?.seats).toEqual(["a", "b", "c"]);
    expect(game?.toAct).toBe("b");
    expect(playableCards(game!, "c")).toEqual([]); // not c's turn
    transport.destroy();
  });
});
