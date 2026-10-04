import type { Card } from "../cards.ts";

// What a game asks the canvas to show. A game's layout function turns its
// state and the canvas size into one of these; the engine (engine.ts) owns
// the sprites and moves them toward it. Coordinates are CSS pixels on the
// canvas, and x/y are a card's centre.

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface CardSpec {
  // Stable identity. A face-known card is keyed by the card itself
  // (cardKey), so moving it between zones - hand to trick, waste to column
  // - keeps its sprite and it slides. Hidden cards are keyed by role
  // ("opp:b:3") so the viewer never learns which they are.
  readonly key: string;
  // The face to show, or null for the back. Changing it flips the card.
  readonly face: Card | null;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  // Draw order; higher is on top.
  readonly z: number;
  // A multiplier on the card's colour: 0xffffff is as drawn, darker dims it.
  readonly tint?: number;
  // An outline drawn round the card: playable, picked, selected.
  readonly ring?: number | null;
  // Where a sprite created for this key first appears before sliding in
  // (a dealt card from the deck, an opponent's card from their seat).
  // Omitted, it appears in place.
  readonly spawn?: Point;
  // Where it goes when it leaves the table, fading on the way (a trick to
  // its winner, a passed card to its receiver). Omitted, it fades in place.
  readonly exit?: Point;
  readonly onTap?: () => void;
  // Cards sharing a row id (your hand) magnify under a touch swipe; the
  // engine reports the card a swipe ends on through SceneSpec.onSwipeEnd.
  readonly row?: string;
  // Draggable: `carry` is the keys that move with it, itself first (a
  // run of cards in a column). `onMove` follows the pointer, so a game can
  // re-lay out around the card while it is held (Gin's hand making room
  // for it). `onDrop` gets where it was released; if the game takes the
  // move the cards' new places follow, and if not they ease back.
  readonly drag?: {
    readonly carry: readonly string[];
    readonly onMove?: (at: Point) => void;
    readonly onDrop: (at: Point) => void;
  };
}

// An empty place a card could go: drawn as an outline, with an optional
// symbol ("♥", "K", "↻"), and tappable.
export interface SlotSpec {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly label?: string;
  readonly labelColor?: number;
  readonly onTap?: () => void;
}

// A small piece of text drawn on the felt (a pile count).
export interface TextSpec {
  readonly key: string;
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly size: number;
}

export interface SceneSpec {
  readonly cards: readonly CardSpec[];
  readonly slots?: readonly SlotSpec[];
  readonly texts?: readonly TextSpec[];
  // A touch swipe along a row ended over this card.
  readonly onSwipeEnd?: (key: string) => void;
}

// Cards are drawn at the faces' own aspect: height = width * CARD_ASPECT.
export const CARD_ASPECT = 1.45;

export const cardHeight = (w: number) => w * CARD_ASPECT;

// Shared colours, matching the DOM overlays in table.css.
export const ACCENT = 0x7fd1ff;
export const PICKED = 0xffd54f;
export const DIM = 0xa6a6a6;
