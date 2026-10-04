import type { Card, Suit } from "../cards.ts";

export const SUIT_SYMBOL: Record<Suit, string> = {
  clubs: "♣",
  diamonds: "♦",
  hearts: "♥",
  spades: "♠"
};

export function cardLabel(card: Card): string {
  return `${card.rank}${SUIT_SYMBOL[card.suit]}`;
}
