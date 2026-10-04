import { expect, test } from "vitest";
import { decide } from "./bot.ts";
import { advance, initialState } from "./engine/game.ts";
import type { Action, EngineState } from "./engine/game.ts";

function playHand(seed: number, seats: string[]): EngineState {
  let state = initialState(seed, seats, "a");
  const deal = advance(state, { type: "startHand" });
  if (!deal.ok) throw new Error(deal.reason);
  state = deal.state;
  for (let step = 0; step < 5000; step++) {
    if (state.phase === "handOver") return state;
    let action: Action | null = null;
    for (const seat of seats) action ??= decide(state, seat);
    if (!action) throw new Error(`nobody can move in ${state.phase}`);
    const result = advance(state, action);
    if (!result.ok)
      throw new Error(`illegal ${JSON.stringify(action)}: ${result.reason}`);
    state = result.state;
  }
  throw new Error("the hand never ended");
}

test("computers play whole hands of Crazy Eights, 2 to 6 of them, with only legal moves", () => {
  for (const count of [2, 3, 4, 6]) {
    const seats = ["a", "b", "c", "d", "e", "f"].slice(0, count);
    for (const seed of [1, 7, 99])
      expect(playHand(seed, seats).phase).toBe("handOver");
  }
});

test("an eight is saved while another card plays", () => {
  const state = advance(initialState(3, ["a", "b"], "a"), {
    type: "startHand"
  });
  if (!state.ok) throw new Error(state.reason);
  const game = state.state;
  const seat = game.toAct!;
  const top = game.discardPile[game.discardPile.length - 1];
  const hand = [
    { rank: "8", suit: "clubs" },
    { rank: top.rank === "2" ? "3" : "2", suit: top.suit }
  ] as const;
  const action = decide(
    { ...game, activeSuit: top.suit, hands: { ...game.hands, [seat]: hand } },
    seat
  );
  expect(action).toMatchObject({ type: "play", card: { rank: hand[1].rank } });
});
