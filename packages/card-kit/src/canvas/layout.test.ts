import { expect, test } from "vitest";
import type { Card } from "../cards.ts";
import { fanSpecs, handSpecs, rowXs } from "./layout.ts";
import { cardHeight } from "./spec.ts";

const cards: Card[] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"].map((rank) => ({
  rank,
  suit: "hearts"
})) as Card[];

test("a short row sits centred, cards a little apart", () => {
  const xs = rowXs(3, 200, 50, 1000);
  expect(xs[1]).toBe(200);
  expect(xs[2] - xs[1]).toBeGreaterThan(50);
});

test("a long row overlaps to fit its width exactly", () => {
  const xs = rowXs(13, 187.5, 50, 359);
  expect(xs[0] - 25).toBeCloseTo(187.5 - 359 / 2);
  expect(xs[12] + 25).toBeCloseTo(187.5 + 359 / 2);
});

test("hand cards rest on the bottom line and rise when live, picked or lifted", () => {
  const specs = handSpecs(cards, {
    cx: 200,
    maxWidth: 380,
    bottom: 600,
    w: 50,
    look: (card) => ({ live: card.rank === "2", picked: card.rank === "3", lifted: card.rank === "4", dim: card.rank === "5" }),
    onTap: () => {},
    spawn: { x: 0, y: 0 }
  });
  const h = cardHeight(50);
  expect(specs[4].y + h / 2).toBe(600);
  expect(specs[0].y).toBeLessThan(specs[4].y);
  expect(specs[1].y).toBeLessThan(specs[0].y);
  expect(specs[2].y).toBeLessThan(specs[1].y);
  expect(specs[3].tint).toBeDefined();
  expect(specs.every((spec) => spec.row === "hand")).toBe(true);
  // Later cards draw on top, as a held fan does.
  expect(specs[12].z).toBeGreaterThan(specs[0].z);
});

test("an opponent's fan is backs keyed by seat and place, not by card", () => {
  const fan = fanSpecs("b", 5, { x: 100, y: 40 }, 20, 200);
  expect(fan.map((spec) => spec.key)).toEqual(["opp:b:0", "opp:b:1", "opp:b:2", "opp:b:3", "opp:b:4"]);
  expect(fan.every((spec) => spec.face === null)).toBe(true);
  // Overlapping, so five minis take well under five widths.
  expect(fan[4].x - fan[0].x).toBeLessThan(4 * 20);
});
