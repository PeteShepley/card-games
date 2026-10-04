import { expect, test } from "vitest";
import type { Card } from "@card-games/card-kit/cards.ts";
import { bestDiscard, decide } from "./bot.ts";
import { advance, initialState } from "./engine/game.ts";
import type { Action, EngineState, Seat } from "./engine/game.ts";

function playHand(seed: number): EngineState {
  let state = initialState(seed, "a");
  const deal = advance(state, { type: "startHand" });
  if (!deal.ok) throw new Error(deal.reason);
  state = deal.state;
  for (let step = 0; step < 2000; step++) {
    if (state.phase === "handOver") return state;
    let action: Action | null = null;
    for (const seat of ["a", "b"] as Seat[]) action ??= decide(state, seat);
    if (!action) throw new Error(`nobody can move in ${state.phase}`);
    const result = advance(state, action);
    if (!result.ok)
      throw new Error(`illegal ${JSON.stringify(action)}: ${result.reason}`);
    state = result.state;
  }
  throw new Error("the hand never ended");
}

test("computers play whole hands of gin with only legal moves", () => {
  const results = [1, 2, 3, 4, 5, 6, 7, 8].map(
    (seed) => playHand(seed).result?.type
  );
  expect(results.every((type) => type === "gin" || type === "dead")).toBe(true);
  // They play to win, not just to the end: most hands end in gin.
  expect(
    results.filter((type) => type === "gin").length
  ).toBeGreaterThanOrEqual(4);
});

const cards = (...names: string[]): Card[] =>
  names.map(
    (name) =>
      ({
        rank: name.slice(0, -1),
        suit: { s: "spades", h: "hearts", d: "diamonds", c: "clubs" }[
          name.slice(-1)
        ]!
      }) as Card
  );

test("the discard keeps the melds and throws the highest loose card", () => {
  const hand = cards(
    "2h",
    "3h",
    "4h",
    "7c",
    "7d",
    "7s",
    "Jd",
    "Qd",
    "Kd",
    "9s",
    "Kc"
  );
  const { card, deadwood } = bestDiscard(hand, null);
  expect(card.rank + card.suit[0]).toBe("Kc");
  expect(deadwood).toBe(9);
});

test("the card just taken from the discard pile never goes straight back", () => {
  const hand = cards(
    "2h",
    "3h",
    "4h",
    "7c",
    "7d",
    "7s",
    "Jd",
    "Qd",
    "Kd",
    "9s",
    "Kc"
  );
  const { card } = bestDiscard(hand, hand[10]);
  expect(card.rank + card.suit[0]).not.toBe("Kc");
});
