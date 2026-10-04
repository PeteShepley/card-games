import { expect, test } from "vitest";
import { cardHeight } from "@card-games/card-kit/canvas/spec.ts";
import { initialState } from "./engine/game.ts";
import type { EngineState } from "./engine/game.ts";
import { dropTarget, solitaireLayout } from "./layout.ts";

const sizes = [
  [375, 667],
  [667, 375],
  [1280, 800]
] as const;

// A worst case for height: a column of six face-down cards under a full
// run of thirteen.
function tallColumn(): EngineState {
  const game = initialState(7);
  const all = game.tableau.flatMap((column) => [...column.down, ...column.up]);
  const tableau = game.tableau.map((_, index) =>
    index === 6 ? { down: all.slice(0, 6), up: all.slice(6, 19) } : { down: [], up: [] }
  );
  return { ...game, tableau };
}

for (const [width, height] of sizes) {
  test(`${width}x${height}: every card is placed once, on screen, the tallest column included`, () => {
    for (const game of [initialState(7), tallColumn()]) {
      const layout = solitaireLayout(game, width, height, 50);
      const h = cardHeight(layout.cardW);
      const keys = layout.placed.map((placed) => `${placed.card.rank}${placed.card.suit}`);
      expect(new Set(keys).size).toBe(keys.length);
      for (const placed of layout.placed) {
        expect(placed.x - layout.cardW / 2).toBeGreaterThanOrEqual(0);
        expect(placed.x + layout.cardW / 2).toBeLessThanOrEqual(width);
        expect(placed.y + h / 2).toBeLessThanOrEqual(height + 0.5);
        expect(placed.y - h / 2).toBeGreaterThanOrEqual(50);
      }
    }
  });
}

test("a fresh deal places all 52 cards", () => {
  expect(solitaireLayout(initialState(7), 375, 667, 50).placed).toHaveLength(52);
});

test("drops land on the column under them, or the foundations on the top row", () => {
  const layout = solitaireLayout(initialState(7), 1280, 800, 50);
  expect(dropTarget(layout, { x: layout.columnXs[4], y: layout.tableauY + 40 })).toEqual({ kind: "tableau", column: 4 });
  expect(dropTarget(layout, { x: layout.columnXs[5], y: layout.topY })).toEqual({ kind: "foundation" });
  expect(dropTarget(layout, { x: layout.columnXs[0], y: layout.topY })).toBeNull();
});
