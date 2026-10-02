import { expect, test } from "vitest";
import { seatPositions } from "./seats.ts";

test("the next seat sits on your left, then across, then right", () => {
  expect(seatPositions(["a", "b", "c", "d"], "a")).toEqual({ bottom: "a", left: "b", top: "c", right: "d" });
  expect(seatPositions(["a", "b", "c", "d"], "c")).toEqual({ bottom: "c", left: "d", top: "a", right: "b" });
});

test("only four-seat tables", () => {
  expect(() => seatPositions(["a", "b", "c"], "a")).toThrow();
});
