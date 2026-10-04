import { expect, test } from "vitest";
import { cardLabel } from "./labels.ts";

test("cardLabel is rank plus suit symbol", () => {
  expect(cardLabel({ rank: "10", suit: "hearts" })).toBe("10♥");
  expect(cardLabel({ rank: "Q", suit: "spades" })).toBe("Q♠");
});
