import { expect, test } from "vitest";
import { fourSeatGeometry, SEAT_LABEL_H } from "./fourSeat.ts";
import { cardHeight } from "./spec.ts";

const sizes = [
  [375, 667],
  [390, 844],
  [667, 375],
  [844, 390],
  [1280, 800]
] as const;

for (const [width, height] of sizes) {
  test(`${width}x${height}: the trick clears the seats and the controls, the hand is on screen`, () => {
    const stack = 110;
    const g = fourSeatGeometry(width, height, stack);
    const trickH = cardHeight(g.trickW);
    const trickTop = g.trick.top.y - trickH / 2;
    const trickBottom = g.trick.bottom.y + trickH / 2;
    const stackBottomY = height - g.stack.bottom;
    // Clear of the top row's nameplates...
    expect(trickTop).toBeGreaterThanOrEqual(g.seats.top.label.y + SEAT_LABEL_H - 6);
    if (g.stack.column) {
      // ...left of the controls' column - trick and hand both - which runs
      // from under the top row to the bottom...
      const columnLeft = width - g.stack.column.right - g.stack.column.width;
      expect(g.trick.right.x + g.trickW / 2).toBeLessThanOrEqual(columnLeft);
      expect(g.handCenterX + g.handMaxWidth / 2).toBeLessThanOrEqual(columnLeft);
      expect(stackBottomY - g.stack.column.maxHeight).toBeGreaterThanOrEqual(g.seats.right.label.y + SEAT_LABEL_H - 6);
      expect(trickBottom).toBeLessThanOrEqual(g.handTop + 1);
    } else {
      // ...or above the controls, which sit above the hand.
      expect(trickBottom).toBeLessThanOrEqual(stackBottomY - stack + 1);
    }
    expect(g.handBottom).toBeLessThanOrEqual(height);
    expect(g.cardW).toBeGreaterThanOrEqual(34);
  });
}

test("the three seats' nameplates never overlap", () => {
  for (const [width, height] of sizes) {
    const g = fourSeatGeometry(width, height, 110);
    expect(g.seats.top.fan.x - g.seats.left.fan.x).toBeGreaterThanOrEqual(g.seats.left.fanMaxWidth);
    expect(g.seats.right.fan.x - g.seats.top.fan.x).toBeGreaterThanOrEqual(g.seats.top.fanMaxWidth);
  }
});

test("a landscape phone moves the controls into a side column, a portrait one keeps them across", () => {
  expect(fourSeatGeometry(667, 375, 110).stack.column).not.toBeNull();
  expect(fourSeatGeometry(375, 667, 110).stack.column).toBeNull();
});

test("landscape phone cards come out well above the DOM table's 41px", () => {
  expect(fourSeatGeometry(667, 375, 110).cardW).toBeGreaterThan(55);
});
