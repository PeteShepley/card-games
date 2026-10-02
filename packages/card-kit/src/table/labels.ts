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

// How much neighbouring cards in a hand overlap (a fraction of a card's
// width, fed to table.css as --squeeze): barely at all for a normal hand,
// more as it grows, so a long hand still fits one row.
export function squeeze(count: number, comfortable = 7): number {
  return count <= comfortable ? 0.05 : Math.min(0.72, 1 - comfortable / count);
}
