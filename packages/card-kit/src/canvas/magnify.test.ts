import { expect, test } from "vitest";
import { focusAt, magnification } from "./magnify.ts";

// Five cards 40px wide, overlapped so each shows a 20px strip: lefts at
// 0, 20, 40, 60, 80, the last one whole to 120.
const lefts = [0, 20, 40, 60, 80];

test("the finger's place along the hand is measured in visible strips", () => {
  expect(focusAt(10, lefts, 120)).toBeCloseTo(0.5);
  expect(focusAt(45, lefts, 120)).toBeCloseTo(2.25);
  // The last card shows whole, so its strip is the full card.
  expect(focusAt(100, lefts, 120)).toBeCloseTo(4.5);
});

test("a finger off either end clamps to the end cards", () => {
  expect(Math.floor(focusAt(-30, lefts, 120))).toBe(0);
  expect(Math.floor(focusAt(500, lefts, 120))).toBe(4);
});

test("the card under the finger grows most, its neighbours less, far cards not at all", () => {
  const focus = 2.5;
  const mags = [0, 1, 2, 3, 4].map((index) => magnification(index, focus));
  expect(mags[2]).toBeCloseTo(1.8);
  expect(mags[1]).toBeLessThan(mags[2]);
  expect(mags[1]).toBeCloseTo(mags[3]);
  expect(mags[1]).toBeGreaterThan(1.2);
  expect(mags[0]).toBeLessThan(1.05);
});
