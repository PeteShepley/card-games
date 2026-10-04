import { expect, test } from "vitest";
import type { Card } from "@card-games/card-kit/cards.ts";
import { chooseBid, decide } from "./bot.ts";
import { advance, initialState } from "./engine/game.ts";
import type { Action, EngineState } from "./engine/game.ts";

const SEATS = ["a", "b", "c", "d"];

function playOut(seed: number): EngineState {
  let state = initialState(seed, SEATS, "a");
  for (let step = 0; step < 20000; step++) {
    if (state.phase === "gameOver") return state;
    let action: Action | null = null;
    if (state.phase === "awaitingStart" || state.phase === "handOver")
      action = { type: "startHand" };
    for (const seat of SEATS) action ??= decide(state, seat);
    if (!action) throw new Error(`nobody can move in ${state.phase}`);
    const result = advance(state, action);
    if (!result.ok)
      throw new Error(`illegal ${JSON.stringify(action)}: ${result.reason}`);
    state = result.state;
  }
  throw new Error("the game never ended");
}

test("computers play whole games of Spades with only legal moves", () => {
  for (const seed of [1, 2, 3, 42, 1234])
    expect(playOut(seed).phase).toBe("gameOver");
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

test("bids count the likely tricks: a strong hand bids high, a hopeless one goes nil", () => {
  const strong = cards(
    "As",
    "Ks",
    "Qs",
    "Js",
    "10s",
    "Ah",
    "Kh",
    "Ad",
    "2c",
    "3c",
    "4c",
    "5d",
    "6d"
  );
  expect(chooseBid(strong)).toBeGreaterThanOrEqual(6);
  const hopeless = cards(
    "2s",
    "3s",
    "4h",
    "5h",
    "6h",
    "7h",
    "2d",
    "3d",
    "4d",
    "5c",
    "6c",
    "7c",
    "8c"
  );
  expect(chooseBid(hopeless)).toBe(0);
  const middling = cards(
    "As",
    "5s",
    "6s",
    "Ah",
    "4h",
    "5h",
    "Kd",
    "7d",
    "8d",
    "2c",
    "3c",
    "9c",
    "10c"
  );
  expect(chooseBid(middling)).toBeGreaterThanOrEqual(2);
  expect(chooseBid(middling)).toBeLessThanOrEqual(5);
});
