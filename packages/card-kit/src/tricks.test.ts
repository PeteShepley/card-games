import { describe, expect, test } from "vitest";
import { followable, rankValue, sortHand, trickWinner } from "./tricks.ts";
import { cards } from "./testCards.ts";

describe("tricks", () => {
  test("highest of the suit led wins; off-suit never does", () => {
    const trick = [
      { seat: "a", card: cards("5:clubs")[0] },
      { seat: "b", card: cards("A:hearts")[0] },
      { seat: "c", card: cards("J:clubs")[0] },
      { seat: "d", card: cards("10:clubs")[0] }
    ];
    expect(trickWinner(trick)).toBe("c");
    // With a trump suit (Spades' rule), any trump beats the suit led.
    expect(trickWinner([...trick.slice(0, 3), { seat: "d", card: cards("2:hearts")[0] }], "hearts")).toBe("b");
  });

  test("follow suit when able, anything when void", () => {
    const hand = cards("2:clubs", "K:hearts");
    const led = [{ seat: "a", card: cards("9:clubs")[0] }];
    expect(followable(hand, led)).toEqual(cards("2:clubs"));
    expect(followable(cards("K:hearts"), led)).toEqual(cards("K:hearts"));
  });

  test("hands sort by suit then ace-high rank", () => {
    expect(sortHand(cards("A:clubs", "2:hearts", "10:clubs", "Q:spades"))).toEqual(
      cards("10:clubs", "A:clubs", "Q:spades", "2:hearts")
    );
  });
});

test("ranks are ace high", () => {
  expect(rankValue("A")).toBeGreaterThan(rankValue("K"));
  expect(rankValue("2")).toBe(0);
});
