import type { Card, Rank, Suit } from "./cards.ts";

// Trick-taking primitives, game-agnostic: follow suit, and the highest card
// of the suit led (or of trump, when a game has one) takes the trick.
// Hearts plays without trump; Spades passes "spades".

export type Seat = string;

export interface Played {
  readonly seat: Seat;
  readonly card: Card;
}

// Ace high.
const RANK_ORDER: readonly Rank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

export function rankValue(rank: Rank): number {
  return RANK_ORDER.indexOf(rank);
}

export function ledSuit(trick: readonly Played[]): Suit | null {
  return trick[0]?.card.suit ?? null;
}

// The cards a player may follow with: their cards of the suit led, or
// anything when void in it (or when leading).
export function followable(hand: readonly Card[], trick: readonly Played[]): Card[] {
  const led = ledSuit(trick);
  if (!led) return [...hand];
  const following = hand.filter((card) => card.suit === led);
  return following.length > 0 ? following : [...hand];
}

export function trickWinner(trick: readonly Played[], trump: Suit | null = null): Seat {
  if (trick.length === 0) throw new Error("an empty trick has no winner");
  const led = ledSuit(trick)!;
  const beats = (a: Card, b: Card) => {
    if (a.suit === b.suit) return rankValue(a.rank) > rankValue(b.rank);
    if (trump && a.suit === trump) return true;
    if (trump && b.suit === trump) return false;
    return a.suit === led && b.suit !== led;
  };
  let best = trick[0];
  for (const played of trick.slice(1)) if (beats(played.card, best.card)) best = played;
  return best.seat;
}

// Display order within a hand: by suit, then ace-high rank.
const SUIT_ORDER: readonly Suit[] = ["clubs", "diamonds", "spades", "hearts"];

export function sortHand(hand: readonly Card[]): Card[] {
  return [...hand].sort(
    (a, b) =>
      SUIT_ORDER.indexOf(a.suit) - SUIT_ORDER.indexOf(b.suit) || rankValue(a.rank) - rankValue(b.rank)
  );
}
