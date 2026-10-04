import { cardKey } from "../cards.ts";
import type { Card } from "../cards.ts";
import { ACCENT, DIM, PICKED, cardHeight } from "./spec.ts";
import type { CardSpec, Point } from "./spec.ts";

// Layout pieces the games share. Pure geometry, so each game's layout is a
// testable function of its state and the canvas size.

export const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

// Centres for `count` cards of width `w` in a row centred on `cx`, spaced
// `w + gap` apart if they fit within `maxWidth`, overlapping more if not.
export function rowXs(count: number, cx: number, w: number, maxWidth: number, gap = w * 0.06): number[] {
  if (count === 0) return [];
  const spacing = count === 1 ? 0 : Math.min(w + gap, (maxWidth - w) / (count - 1));
  const first = cx - (spacing * (count - 1)) / 2;
  return Array.from({ length: count }, (_, index) => first + index * spacing);
}

// How a card in your hand looks right now.
export interface HandCardLook {
  // Playable now: ringed and raised a little.
  live?: boolean;
  // Lifted by a first tap or a swipe, waiting for the tap that plays it.
  lifted?: boolean;
  // Chosen (cards to pass): ringed gold and raised.
  picked?: boolean;
  // Not playable on your turn: darkened.
  dim?: boolean;
}

// Your hand along the bottom of the table. `bottom` is the lowest the cards
// may reach; raised cards rise from there. The cards form the "hand" row,
// so a touch swipe along them magnifies them.
export function handSpecs(
  cards: readonly Card[],
  options: {
    cx: number;
    maxWidth: number;
    bottom: number;
    w: number;
    look: (card: Card) => HandCardLook;
    onTap: (card: Card) => void;
    // Where a newly dealt card flies in from.
    spawn: Point;
    // Where a card leaving the hand goes (a passed card to its receiver).
    exit?: Point;
    z?: number;
  }
): CardSpec[] {
  const { w } = options;
  const h = cardHeight(w);
  const restY = options.bottom - h / 2;
  const xs = rowXs(cards.length, options.cx, w, options.maxWidth);
  return cards.map((card, index) => {
    const look = options.look(card);
    const raise = look.lifted ? 0.3 : look.picked ? 0.22 : look.live ? 0.1 : 0;
    return {
      key: cardKey(card),
      face: card,
      x: xs[index],
      y: restY - raise * h,
      w,
      z: (options.z ?? 100) + index,
      tint: look.dim ? DIM : undefined,
      ring: look.lifted ? 0xffffff : look.picked ? PICKED : look.live ? ACCENT : null,
      spawn: options.spawn,
      exit: options.exit,
      onTap: () => options.onTap(card),
      row: "hand"
    };
  });
}

// The room your hand needs above `bottom`, raised cards included.
export const handHeight = (w: number) => cardHeight(w) * 1.3;

// Another player's hand as a small overlapping fan of backs centred on
// `at`. Keyed by seat and position, never by card.
// `spawn` is where a card new to the fan flies in from (the deck, the stock).
export function fanSpecs(
  seat: string,
  count: number,
  at: Point,
  w: number,
  maxWidth: number,
  spawn?: Point
): CardSpec[] {
  return rowXs(count, at.x, w, maxWidth, -w * 0.55).map((x, index) => ({
    key: `opp:${seat}:${index}`,
    face: null,
    x,
    y: at.y,
    w,
    z: index,
    spawn
  }));
}
