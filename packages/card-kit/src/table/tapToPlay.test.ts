import { expect, test } from "vitest";
import { tapOutcome } from "./tapToPlay.ts";

const seven = { rank: "7", suit: "clubs" } as const;
const queen = { rank: "Q", suit: "hearts" } as const;

test("a mouse click plays at once", () => {
  expect(tapOutcome(null, seven, false)).toBe("play");
  expect(tapOutcome(queen, seven, false)).toBe("play");
});

test("on touch the first tap lifts and a second tap on the same card plays", () => {
  expect(tapOutcome(null, seven, true)).toBe("lift");
  expect(tapOutcome(seven, seven, true)).toBe("play");
});

test("on touch a tap on another card moves the lift", () => {
  expect(tapOutcome(queen, seven, true)).toBe("lift");
});
