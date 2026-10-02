import { describe, expect, test } from "vitest";
import { cards } from "@card-games/card-kit/testCards.ts";
import { createGameStore } from "./store.ts";
import { describeAction, gameLine, handSummary, statusLine, teamName } from "./status.ts";
import { initialState } from "./engine/game.ts";
import type { EngineState, TeamHandScore } from "./engine/game.ts";

const names = { a: "Ada", b: "Bo", c: "Cy", d: "Di" };
const SEATS = ["a", "b", "c", "d"];

describe("store", () => {
  test("deals, then records bids in the feed", () => {
    const store = createGameStore();
    store.start({ seed: 42, seats: SEATS, dealer: "d", viewerSeat: "a", names });
    store.apply({ type: "startHand" });
    expect(store.getSnapshot().game?.toAct).toBe("a");
    store.apply({ type: "bid", seat: "a", bid: 0 });
    store.apply({ type: "bid", seat: "b", bid: 4 });
    expect(store.getSnapshot().feed.map((e) => e.text)).toEqual(["Ada bid nil", "Bo bid 4"]);
  });

  test("rejected actions change nothing", () => {
    const store = createGameStore();
    store.start({ seed: 42, seats: SEATS, dealer: "d", viewerSeat: "a", names });
    store.apply({ type: "startHand" });
    const before = store.getSnapshot();
    store.apply({ type: "bid", seat: "c", bid: 3 }); // not c's turn
    expect(store.getSnapshot()).toBe(before);
  });
});

describe("status", () => {
  const base = initialState(1, SEATS, "d");

  test("bidding and play prompts", () => {
    const bidding: EngineState = { ...base, phase: "bidding", toAct: "a" };
    expect(statusLine(bidding, "a", names)).toBe("Your bid — how many tricks will you take?");
    expect(statusLine(bidding, "b", names)).toBe("Waiting for Ada to bid");
    const following: EngineState = {
      ...base,
      phase: "playing",
      toAct: "a",
      trick: [{ seat: "d", card: cards("9:diamonds")[0] }]
    };
    expect(statusLine(following, "a", names)).toBe("Your turn — follow ♦ if you can");
  });

  test("teams are named by partners, and a hand summary reads naturally", () => {
    expect(teamName(base, 0, names)).toBe("Ada & Cy");
    expect(teamName(base, 1, names)).toBe("Bo & Di");
    const made: TeamHandScore = { contract: 5, tricks: 6, made: true, nils: [], bags: 1, bagPenalty: false, points: 51 };
    expect(handSummary(made, names)).toBe("bid 5, took 6: +51");
    const messy: TeamHandScore = {
      contract: 4,
      tricks: 3,
      made: false,
      nils: [{ seat: "c", made: false }],
      bags: 2,
      bagPenalty: true,
      points: -238
    };
    expect(handSummary(messy, names)).toBe("bid 4, took 3 — set · Cy nil failed · 10 bags −100: −238");
  });

  test("game over speaks to the viewer's partnership", () => {
    const over: EngineState = { ...base, phase: "gameOver", winner: 0, scores: [510, 320] };
    expect(gameLine(over, "a", names)).toBe("You and Cy win!");
    expect(gameLine(over, "b", names)).toBe("Ada & Cy win");
  });

  test("a completed trick names who took it", () => {
    const before: EngineState = {
      ...base,
      phase: "playing",
      trick: [
        { seat: "a", card: cards("5:clubs")[0] },
        { seat: "b", card: cards("2:spades")[0] },
        { seat: "c", card: cards("J:clubs")[0] }
      ]
    };
    const after: EngineState = { ...before, trick: [], lastTrick: { cards: [], winner: "b" } };
    expect(describeAction(before, after, { type: "play", seat: "d", card: cards("A:clubs")[0] }, names)).toBe(
      "Di played A♣ — Bo takes it"
    );
  });
});
