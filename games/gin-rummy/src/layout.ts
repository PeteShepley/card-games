import type { CSSProperties } from "react";
import type { Card } from "@card-games/card-kit/cards.ts";
import { CARD_ASPECT } from "@card-games/card-kit/canvas/spec.ts";

// Where everything sits on the table. Both layers need this: the canvas
// draws cards at these coordinates, and the DOM overlay (HUD, nameplates)
// has to line up with them without duplicating the numbers.
// Pure geometry, so it is cheap enough to re-run on every resize frame and
// testable without a canvas.

// The card size the table was designed at. Everything else scales with it.
export const BASE_CARD_W = 90;
// Drawn at the card faces' own aspect, as the kit's canvas draws them.
export const BASE_CARD_H = BASE_CARD_W * CARD_ASPECT;
export const BASE_EDGE = 16;
export const BASE_GROUP_GAP = 22;
export const BASE_RAISE = 18;

// The viewport the base sizes assume. Below either figure the table scales
// down so the vertical stack - opponent row, piles, HUD band, your hand -
// still fits without overlapping.
const DESIGN_W = 900;
const DESIGN_H = 630;
const MIN_SCALE = 0.5;

// A portrait screen has height to spare and only needs the two piles side by
// side across its width - the hand rows close up to fit - so it scales by a
// narrower design width and the cards stay big enough to read on a phone.
const PORTRAIT_DESIGN_W = 600;

// Clearance between the bottom of the discard pile and the top of the HUD.
const HUD_GAP = 14;

// The height the HUD (status line plus a row of buttons) needs between the
// piles and your hand. The HUD is DOM text and does not shrink with the
// cards, so a short landscape phone scales the cards down to make room -
// a little past the usual floor if it has to.
const HUD_BAND = 88;
const SHORT_MIN_SCALE = 0.44;

// A landscape screen - where height is what runs short - moves the HUD and
// the feed out of the card stack into a column at the right, so the cards
// get the full height: opponent row, their nameplate, the piles, your hand.
const NAMEPLATE_H = 34; // DOM, so it does not scale
const PILE_GAP = 16;
const COLUMN_PAD = 12;
// The card stack's height per unit of scale: two edges, three card rows,
// the selected card's raise and a gap either side of the piles.
const WIDE_STACK = BASE_EDGE * 2 + BASE_CARD_H * 3 + BASE_RAISE + PILE_GAP * 2;
// Width to fit at full size: the piles, and an eleven-card hand overlapping
// to about six cards' width.
const WIDE_ROW = BASE_CARD_W * 6;
// A big landscape window grows the cards past their base size, up to this.
const WIDE_MAX_SCALE = 1.4;

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

// Where the DOM controls go on a landscape screen, as CSS offsets.
export interface ControlColumn {
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly width: number;
}

export interface TableMetrics {
  readonly scale: number;
  readonly cardW: number;
  readonly cardH: number;
  readonly edge: number;
  readonly groupGap: number;
  readonly raise: number;
  readonly stock: { readonly x: number; readonly y: number };
  readonly discard: { readonly x: number; readonly y: number };
  // Centre-y of the two card rows, and (portrait) the top of the band the
  // HUD occupies between the piles and the hand.
  readonly opponentY: number;
  readonly handY: number;
  readonly hudTop: number;
  // The area the cards use: the whole width, or (landscape) the part left
  // of the control column.
  readonly playX: number;
  readonly playWidth: number;
  readonly column: ControlColumn | null;
}

export function tableMetrics(width: number, height: number): TableMetrics {
  if (width > height * 1.25) return wideMetrics(width, height);
  const designW = height > width ? PORTRAIT_DESIGN_W : DESIGN_W;
  // From hand top to HUD top is height/2 less (edge + card + half a card +
  // HUD gap) at base size, each times the scale.
  const stack = BASE_EDGE + BASE_CARD_H * 1.5 + HUD_GAP;
  const fit = Math.max(
    MIN_SCALE,
    Math.min(1, width / designW, height / DESIGN_H)
  );
  const scale = Math.min(
    fit,
    Math.max(SHORT_MIN_SCALE, (height / 2 - HUD_BAND) / stack)
  );
  const cardW = BASE_CARD_W * scale;
  const cardH = BASE_CARD_H * scale;
  const edge = BASE_EDGE * scale;
  return {
    scale,
    cardW,
    cardH,
    edge,
    groupGap: BASE_GROUP_GAP * scale,
    raise: BASE_RAISE * scale,
    // The two piles straddle the centre, a card's width apart.
    stock: { x: width / 2 - cardW * 0.75, y: height / 2 },
    discard: { x: width / 2 + cardW * 0.75, y: height / 2 },
    opponentY: edge + cardH / 2,
    handY: height - edge - cardH / 2,
    hudTop: height / 2 + cardH / 2 + HUD_GAP * scale,
    playX: width / 2,
    playWidth: width,
    column: null
  };
}

function wideMetrics(width: number, height: number): TableMetrics {
  const columnW = clamp(width * 0.28, 190, 300);
  const playWidth = width - columnW - COLUMN_PAD * 2;
  const scale = clamp(Math.min((height - NAMEPLATE_H) / WIDE_STACK, playWidth / WIDE_ROW), SHORT_MIN_SCALE, WIDE_MAX_SCALE);
  const cardW = BASE_CARD_W * scale;
  const cardH = BASE_CARD_H * scale;
  const edge = BASE_EDGE * scale;
  const raise = BASE_RAISE * scale;
  const opponentY = edge + cardH / 2;
  const handY = height - edge - cardH / 2;
  // The piles sit midway between the opponent's nameplate and your hand.
  const pilesY = (opponentY + cardH / 2 + NAMEPLATE_H + handY - cardH / 2 - raise) / 2;
  const playX = playWidth / 2;
  return {
    scale,
    cardW,
    cardH,
    edge,
    groupGap: BASE_GROUP_GAP * scale,
    raise,
    stock: { x: playX - cardW * 0.75, y: pilesY },
    discard: { x: playX + cardW * 0.75, y: pilesY },
    opponentY,
    handY,
    hudTop: height,
    playX,
    playWidth,
    column: { right: COLUMN_PAD, top: COLUMN_PAD, bottom: COLUMN_PAD, width: columnW }
  };
}

// Lays out a row of card groups with a visible gap at group boundaries;
// a single group is a plain evenly-spaced row.
export function groupedXs(
  groups: readonly (readonly Card[])[],
  metrics: TableMetrics
): { held: Card; x: number }[] {
  const width = metrics.playWidth;
  const flat: { held: Card; group: number }[] = [];
  groups.forEach((group, index) => {
    for (const held of group) flat.push({ held, group: index });
  });
  if (flat.length === 0) return [];
  const boundaries = groups.filter((group) => group.length > 0).length - 1;
  const gaps = Math.max(boundaries, 0) * metrics.groupGap;
  const spacing = Math.min(
    metrics.cardW + 10 * metrics.scale,
    (width - metrics.cardW - metrics.edge * 2 - gaps) /
      Math.max(flat.length - 1, 1)
  );
  let x = metrics.playX - (spacing * (flat.length - 1) + gaps) / 2;
  return flat.map((entry, index) => {
    if (index > 0) {
      x += spacing;
      if (entry.group !== flat[index - 1].group) x += metrics.groupGap;
    }
    return { held: entry.held, x };
  });
}

// On a landscape screen the HUD (and the feed) leave the card stack for a
// column at the right, so the cards get the full height.
export function inColumn(column: ControlColumn): CSSProperties {
  return {
    left: "auto",
    right: `${column.right}px`,
    width: `${column.width}px`,
    maxWidth: "none",
    boxSizing: "border-box",
    transform: "none"
  };
}
