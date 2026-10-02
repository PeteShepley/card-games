import type { ReactNode } from "react";
import type { Played } from "../tricks.ts";
import { CardFace } from "./Cards.tsx";
import type { Position } from "./seats.ts";

// The trick in a cross, each card in front of whoever played it. Between
// tricks a game can pass the last trick (shown dimmed, with a caption) so
// the fourth card is seen before the next lead.
export function TrickArea({
  trick,
  last,
  seatAt,
  caption,
  note
}: {
  trick: readonly Played[];
  last?: readonly Played[] | null;
  seatAt: Record<Position, string>;
  caption?: ReactNode;
  note?: ReactNode;
}) {
  const showingLast = trick.length === 0 && !!last;
  const cards = showingLast ? last! : trick;
  return (
    <div className={`trick${showingLast ? " trick--last" : ""}`}>
      {(["top", "left", "right", "bottom"] as const).map((position) => {
        const played = cards.find((each) => each.seat === seatAt[position]);
        return (
          <div className={`trick__slot trick__slot--${position}`} key={position}>
            {played && <CardFace card={played.card} />}
          </div>
        );
      })}
      {showingLast && caption && <span className="trick__caption">{caption}</span>}
      {note && <span className="trick__note">{note}</span>}
    </div>
  );
}
