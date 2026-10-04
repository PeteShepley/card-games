import { clamp } from "./layout.ts";
import { cardHeight } from "./spec.ts";
import type { Point } from "./spec.ts";

// The frame every canvas table shares: opponents' fans along the top with
// their nameplates under them, then the play area, with the DOM controls
// either across the width above your hand (portrait) or - where height is
// what runs short, on a landscape screen - in a full-height column at the
// right, the play area to its left.

// Room under an opponent's fan for their DOM nameplate and detail line.
export const SEAT_LABEL_H = 44;

export interface SeatAnchor {
  // Centre of the fan of backs.
  readonly fan: Point;
  // Top centre of the nameplate under it.
  readonly label: Point;
  readonly fanMaxWidth: number;
}

// Where the DOM controls sit: their bottom edge (from the canvas bottom,
// as CSS `bottom`) and, on a landscape screen, the right-hand column they
// keep to.
export interface StackBox {
  readonly bottom: number;
  readonly column: { readonly right: number; readonly width: number; readonly maxHeight: number } | null;
}

export function seatAnchor(x: number, maxWidth: number, pad: number, miniW: number): SeatAnchor {
  const miniH = cardHeight(miniW);
  const fanY = pad + miniH / 2;
  return { fan: { x, y: fanY }, label: { x, y: fanY + miniH / 2 + 4 }, fanMaxWidth: maxWidth };
}

export function frameGeometry(width: number, height: number) {
  const pad = clamp(Math.min(width, height) * 0.025, 8, 16);
  const wide = width > height * 1.25;
  const miniW = clamp(Math.min(width, height) * 0.045, 14, 26);
  const topBottom = pad + cardHeight(miniW) + SEAT_LABEL_H;
  const columnW = wide ? clamp(width * 0.28, 180, 300) : 0;
  // The play area: the whole width, or left of the controls' column.
  const playLeft = pad;
  const playRight = wide ? width - columnW - pad * 2 : width - pad;
  return {
    pad,
    wide,
    miniW,
    topBottom,
    playLeft,
    playRight,
    playW: playRight - playLeft,
    // The height under the top row.
    below: height - topBottom - pad * 2,
    // Where the controls go, given the top of your hand.
    stackFor: (handTop: number): StackBox =>
      wide
        ? { bottom: pad, column: { right: pad, width: columnW, maxHeight: height - topBottom - pad * 2 } }
        : { bottom: height - handTop + 4, column: null }
  };
}

// Opponents evenly across the full width of the top row.
export function seatRow(count: number, width: number, pad: number, miniW: number): SeatAnchor[] {
  return Array.from({ length: count }, (_, index) =>
    seatAnchor((width * (index + 0.5)) / count, width / count - pad, pad, miniW)
  );
}

export type { Point };
