import { expect, test } from "vitest";
import type { Card } from "@card-games/card-kit/cards.ts";
import { BASE_CARD_H, BASE_CARD_W, BASE_EDGE, groupedXs, tableMetrics } from "./layout.ts";

// The design viewport: at or above it nothing shrinks, so these assertions
// also pin the geometry the table was built against.
const WIDE = 1200;
const TALL = 800;

test("a viewport at or above the design size renders cards at full size", () => {
  const metrics = tableMetrics(WIDE, TALL);
  expect(metrics.scale).toBe(1);
  expect(metrics.cardW).toBe(BASE_CARD_W);
  expect(metrics.cardH).toBe(BASE_CARD_H);
  expect(metrics.edge).toBe(BASE_EDGE);
});

test("the two piles straddle the centre of the table", () => {
  const metrics = tableMetrics(WIDE, TALL);
  expect(metrics.stock.x).toBeLessThan(WIDE / 2);
  expect(metrics.discard.x).toBeGreaterThan(WIDE / 2);
  expect(WIDE / 2 - metrics.stock.x).toBe(metrics.discard.x - WIDE / 2);
  expect(metrics.stock.y).toBe(TALL / 2);
  expect(metrics.discard.y).toBe(TALL / 2);
});

test("the card rows sit one edge in from the top and bottom", () => {
  const metrics = tableMetrics(WIDE, TALL);
  expect(metrics.opponentY).toBe(BASE_EDGE + BASE_CARD_H / 2);
  expect(metrics.handY).toBe(TALL - BASE_EDGE - BASE_CARD_H / 2);
});

test("the HUD band starts below the piles and above the hand", () => {
  const metrics = tableMetrics(WIDE, TALL);
  expect(metrics.hudTop).toBeGreaterThan(metrics.discard.y + metrics.cardH / 2);
  expect(metrics.hudTop).toBeLessThan(metrics.handY - metrics.cardH / 2);
});

test("a small viewport scales the cards down rather than overlapping the rows", () => {
  // A portrait phone: the design height is what bites here.
  const metrics = tableMetrics(390, 844);
  expect(metrics.scale).toBeLessThan(1);
  expect(metrics.cardW).toBeLessThan(BASE_CARD_W);
  expect(metrics.opponentY + metrics.cardH / 2).toBeLessThan(
    metrics.stock.y - metrics.cardH / 2
  );
  expect(metrics.hudTop).toBeLessThan(metrics.handY - metrics.cardH / 2);
});

test("scaling never collapses the table past the readable floor", () => {
  // Narrow but tall enough for the HUD: the usual floor.
  expect(tableMetrics(200, 700).scale).toBe(0.5);
  expect(tableMetrics(200, 700).cardW).toBe(BASE_CARD_W / 2);
  // Short as well: a little further down to make room for the HUD, no more.
  expect(tableMetrics(200, 200).scale).toBe(0.44);
});

// Room the HUD band leaves between the piles and the top of your hand.
const hudBand = (width: number, height: number) => {
  const metrics = tableMetrics(width, height);
  return Math.round(metrics.handY - metrics.cardH / 2 - metrics.hudTop);
};

test("a portrait phone keeps the cards bigger than the width alone allows", () => {
  const metrics = tableMetrics(375, 667);
  expect(metrics.scale).toBeCloseTo(375 / 600);
  expect(metrics.scale).toBeGreaterThan(375 / 900);
  // The two piles still fit across, with room either side.
  expect(metrics.stock.x - metrics.cardW / 2).toBeGreaterThan(metrics.edge);
  expect(metrics.discard.x + metrics.cardW / 2).toBeLessThan(375 - metrics.edge);
  expect(hudBand(375, 667)).toBeGreaterThanOrEqual(88);
});

test("the design viewport leaves the HUD its full band", () => {
  expect(tableMetrics(900, 630).scale).toBe(1);
  expect(hudBand(900, 630)).toBeGreaterThanOrEqual(88);
});

test("a landscape phone shrinks the cards to make room for the HUD", () => {
  const metrics = tableMetrics(667, 375);
  expect(metrics.scale).toBeLessThan(375 / 630);
  expect(metrics.scale).toBeGreaterThanOrEqual(0.44);
  expect(hudBand(667, 375)).toBeGreaterThanOrEqual(88);
  expect(hudBand(667, 420)).toBeGreaterThanOrEqual(88);
});

const card = (rank: string, suit = "hearts") => ({ rank, suit }) as Card;

test("a hand's groups sit in one centred row, a visible gap at each boundary", () => {
  const metrics = tableMetrics(WIDE, TALL);
  const groups = [[card("2"), card("3"), card("4")], [card("K", "spades")], [card("9", "clubs"), card("9", "spades")]];
  const xs = groupedXs(groups, WIDE, metrics).map((placed) => placed.x);
  const steps = xs.slice(1).map((x, index) => x - xs[index]);
  // Inside a group the spacing is even; across a boundary it widens by the group gap.
  expect(steps[1]).toBeCloseTo(steps[0]);
  expect(steps[2] - steps[0]).toBeCloseTo(metrics.groupGap);
  expect(steps[3] - steps[0]).toBeCloseTo(metrics.groupGap);
  expect((xs[0] + xs[xs.length - 1]) / 2).toBeCloseTo(WIDE / 2);
});

test("an eleven-card hand fits a phone's width", () => {
  const metrics = tableMetrics(375, 667);
  const hand = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J"].map((rank) => card(rank));
  const xs = groupedXs([hand], 375, metrics).map((placed) => placed.x);
  expect(xs[0] - metrics.cardW / 2).toBeGreaterThanOrEqual(0);
  expect(xs[xs.length - 1] + metrics.cardW / 2).toBeLessThanOrEqual(375);
});
