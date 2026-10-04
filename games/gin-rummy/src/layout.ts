// Where everything sits on the table. Both renderers need this: the Pixi
// scene draws cards at these coordinates, and the DOM overlay (HUD,
// nameplates) has to line up with them without duplicating the numbers.
// Pure geometry, so it is cheap enough to re-run on every resize frame and
// testable without a canvas.

// The card size the table was designed at. Everything else scales with it.
export const BASE_CARD_W = 90;
export const BASE_CARD_H = 126;
export const BASE_EDGE = 16;
export const BASE_GROUP_GAP = 22;
export const BASE_RAISE = 18;

// The viewport the base sizes assume. Below either figure the table scales
// down so the vertical stack - opponent row, piles, HUD band, your hand -
// still fits without overlapping.
const DESIGN_W = 900;
const DESIGN_H = 620;
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
const SHORT_MIN_SCALE = 0.45;

export interface TableMetrics {
  readonly scale: number;
  readonly cardW: number;
  readonly cardH: number;
  readonly edge: number;
  readonly groupGap: number;
  readonly raise: number;
  readonly stock: { readonly x: number; readonly y: number };
  readonly discard: { readonly x: number; readonly y: number };
  // Centre-y of the two card rows, and the top of the band the HUD occupies.
  readonly opponentY: number;
  readonly handY: number;
  readonly hudTop: number;
}

export function tableMetrics(width: number, height: number): TableMetrics {
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
    hudTop: height / 2 + cardH / 2 + HUD_GAP * scale
  };
}
