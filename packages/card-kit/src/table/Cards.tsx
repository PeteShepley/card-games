import type { ReactNode } from "react";
import { cardAssetUrl } from "../cardAssets.ts";
import type { Card } from "../cards.ts";
import { cardLabel } from "./labels.ts";

// The DOM table's building blocks, styled by table.css.

export function CardFace({ card }: { card: Card }) {
  return <img className="card" src={cardAssetUrl(card)} alt={cardLabel(card)} draggable={false} />;
}

export function CardBack({ mini = false }: { mini?: boolean }) {
  return <div className={`card card--back${mini ? " card--mini" : ""}`} />;
}

export function Nameplate({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <span className={`nameplate${active ? " nameplate--active" : ""}`}>
      <span className="nameplate__dot" />
      {children}
    </span>
  );
}

// Another player's seat: a fan of backs (capped, so a long hand still
// fits), their name and card count, and whatever detail the game adds
// (score, dealer badge, tricks taken).
export function OpponentSeat({
  name,
  count,
  active,
  badge,
  detail
}: {
  name: string;
  count: number;
  active: boolean;
  badge?: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <div className="opponent">
      <div className="opponent__fan" aria-hidden="true">
        {Array.from({ length: Math.min(count, 8) }, (_, index) => (
          <CardBack mini key={index} />
        ))}
      </div>
      <Nameplate active={active}>
        {name}
        <span className="opponent__count">{count} cards</span>
        {badge}
      </Nameplate>
      {detail && <span className="opponent__score">{detail}</span>}
    </div>
  );
}
