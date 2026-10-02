import { expect, test } from "vitest";
import { cardKey, sameCard } from "./cards.ts";

test("cardKey is rank:suit", () => {
  expect(cardKey({ rank: "10", suit: "hearts" })).toBe("10:hearts");
});

test("sameCard compares rank and suit", () => {
  expect(sameCard({ rank: "A", suit: "clubs" }, { rank: "A", suit: "clubs" })).toBe(true);
  expect(sameCard({ rank: "A", suit: "clubs" }, { rank: "A", suit: "spades" })).toBe(false);
  expect(sameCard({ rank: "A", suit: "clubs" }, { rank: "2", suit: "clubs" })).toBe(false);
});
