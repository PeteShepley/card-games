import type { Card, Suit } from "@card-games/card-kit/cards.ts";
import { SUITS } from "@card-games/card-kit/cards.ts";
import { legalActions, playableCards } from "./engine/game.ts";
import type { Action, EngineState, Seat } from "./engine/game.ts";
import { cardPoints } from "./engine/scoring.ts";

// The computer's Crazy Eights: shed the costliest playable card, keep to
// the suit it holds most of, save eights for when nothing else plays and
// then call its strongest suit; draw only when it must. Pure: what `seat`
// would do now, or null (dealing is the humans').

function strongestSuit(hand: readonly Card[]): Suit {
  const counts = new Map<Suit, number>(SUITS.map((suit) => [suit, 0]));
  for (const card of hand)
    if (card.rank !== "8") counts.set(card.suit, counts.get(card.suit)! + 1);
  return SUITS.reduce((best, suit) =>
    counts.get(suit)! > counts.get(best)! ? suit : best
  );
}

export function decide(state: EngineState, seat: Seat): Action | null {
  if (state.phase !== "play" || state.toAct !== seat) return null;
  const hand = state.hands[seat];
  const playable = playableCards(state, seat);
  const plain = playable.filter((card) => card.rank !== "8");
  if (plain.length > 0) {
    const suit = strongestSuit(hand);
    const worth = (card: Card) =>
      (card.suit === suit ? 100 : 0) + cardPoints(card.rank);
    const card = [...plain].sort((a, b) => worth(b) - worth(a))[0];
    return { type: "play", seat, card };
  }
  const eight = playable.find((card) => card.rank === "8");
  if (eight) {
    const rest = hand.filter((card) => card !== eight);
    return { type: "play", seat, card: eight, suit: strongestSuit(rest) };
  }
  const legal = legalActions(state, seat);
  if (legal.includes("draw")) return { type: "draw", seat };
  if (legal.includes("pass")) return { type: "pass", seat };
  return null;
}
