import { expect, test } from "vitest";
import { SEAT_LABEL_H } from "@card-games/card-kit/canvas/frame.ts";
import { cardHeight } from "@card-games/card-kit/canvas/spec.ts";
import { eightsGeometry } from "./layout.ts";

const sizes = [
  [375, 667],
  [667, 375],
  [1280, 800]
] as const;

for (const [width, height] of sizes) {
  for (const opponents of [1, 3, 5]) {
    test(`${width}x${height}, ${opponents} opponents: piles clear the seats and the controls`, () => {
      const stack = 100;
      const g = eightsGeometry(width, height, stack, opponents);
      const pileH = cardHeight(g.pileW);
      expect(g.stock.y - pileH / 2).toBeGreaterThanOrEqual(g.seats[0].label.y + SEAT_LABEL_H - 6);
      const floor = g.stack.column ? g.handTop : height - g.stack.bottom - stack;
      expect(g.countY + 11).toBeLessThanOrEqual(floor + 1);
      expect(g.handBottom).toBeLessThanOrEqual(height);
      // Seats spread across the width without overlapping.
      for (let i = 1; i < g.seats.length; i++) {
        expect(g.seats[i].fan.x - g.seats[i - 1].fan.x).toBeGreaterThanOrEqual(g.seats[i - 1].fanMaxWidth);
      }
      if (g.stack.column) {
        const columnLeft = width - g.stack.column.right - g.stack.column.width;
        expect(g.discard.x + g.pileW / 2).toBeLessThanOrEqual(columnLeft);
        expect(g.handCenterX + g.handMaxWidth / 2).toBeLessThanOrEqual(columnLeft);
      }
    });
  }
}

test("a landscape phone's cards are well above the DOM table's 41px", () => {
  expect(eightsGeometry(667, 375, 100, 3).cardW).toBeGreaterThan(55);
});
