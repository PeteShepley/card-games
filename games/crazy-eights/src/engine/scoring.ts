import type { Card, Rank } from "@card-games/card-kit/cards.ts";

// What a card left in a loser's hand is worth to the winner: eights are
// the costly ones to be caught holding.
export function cardPoints(rank: Rank): number {
  if (rank === "8") return 50;
  if (rank === "A") return 1;
  if (rank === "J" || rank === "Q" || rank === "K") return 10;
  return Number(rank);
}

export function handPoints(hand: readonly Card[]): number {
  return hand.reduce((sum, card) => sum + cardPoints(card.rank), 0);
}
