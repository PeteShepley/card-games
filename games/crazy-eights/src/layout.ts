import { frameGeometry, seatRow } from "@card-games/card-kit/canvas/frame.ts";
import type { SeatAnchor, StackBox } from "@card-games/card-kit/canvas/frame.ts";
import { clamp, handHeight } from "@card-games/card-kit/canvas/layout.ts";
import { cardHeight } from "@card-games/card-kit/canvas/spec.ts";
import type { Point } from "@card-games/card-kit/canvas/spec.ts";

// Where everything goes on the Crazy Eights table: the other players' fans
// across the top, the stock and the discard pile in the middle, your hand
// along the bottom, the controls (`stackHeight`, measured) above the hand
// or - landscape - in a column at the right.

export interface EightsGeometry {
  readonly cardW: number;
  readonly pileW: number;
  readonly miniW: number;
  readonly seats: readonly SeatAnchor[];
  readonly stock: Point;
  readonly discard: Point;
  // Centre of the stock's count, under it.
  readonly countY: number;
  readonly handBottom: number;
  readonly handTop: number;
  readonly handCenterX: number;
  readonly handMaxWidth: number;
  readonly stack: StackBox;
}

// Room under the piles for the stock's count.
const COUNT_H = 22;

export function eightsGeometry(width: number, height: number, stackHeight: number, opponents: number): EightsGeometry {
  const { pad, wide, miniW, topBottom, playLeft, playRight, playW, below, stackFor } = frameGeometry(width, height);
  // The piles (at 0.9 size) and their count, then the hand with its raise.
  const piles = 0.9 * cardHeight(1);
  const cardW = clamp(
    wide
      ? Math.min((below - COUNT_H) / (piles + handHeight(1)), playW / 3)
      : Math.min((below - stackHeight - COUNT_H) / (piles + handHeight(1)), width / 5),
    34,
    130
  );
  const pileW = cardW * 0.9;
  const handBottom = height - pad;
  const handTop = handBottom - handHeight(cardW);
  const floor = wide ? handTop : handTop - stackHeight;
  const cy = Math.max(topBottom + cardHeight(pileW) / 2, (topBottom + floor - COUNT_H) / 2);
  const cx = (playLeft + playRight) / 2;
  return {
    cardW,
    pileW,
    miniW,
    seats: seatRow(opponents, width, pad, miniW),
    stock: { x: cx - pileW * 0.7, y: cy },
    discard: { x: cx + pileW * 0.7, y: cy },
    countY: cy + cardHeight(pileW) / 2 + COUNT_H / 2,
    handBottom,
    handTop,
    handCenterX: cx,
    handMaxWidth: playW,
    stack: stackFor(handTop)
  };
}
