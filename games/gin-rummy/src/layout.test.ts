import { expect, test } from "vitest";
import type { Card } from "@card-games/card-kit/cards.ts";
import { BASE_CARD_H, BASE_CARD_W, BASE_EDGE, groupedXs, tableMetrics } from "./layout.ts";

// A desktop window: landscape, roomy enough for full-size cards.
const WIDE = 1200;
const TALL = 800;

const card = (rank: string, suit = "hearts") => ({ rank, suit }) as Card;
const eleven = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J"].map((rank) => card(rank));

// Room the HUD band leaves between the piles and the top of your hand
// (portrait, where the HUD sits there).
const hudBand = (width: number, height: number) => {
  const metrics = tableMetrics(width, height);
  return Math.round(metrics.handY - metrics.cardH / 2 - metrics.hudTop);
};

test("a roomy desktop grows the cards past their base size, to a cap", () => {
  const metrics = tableMetrics(WIDE, TALL);
  expect(metrics.scale).toBeGreaterThan(1);
  expect(tableMetrics(3000, 2000).scale).toBe(1.4);
  expect(metrics.cardH).toBeCloseTo(BASE_CARD_H * metrics.scale);
  expect(metrics.edge).toBeCloseTo(BASE_EDGE * metrics.scale);
});

test("the two piles straddle the centre of the play area", () => {
  for (const [width, height] of [
    [WIDE, TALL],
    [375, 667]
  ]) {
    const metrics = tableMetrics(width, height);
    expect(metrics.playX - metrics.stock.x).toBeCloseTo(metrics.discard.x - metrics.playX);
    expect(metrics.stock.y).toBe(metrics.discard.y);
  }
});

test("the card rows sit one edge in from the top and bottom", () => {
  const metrics = tableMetrics(WIDE, TALL);
  expect(metrics.opponentY).toBeCloseTo(metrics.edge + metrics.cardH / 2);
  expect(metrics.handY).toBeCloseTo(TALL - metrics.edge - metrics.cardH / 2);
});

// --- portrait: the HUD between the piles and the hand ---

test("portrait: the HUD band starts below the piles and leaves the HUD its room above the hand", () => {
  for (const [width, height] of [
    [375, 667],
    [390, 844],
    [600, 900]
  ]) {
    const metrics = tableMetrics(width, height);
    expect(metrics.column).toBeNull();
    expect(metrics.hudTop).toBeGreaterThan(metrics.discard.y + metrics.cardH / 2);
    expect(hudBand(width, height)).toBeGreaterThanOrEqual(88);
  }
});

test("a portrait phone keeps the cards bigger than the width alone allows", () => {
  const metrics = tableMetrics(375, 667);
  expect(metrics.scale).toBeCloseTo(375 / 600);
  expect(metrics.stock.x - metrics.cardW / 2).toBeGreaterThan(metrics.edge);
  expect(metrics.discard.x + metrics.cardW / 2).toBeLessThan(375 - metrics.edge);
});

test("scaling never collapses a narrow table past the readable floor", () => {
  expect(tableMetrics(200, 700).scale).toBe(0.5);
  expect(tableMetrics(200, 700).cardW).toBe(BASE_CARD_W / 2);
});

// --- landscape: the HUD and feed in a column at the right ---

for (const [width, height] of [
  [667, 375],
  [844, 390],
  [1024, 600],
  [WIDE, TALL]
] as const) {
  test(`${width}x${height}: the controls get a column and the cards the rest, stacked without overlap`, () => {
    const metrics = tableMetrics(width, height);
    const column = metrics.column!;
    expect(column).not.toBeNull();
    const columnLeft = width - column.right - column.width;
    // Nothing of the cards' reaches into the column.
    expect(metrics.discard.x + metrics.cardW / 2).toBeLessThanOrEqual(columnLeft);
    const hand = groupedXs([eleven], metrics).map((placed) => placed.x);
    expect(hand[hand.length - 1] + metrics.cardW / 2).toBeLessThanOrEqual(columnLeft);
    expect(hand[0] - metrics.cardW / 2).toBeGreaterThanOrEqual(0);
    // Opponent row, its nameplate, the piles, the raised hand: in order.
    const pilesTop = metrics.stock.y - metrics.cardH / 2;
    const pilesBottom = metrics.stock.y + metrics.cardH / 2;
    expect(pilesTop).toBeGreaterThanOrEqual(metrics.opponentY + metrics.cardH / 2 + 34);
    expect(pilesBottom).toBeLessThanOrEqual(metrics.handY - metrics.cardH / 2 - metrics.raise);
    expect(metrics.handY + metrics.cardH / 2).toBeLessThanOrEqual(height);
  });
}

test("a landscape phone's cards are well above the 40px they had with the HUD between the rows", () => {
  expect(tableMetrics(667, 375).cardW).toBeGreaterThan(60);
});

// --- the hand row ---

test("a hand's groups sit in one centred row, a visible gap at each boundary", () => {
  const metrics = tableMetrics(WIDE, TALL);
  const groups = [[card("2"), card("3"), card("4")], [card("K", "spades")], [card("9", "clubs"), card("9", "spades")]];
  const xs = groupedXs(groups, metrics).map((placed) => placed.x);
  const steps = xs.slice(1).map((x, index) => x - xs[index]);
  // Inside a group the spacing is even; across a boundary it widens by the group gap.
  expect(steps[1]).toBeCloseTo(steps[0]);
  expect(steps[2] - steps[0]).toBeCloseTo(metrics.groupGap);
  expect(steps[3] - steps[0]).toBeCloseTo(metrics.groupGap);
  expect((xs[0] + xs[xs.length - 1]) / 2).toBeCloseTo(metrics.playX);
});

test("an eleven-card hand fits a phone's width", () => {
  const metrics = tableMetrics(375, 667);
  const xs = groupedXs([eleven], metrics).map((placed) => placed.x);
  expect(xs[0] - metrics.cardW / 2).toBeGreaterThanOrEqual(0);
  expect(xs[xs.length - 1] + metrics.cardW / 2).toBeLessThanOrEqual(375);
});
