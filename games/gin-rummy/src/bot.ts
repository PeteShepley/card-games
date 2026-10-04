import { sameCard } from "@card-games/card-kit/cards.ts";
import type { Card } from "@card-games/card-kit/cards.ts";
import { legalActions } from "./engine/game.ts";
import type { Action, EngineState, Seat } from "./engine/game.ts";
import { minDeadwood } from "./engine/melds.ts";

// The computer's gin: take the upcard or the discard only when it lowers
// the deadwood it can get down to, otherwise draw blind; discard whatever
// leaves the least deadwood (never the card just taken), and declare gin
// the moment it has it. Pure: what `seat` would do now, or null.

// The least deadwood holding `hand` after its best discard, and that discard.
export function bestDiscard(
  hand: readonly Card[],
  keep: Card | null
): { card: Card; deadwood: number } {
  let best: { card: Card; deadwood: number } | null = null;
  for (const card of hand) {
    if (keep && sameCard(card, keep)) continue;
    const deadwood = minDeadwood(hand.filter((each) => each !== card));
    if (!best || deadwood < best.deadwood) best = { card, deadwood };
  }
  return best!;
}

function improves(hand: readonly Card[], card: Card): boolean {
  return bestDiscard([...hand, card], card).deadwood < minDeadwood(hand);
}

// Takes any seat id, as the kit's bot harness hands them out; gin only
// ever seats 'a' and 'b'.
export function decide(state: EngineState, seatId: string): Action | null {
  if (seatId !== "a" && seatId !== "b") return null;
  const seat: Seat = seatId;
  if (state.toAct !== seat) return null;
  const legal = legalActions(state, seat);
  const hand = state.hands[seat];
  const top = state.discardPile[state.discardPile.length - 1] ?? null;

  if (legal.includes("takeUpcard")) {
    return top && improves(hand, top)
      ? { type: "takeUpcard", seat }
      : { type: "passUpcard", seat };
  }
  if (legal.includes("drawDiscard") && top && improves(hand, top))
    return { type: "drawDiscard", seat };
  if (legal.includes("drawStock")) return { type: "drawStock", seat };
  if (legal.includes("discard")) {
    const { card, deadwood } = bestDiscard(hand, state.takenFromDiscard);
    return { type: "discard", seat, card, declareGin: deadwood === 0 };
  }
  return null;
}
