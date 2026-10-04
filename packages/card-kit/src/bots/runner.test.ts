import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createBotRunner } from "./runner.ts";
import { botRunner, botSeatsFor, offlineTable } from "./seats.ts";

// A toy game: a counter, and whoever's turn it is adds one.
interface Toy {
  readonly turn: string;
  readonly count: number;
}
type Bump = { type: "bump"; seat: string };

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function harness() {
  const submitted: Bump[] = [];
  const runner = createBotRunner<Toy, Bump>({
    decide: (state, seat) =>
      state.turn === seat ? { type: "bump", seat } : null,
    submit: (action) => submitted.push(action),
    delayMs: () => 500
  });
  return { runner, submitted };
}

test("a bot whose turn it is moves after its thinking time", () => {
  const { runner, submitted } = harness();
  runner.update({ turn: "b", count: 0 }, ["b", "c"], true);
  vi.advanceTimersByTime(499);
  expect(submitted).toEqual([]);
  vi.advanceTimersByTime(1);
  expect(submitted).toEqual([{ type: "bump", seat: "b" }]);
});

test("nothing happens on a human's turn, or on a client that isn't the runner", () => {
  const { runner, submitted } = harness();
  runner.update({ turn: "a", count: 0 }, ["b", "c"], true);
  runner.update({ turn: "b", count: 0 }, ["b", "c"], false);
  vi.advanceTimersByTime(5000);
  expect(submitted).toEqual([]);
});

test("a new state cancels a pending move, so a bot never acts on stale state", () => {
  const { runner, submitted } = harness();
  runner.update({ turn: "b", count: 0 }, ["b"], true);
  vi.advanceTimersByTime(300);
  runner.update({ turn: "a", count: 1 }, ["b"], true);
  vi.advanceTimersByTime(5000);
  expect(submitted).toEqual([]);
});

test("a state already moved from is not moved from again while the echo is in flight", () => {
  const { runner, submitted } = harness();
  const state = { turn: "b", count: 0 };
  runner.update(state, ["b"], true);
  vi.advanceTimersByTime(500);
  // A re-render hands the same state back before the relay's echo lands.
  runner.update(state, ["b"], true);
  vi.advanceTimersByTime(5000);
  expect(submitted).toHaveLength(1);
  // The echo applied: a new state, the bot's turn again, it moves again.
  runner.update({ turn: "b", count: 1 }, ["b"], true);
  vi.advanceTimersByTime(500);
  expect(submitted).toHaveLength(2);
});

test("destroy cancels a pending move", () => {
  const { runner, submitted } = harness();
  runner.update({ turn: "b", count: 0 }, ["b"], true);
  runner.destroy();
  vi.advanceTimersByTime(5000);
  expect(submitted).toEqual([]);
});

const roster = (
  seats: { id: string; connected: boolean; bot?: boolean }[]
) => ({
  seats: seats.map((seat) => ({ name: seat.id, ...seat })),
  minSeats: 2,
  maxSeats: 4,
  started: true
});

test("the first connected human plays the computers; if they drop, the next takes over", () => {
  const all = roster([
    { id: "a", connected: true },
    { id: "b", connected: false, bot: true },
    { id: "c", connected: true }
  ]);
  expect(botRunner(all)).toBe("a");
  expect(botSeatsFor(all, "a")).toEqual({ seats: ["b"], runner: true });
  expect(botSeatsFor(all, "c")).toEqual({ seats: ["b"], runner: false });
  const dropped = roster([
    { id: "a", connected: false },
    { id: "b", connected: false, bot: true },
    { id: "c", connected: true }
  ]);
  expect(botSeatsFor(dropped, "c").runner).toBe(true);
});

test("with no computers nobody runs anything", () => {
  expect(
    botSeatsFor(
      roster([
        { id: "a", connected: true },
        { id: "b", connected: true }
      ]),
      "a"
    )
  ).toEqual({
    seats: [],
    runner: false
  });
});

test("an offline table seats you first and computers in the rest", () => {
  const table = offlineTable("Pat", 4);
  expect(table.seats).toEqual(["a", "b", "c", "d"]);
  expect(table.names).toEqual({
    a: "Pat",
    b: "Computer B",
    c: "Computer C",
    d: "Computer D"
  });
  expect(table.bots).toEqual({ seats: ["b", "c", "d"], runner: true });
  expect(offlineTable("Pat", 2).names.b).toBe("Computer");
});
