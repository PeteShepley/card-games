import type { ReactNode } from "react";
import type { Card } from "../cards.ts";
import { cardKey } from "../cards.ts";
import { Nameplate } from "../table/Cards.tsx";
import { cardLabel } from "../table/labels.ts";

// The DOM that sits over a canvas table: the canvas draws the cards, these
// carry the words and the controls.

// An opponent's nameplate, under their fan on the canvas.
export function SeatLabel({
  at,
  name,
  count,
  active,
  badge,
  detail,
  maxWidth
}: {
  at: { x: number; y: number };
  name: string;
  count: number;
  active: boolean;
  badge?: ReactNode;
  detail?: ReactNode;
  maxWidth: number;
}) {
  return (
    <div className="seat-label" style={{ left: at.x, top: at.y, maxWidth }}>
      <Nameplate active={active}>
        {name}
        <span className="opponent__count">{count} cards</span>
        {badge}
      </Nameplate>
      {detail && <span className="opponent__score">{detail}</span>}
    </div>
  );
}

// The hand as real buttons, visually hidden: a keyboard or screen reader
// can still play a card on a canvas table. They act at once (no lift).
export function HandButtons({
  cards,
  enabled,
  onActivate,
  label = "Your hand"
}: {
  cards: readonly Card[];
  enabled: (card: Card) => boolean;
  onActivate: (card: Card) => void;
  label?: string;
}) {
  return (
    <div className="sr-only" role="group" aria-label={label}>
      {cards.map((card) => (
        <button type="button" key={cardKey(card)} disabled={!enabled(card)} onClick={() => onActivate(card)}>
          {cardLabel(card)}
        </button>
      ))}
    </div>
  );
}
