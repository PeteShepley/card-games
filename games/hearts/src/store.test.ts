import { describe, expect, test } from "vitest";
import { cards } from "@card-games/card-kit/testCards.ts";
import { createGameStore } from "./store.ts";
import { describeAction, gameLine, handLine, statusLine } from "./status.ts";
import { initialState } from "./engine/game.ts";
import type { EngineState } from "./engine/game.ts";

const names = { a: "Ada", b: "Bo", c: "Cy", d: "Di" };
const SEATS = ["a", "b", "c", "d"];

function dealt() {
  const store = createGameStore();
  store.start({ seed: 42, seats: SEATS, viewerSeat: "a", names });
  store.apply({ type: "startHand" });
  return store;
}

describe("store", () => {
  test("a pass is announced in the feed without revealing the cards", () => {
    const store = dealt();
    const chosen = store.getSnapshot().game!.hands.b.slice(0, 3);
    store.apply({ type: "pass", seat: "b", cards: chosen });
    expect(store.getSnapshot().feed.map((e) => e.text)).toEqual(["Bo passed 3 cards"]);
  });

  test("rejected actions change nothing", () => {
    const store = dealt();
    const before = store.getSnapshot();
    store.apply({ type: "pass", seat: "a", cards: [] });
    expect(store.getSnapshot()).toBe(before);
  });
});

describe("status", () => {
  test("passing tells you where your cards go, then who you're waiting on", () => {
    const state = initialState(1, SEATS);
    const passing: EngineState = { ...state, phase: "passing", passDirection: "left" };
    expect(statusLine(passing, "a", names)).toBe("Choose 3 cards to pass left to Bo");
    const across: EngineState = { ...passing, passDirection: "across" };
    expect(statusLine(across, "a", names)).toBe("Choose 3 cards to pass across to Cy");
    const waiting: EngineState = {
      ...passing,
      passed: { a: cards("2:clubs", "3:clubs", "4:clubs"), b: null, c: cards("5:clubs", "6:clubs", "7:clubs"), d: null }
    };
    expect(statusLine(waiting, "a", names)).toBe("Waiting for Bo, Di to pass");
  });

  test("in play: your lead, follow the suit, or who you're waiting for", () => {
    const base: EngineState = { ...initialState(1, SEATS), phase: "playing", toAct: "a", trickNumber: 1 };
    expect(statusLine(base, "a", names)).toBe("Your lead — the 2♣ opens");
    expect(statusLine({ ...base, trickNumber: 4 }, "a", names)).toBe("Your lead");
    const following: EngineState = { ...base, trickNumber: 4, trick: [{ seat: "d", card: cards("9:diamonds")[0] }] };
    expect(statusLine(following, "a", names)).toBe("Your turn — follow ♦ if you can");
    expect(statusLine({ ...base, toAct: "c" }, "a", names)).toBe("Waiting for Cy");
  });

  test("a completed trick names who took it and the points", () => {
    const before: EngineState = {
      ...initialState(1, SEATS),
      phase: "playing",
      trick: [
        { seat: "a", card: cards("5:clubs")[0] },
        { seat: "b", card: cards("K:hearts")[0] },
        { seat: "c", card: cards("J:clubs")[0] }
      ]
    };
    const after: EngineState = {
      ...before,
      trick: [],
      lastTrick: { cards: [...before.trick, { seat: "d", card: cards("Q:spades")[0] }], winner: "c" }
    };
    expect(describeAction(before, after, { type: "play", seat: "d", card: cards("Q:spades")[0] }, names)).toBe(
      "Di played Q♠ — Cy takes it (+14)"
    );
  });

  test("moon shots and game results", () => {
    const over: EngineState = {
      ...initialState(1, SEATS),
      phase: "gameOver",
      handNumber: 7,
      handScore: { points: { a: 0, b: 26, c: 26, d: 26 }, moon: "a" },
      scores: { a: 40, b: 104, c: 60, d: 40 },
      winners: ["a", "d"]
    };
    expect(handLine(over, "a", names)).toBe("You shot the moon! Everyone else takes 26");
    expect(handLine(over, "b", names)).toBe("Ada shot the moon!");
    expect(gameLine(over, "b", names)).toBe("Ada and Di tie with 40");
    expect(gameLine({ ...over, winners: ["a"] }, "a", names)).toBe("You win with 40");
    expect(gameLine({ ...over, winners: ["a"] }, "b", names)).toBe("Ada wins with 40");
  });
});
