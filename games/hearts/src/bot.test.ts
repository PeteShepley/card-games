import { expect, test } from "vitest";
import type { Card } from "@card-games/card-kit/cards.ts";
import { choosePass, decide } from "./bot.ts";
import { advance, initialState } from "./engine/game.ts";
import type { Action, EngineState } from "./engine/game.ts";

const SEATS = ["a", "b", "c", "d"];

// Four computers play a whole game; every move they pick must be legal.
function playOut(seed: number): EngineState {
  let state = initialState(seed, SEATS);
  for (let step = 0; step < 5000; step++) {
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

test("computers play whole games of Hearts with only legal moves", () => {
  for (const seed of [1, 2, 3, 42, 1234])
    expect(playOut(seed).phase).toBe("gameOver");
});

test("a computer only acts when it has something to do", () => {
  const state = initialState(5, SEATS);
  for (const seat of SEATS) expect(decide(state, seat)).toBeNull();
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

test("the pass gets rid of the queen of spades and her betters first", () => {
  const hand = cards(
    "Qs",
    "As",
    "2s",
    "3s",
    "4c",
    "5c",
    "6c",
    "7d",
    "8d",
    "9d",
    "2h",
    "3h",
    "Kh"
  );
  const pass = choosePass(hand).map((card) => card.rank + card.suit[0]);
  expect(pass).toEqual(expect.arrayContaining(["Qs", "As", "Kh"]));
});
