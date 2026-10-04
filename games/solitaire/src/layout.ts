import { cardKey, SUITS } from "@card-games/card-kit/cards.ts";
import type { Card, Suit } from "@card-games/card-kit/cards.ts";
import { clamp } from "@card-games/card-kit/canvas/layout.ts";
import { cardHeight } from "@card-games/card-kit/canvas/spec.ts";
import type { Point } from "@card-games/card-kit/canvas/spec.ts";
import { COLUMNS } from "./engine/game.ts";
import type { EngineState, Target } from "./engine/game.ts";

// Where every card sits on the Solitaire table: under the DOM controls
// (`hudHeight`, measured), a top row - stock, waste, a gap, the four
// foundations - over seven columns. Everything is placed, all 52 cards,
// so each keeps its sprite and slides (or flips) wherever it moves. The
// columns' fans squeeze to fit the height rather than scroll.

export interface Placed {
  readonly card: Card;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly faceUp: boolean;
  readonly where: "stock" | "waste" | "foundation" | "tableau";
  readonly column?: number;
}

export interface SolitaireLayout {
  readonly cardW: number;
  readonly gap: number;
  readonly columnXs: readonly number[];
  readonly topY: number;
  readonly tableauY: number;
  readonly stock: Point;
  readonly waste: Point;
  readonly foundations: Readonly<Record<Suit, Point>>;
  readonly placed: readonly Placed[];
}

const DOWN = 0.12; // the fan's step over a face-down card, in card heights
const UP = 0.3; // ...and over a face-up one, enough to read its corner
const MIN_DOWN = 0.03;
const MIN_UP = 0.16;

export function solitaireLayout(game: EngineState, width: number, height: number, hudHeight: number): SolitaireLayout {
  const pad = clamp(Math.min(width, height) * 0.02, 6, 16);
  const gap = clamp(width * 0.012, 4, 10);
  const top = hudHeight + pad;
  // Seven across, and room for the top row plus about two more card
  // heights of column below it.
  const cardW = clamp(Math.min((width - pad * 2 - gap * 6) / COLUMNS, (height - top - pad - gap) / cardHeight(3.2)), 28, 120);
  const h = cardHeight(cardW);
  const left = (width - (cardW * COLUMNS + gap * (COLUMNS - 1))) / 2;
  const columnXs = Array.from({ length: COLUMNS }, (_, index) => left + cardW / 2 + index * (cardW + gap));
  const topY = top + h / 2;
  const tableauY = topY + h + gap * 1.5;
  const stock = { x: columnXs[0], y: topY };
  const waste = { x: columnXs[1], y: topY };
  const foundations = Object.fromEntries(SUITS.map((suit, index) => [suit, { x: columnXs[3 + index], y: topY }])) as Record<
    Suit,
    Point
  >;

  const placed: Placed[] = [];
  game.stock.forEach((card, index) =>
    placed.push({ card, ...stock, z: index, faceUp: false, where: "stock" })
  );
  // Draw-3 fans the top three waste cards across into the gap column.
  const shown = game.drawCount === 3 ? 3 : 1;
  const fanned = game.waste.length - shown;
  game.waste.forEach((card, index) => {
    const step = Math.max(0, index - fanned);
    placed.push({ card, x: waste.x + step * cardW * 0.35, y: topY, z: 100 + index, faceUp: true, where: "waste" });
  });
  for (const suit of SUITS) {
    game.foundations[suit].forEach((card, index) =>
      placed.push({ card, ...foundations[suit], z: 200 + index, faceUp: true, where: "foundation" })
    );
  }

  // A column's fan squeezes to fit above the bottom edge: face-up steps
  // keep a readable minimum, face-down ones give way first.
  const room = height - pad - tableauY - h / 2;
  game.tableau.forEach((column, index) => {
    const downs = column.down.length;
    const ups = Math.max(column.up.length - 1, 0);
    let down = DOWN * h;
    let up = UP * h;
    if (downs * down + ups * up > room) {
      const fit = room / (downs * down + ups * up);
      up = Math.max(MIN_UP * h, up * fit);
      down = downs > 0 ? Math.max(MIN_DOWN * h, Math.min(down, (room - ups * up) / downs)) : down;
      // A run so long that even the minimums overflow: tighten the face-up
      // steps past their minimum rather than run off the screen.
      if (downs * down + ups * up > room && ups > 0) up = Math.max(0, (room - downs * down) / ups);
    }
    let y = tableauY;
    column.down.forEach((card, row) => {
      placed.push({ card, x: columnXs[index], y, z: 300 + row, faceUp: false, where: "tableau", column: index });
      y += down;
    });
    column.up.forEach((card, row) => {
      placed.push({ card, x: columnXs[index], y, z: 300 + downs + row, faceUp: true, where: "tableau", column: index });
      y += up;
    });
  });

  return { cardW, gap, columnXs, topY, tableauY, stock, waste, foundations, placed };
}

// Where a card dropped at `at` is headed: a foundation if it lands on the
// top row's right side, otherwise the column it lands over.
export function dropTarget(layout: SolitaireLayout, at: Point): Target | null {
  const h = cardHeight(layout.cardW);
  const half = layout.cardW / 2 + layout.gap / 2;
  if (at.y < layout.topY + h / 2 + layout.gap) {
    const first = layout.columnXs[3];
    return at.x >= first - half ? { kind: "foundation" } : null;
  }
  const column = layout.columnXs.findIndex((x) => Math.abs(at.x - x) <= half);
  return column >= 0 ? { kind: "tableau", column } : null;
}

export const placedKey = (placed: Placed) => cardKey(placed.card);
