import { useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Card } from "../cards.ts";
import { cardKey } from "../cards.ts";
import { seatPositions } from "../table/seats.ts";
import type { Position } from "../table/seats.ts";
import type { Played } from "../tricks.ts";
import { CardCanvas } from "./CardCanvas.tsx";
import type { CanvasSize } from "./CardCanvas.tsx";
import { HandButtons, SeatLabel } from "./dom.tsx";
import { fourSeatGeometry, trickSpecs } from "./fourSeat.ts";
import { fanSpecs, handSpecs } from "./layout.ts";
import type { HandCardLook } from "./layout.ts";
import type { SceneSpec } from "./spec.ts";
import { useElementHeight } from "./useElementHeight.ts";

// A four-seat trick table on the canvas (Hearts, Spades): opponents' fans
// across the top with their nameplates, the trick in a cross, your hand
// along the bottom, and the game's own controls (`stack`) above the hand -
// or, on a landscape screen, in a column at the right. The game supplies
// the words and the rules; this lays out and draws.

export interface SeatInfo {
  name: string;
  count: number;
  active: boolean;
  badge?: ReactNode;
  detail?: ReactNode;
}

export function FourSeatTable({
  seats,
  perspective,
  seatInfo,
  trick,
  lastTrick,
  caption,
  note,
  hand,
  look,
  onCardTap,
  onSwipeEnd,
  handExitTo,
  canActivate,
  onActivate,
  stack,
  center,
  banner,
  overlay
}: {
  seats: readonly string[];
  perspective: string;
  seatInfo: (seat: string) => SeatInfo;
  trick: readonly Played[];
  lastTrick: { readonly cards: readonly Played[]; readonly winner: string } | null;
  // Shown over the last trick between tricks ("Bea took it").
  caption?: ReactNode;
  // Shown under the trick ("♥ broken").
  note?: ReactNode;
  hand: readonly Card[];
  look: (card: Card) => HandCardLook;
  onCardTap: (card: Card) => void;
  onSwipeEnd: (card: Card) => void;
  // A seat your hand's departing cards fly to (passing), if any.
  handExitTo?: string | null;
  // The hidden keyboard/screen-reader buttons for your hand.
  canActivate: (card: Card) => boolean;
  onActivate: (card: Card) => void;
  stack: ReactNode;
  // Over the trick area while it is empty (Spades' bid buttons).
  center?: ReactNode;
  banner?: ReactNode;
  overlay?: ReactNode;
}) {
  const [size, setSize] = useState<CanvasSize | null>(null);
  const stackRef = useRef<HTMLDivElement>(null);
  const stackHeight = useElementHeight(stackRef);
  const seatAt = seatPositions(seats, perspective);
  const positionOf = (seat: string): Position =>
    (Object.keys(seatAt) as Position[]).find((position) => seatAt[position] === seat) ?? "bottom";

  const geometry = size ? fourSeatGeometry(size.width, size.height, stackHeight) : null;
  let spec: SceneSpec | null = null;
  if (geometry) {
    const opponents = (["left", "top", "right"] as const).flatMap((position) => {
      const seat = seatAt[position];
      const anchor = geometry.seats[position];
      return fanSpecs(seat, seatInfo(seat).count, anchor.fan, geometry.miniW, anchor.fanMaxWidth, geometry.trickCenter);
    });
    const byKey = new Map(hand.map((card) => [cardKey(card), card]));
    spec = {
      cards: [
        ...opponents,
        ...trickSpecs(geometry, trick, lastTrick, positionOf),
        ...handSpecs(hand, {
          cx: geometry.handCenterX,
          maxWidth: geometry.handMaxWidth,
          bottom: geometry.handBottom,
          w: geometry.cardW,
          look,
          onTap: onCardTap,
          spawn: geometry.trickCenter,
          exit: handExitTo ? geometry.seats[positionOf(handExitTo) as Exclude<Position, "bottom">]?.fan : undefined
        })
      ],
      onSwipeEnd: (key) => {
        const card = byKey.get(key);
        if (card) onSwipeEnd(card);
      }
    };
  }

  const showingLast = trick.length === 0 && !!lastTrick;
  const column = geometry?.stack.column;
  return (
    <div className="table table--canvas">
      <CardCanvas spec={spec} onSize={setSize} />
      {banner}
      {geometry &&
        (["left", "top", "right"] as const).map((position) => {
          const seat = seatAt[position];
          return (
            <SeatLabel
              key={position}
              at={geometry.seats[position].label}
              maxWidth={geometry.seats[position].fanMaxWidth}
              {...seatInfo(seat)}
            />
          );
        })}
      {geometry && showingLast && caption && (
        <span className="trick-caption" style={{ left: geometry.trickCenter.x, top: geometry.trickCenter.y }}>
          {caption}
        </span>
      )}
      {geometry && note && (
        <span
          className="trick-note"
          style={{ left: geometry.trickCenter.x, top: geometry.trick.bottom.y + geometry.trickW * 0.85 }}
        >
          {note}
        </span>
      )}
      {geometry && center && (
        <div className="trick-center" style={{ left: geometry.trickCenter.x, top: geometry.trickCenter.y }}>
          {center}
        </div>
      )}
      <div
        ref={stackRef}
        className={`stack${column ? " stack--column" : ""}`}
        style={
          geometry
            ? {
                bottom: geometry.stack.bottom,
                ...(column ? { right: column.right, width: column.width, maxHeight: column.maxHeight } : {})
              }
            : { visibility: "hidden" }
        }
      >
        {stack}
      </div>
      <HandButtons cards={hand} enabled={canActivate} onActivate={onActivate} />
      {overlay}
    </div>
  );
}
