import { expect, test } from "vitest";
import { cardLabel, squeeze } from "./labels.ts";

test("cardLabel is rank plus suit symbol", () => {
  expect(cardLabel({ rank: "10", suit: "hearts" })).toBe("10♥");
  expect(cardLabel({ rank: "Q", suit: "spades" })).toBe("Q♠");
});

test("squeeze stays light for small hands and tightens as hands grow", () => {
  expect(squeeze(5)).toBe(0.05);
  expect(squeeze(14)).toBeCloseTo(0.5);
  expect(squeeze(40)).toBe(0.72);
  expect(squeeze(13, 13)).toBe(0.05);
});
