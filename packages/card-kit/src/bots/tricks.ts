import type { Card, Suit } from "../cards.ts";
import { rankValue, trickWinner } from "../tricks.ts";
import type { Played } from "../tricks.ts";

// What a trick-taking bot (Hearts, Spades) asks about the trick in front
// of it. Pure.

const ME = "\u0000me";

export const byRank = (a: Card, b: Card) =>
  rankValue(a.rank) - rankValue(b.rank);

export function lowest(cards: readonly Card[]): Card {
  return [...cards].sort(byRank)[0];
}

export function highest(cards: readonly Card[]): Card {
  return [...cards].sort(byRank)[cards.length - 1];
}

// Would playing `card` now take the trick as it stands?
export function winsNow(
  card: Card,
  trick: readonly Played[],
  trump: Suit | null = null
): boolean {
  return trickWinner([...trick, { seat: ME, card }], trump) === ME;
}

// The highest of `cards` that would not take the trick, if any: ducking
// with the most dangerous card you can safely shed.
export function highestLoser(
  cards: readonly Card[],
  trick: readonly Played[],
  trump: Suit | null = null
): Card | null {
  const losers = cards.filter((card) => !winsNow(card, trick, trump));
  return losers.length > 0 ? highest(losers) : null;
}

// The cheapest of `cards` that would take the trick, if any.
export function lowestWinner(
  cards: readonly Card[],
  trick: readonly Played[],
  trump: Suit | null = null
): Card | null {
  const winners = cards.filter((card) => winsNow(card, trick, trump));
  if (winners.length === 0) return null;
  // Trumping in: any trump beats any off-suit card, so the lowest trump.
  return [...winners].sort((a, b) => {
    if (trump && (a.suit === trump) !== (b.suit === trump))
      return a.suit === trump ? 1 : -1;
    return byRank(a, b);
  })[0];
}

export function suitCounts(hand: readonly Card[]): Record<Suit, number> {
  const counts: Record<Suit, number> = {
    clubs: 0,
    diamonds: 0,
    hearts: 0,
    spades: 0
  };
  for (const card of hand) counts[card.suit]++;
  return counts;
}
