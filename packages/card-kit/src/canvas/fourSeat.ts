import type { Position } from "../table/seats.ts";
import type { Played } from "../tricks.ts";
import { cardKey } from "../cards.ts";
import { frameGeometry, seatAnchor } from "./frame.ts";
import type { SeatAnchor, StackBox } from "./frame.ts";
import { clamp, handHeight } from "./layout.ts";
import { DIM, cardHeight } from "./spec.ts";
import type { CardSpec, Point } from "./spec.ts";

// Where everything goes on a four-seat trick table (Hearts, Spades): three
// opponents' fans across the top, the trick in a cross, your hand along
// the bottom, and the DOM controls (`stackHeight`, measured) above the
// hand. On a portrait screen the controls span the width between the trick
// and the hand; on a landscape one - where height is what runs short - the
// table splits: the trick and your hand on the left, the controls in a
// full-height column on the right, so the cards get the whole height.

export { SEAT_LABEL_H } from "./frame.ts";
export type { SeatAnchor, StackBox } from "./frame.ts";

export interface FourSeatGeometry {
  readonly width: number;
  readonly height: number;
  readonly wide: boolean;
  // Your hand's card width, and the trick's.
  readonly cardW: number;
  readonly trickW: number;
  readonly miniW: number;
  readonly seats: Readonly<Record<Exclude<Position, "bottom">, SeatAnchor>>;
  readonly trick: Readonly<Record<Position, Point>>;
  readonly trickCenter: Point;
  readonly handBottom: number;
  readonly handTop: number;
  readonly handCenterX: number;
  readonly handMaxWidth: number;
  readonly stack: StackBox;
}

export function fourSeatGeometry(width: number, height: number, stackHeight: number): FourSeatGeometry {
  const { pad, wide, miniW, topBottom, playLeft, playRight, playW, stackFor } = frameGeometry(width, height);

  // The trick (cards at 0.8 size, in a cross) needs about 2.55 hand-card
  // widths of height and the hand with its raise about 1.9. Portrait, the
  // controls take their height out of the same column.
  const below = height - topBottom - pad * 2;
  const cardW = clamp(
    wide ? Math.min(below / 4.45, playW / 2.7) : Math.min((below - stackHeight) / 4.45, width / 5),
    34,
    130
  );
  const trickW = cardW * 0.8;
  const trickH = cardHeight(trickW);

  const handBottom = height - pad;
  const handTop = handBottom - handHeight(cardW);
  const trickFloor = wide ? handTop : handTop - stackHeight;
  const cy = Math.max(topBottom + trickH * 1.1, (topBottom + trickFloor) / 2);
  const cx = (playLeft + playRight) / 2;
  const dx = trickW * 1.1;
  const dy = trickH * 0.6;

  const anchor = (x: number, maxWidth: number) => seatAnchor(x, maxWidth, pad, miniW);

  return {
    width,
    height,
    wide,
    cardW,
    trickW,
    miniW,
    seats: {
      left: anchor(width / 6, width / 3 - pad),
      // The top row spans the full width even when the play area doesn't.
      top: anchor(width / 2, width / 3 - pad),
      right: anchor((width * 5) / 6, width / 3 - pad)
    },
    trick: {
      top: { x: cx, y: cy - dy },
      bottom: { x: cx, y: cy + dy },
      left: { x: cx - dx, y: cy },
      right: { x: cx + dx, y: cy }
    },
    trickCenter: { x: cx, y: cy },
    handBottom,
    handTop,
    handCenterX: cx,
    handMaxWidth: playW,
    stack: stackFor(handTop)
  };
}

// The trick in its cross, each card in front of whoever played it and
// flying in from their seat. Between tricks the last one shows dimmed, and
// when it goes it flies to the seat that won it.
export function trickSpecs(
  geometry: FourSeatGeometry,
  trick: readonly Played[],
  last: { readonly cards: readonly Played[]; readonly winner: string } | null,
  positionOf: (seat: string) => Position
): CardSpec[] {
  const showingLast = trick.length === 0 && !!last;
  const cards = showingLast ? last!.cards : trick;
  const seatPoint = (seat: string): Point => {
    const position = positionOf(seat);
    return position === "bottom" ? { x: geometry.handCenterX, y: geometry.handTop } : geometry.seats[position].fan;
  };
  return cards.map((played, index) => {
    const position = positionOf(played.seat);
    return {
      key: cardKey(played.card),
      face: played.card,
      ...geometry.trick[position],
      w: geometry.trickW,
      z: 50 + index,
      tint: showingLast ? DIM : undefined,
      spawn: seatPoint(played.seat),
      exit: last ? seatPoint(last.winner) : undefined
    };
  });
}
