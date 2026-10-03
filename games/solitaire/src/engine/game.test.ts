import { describe, expect, test } from "vitest";
import fc from "fast-check";
import { cardKey, SUITS } from "@card-games/card-kit/cards.ts";
import type { Card } from "@card-games/card-kit/cards.ts";
import { cards } from "@card-games/card-kit/testCards.ts";
import {
  COLUMNS,
  advance,
  bestTarget,
  canAutoFinish,
  finishingMoves,
  fits,
  initialState,
  locate
} from "./game.ts";
import type { Action, Column, EngineState, Target } from "./game.ts";

function apply(state: EngineState, action: Action): EngineState {
  const result = advance(state, action);
  if (!result.ok) throw new Error(`rejected: ${result.reason}`);
  return result.state;
}

const allCards = (state: EngineState) => [
  ...state.stock,
  ...state.waste,
  ...SUITS.flatMap((suit) => state.foundations[suit]),
  ...state.tableau.flatMap((column) => [...column.down, ...column.up])
];

const empty: Column = { down: [], up: [] };

// A hand-built table: everything not given is empty.
function table(over: Partial<EngineState>): EngineState {
  return {
    ...initialState(1),
    stock: [],
    waste: [],
    foundations: { clubs: [], diamonds: [], hearts: [], spades: [] },
    tableau: Array.from({ length: COLUMNS }, () => empty),
    ...over
  };
}

const col = (n: number): Target => ({ kind: "tableau", column: n });
const home: Target = { kind: "foundation" };

describe("deal", () => {
  test("columns of 1..7 with the top card face up; 24 in the stock", () => {
    const state = initialState(42);
    state.tableau.forEach((column, index) => {
      expect(column.down).toHaveLength(index);
      expect(column.up).toHaveLength(1);
    });
    expect(state.stock).toHaveLength(24);
    expect(new Set(allCards(state).map(cardKey)).size).toBe(52);
  });

  test("the deal is a pure function of the seed", () => {
    expect(initialState(7)).toEqual(initialState(7));
    expect(initialState(7).tableau).not.toEqual(initialState(8).tableau);
  });
});

describe("drawing", () => {
  test("draw-1 turns one card; an empty stock turns the waste back over", () => {
    let state = table({ stock: cards("2:clubs", "3:clubs") });
    state = apply(state, { type: "draw" });
    expect(state.waste).toEqual(cards("3:clubs"));
    state = apply(state, { type: "draw" });
    expect(state.waste).toEqual(cards("3:clubs", "2:clubs"));
    state = apply(state, { type: "draw" });
    // Turned back over: the stock is in its original order again.
    expect(state.stock).toEqual(cards("2:clubs", "3:clubs"));
    expect(state.waste).toEqual([]);
  });

  test("draw-3 turns three (or what's left), the last turned on top", () => {
    let state = table({ drawCount: 3, stock: cards("A:clubs", "2:clubs", "3:clubs", "4:clubs") });
    state = apply(state, { type: "draw" });
    expect(state.waste).toEqual(cards("4:clubs", "3:clubs", "2:clubs"));
    state = apply(state, { type: "draw" });
    expect(state.waste).toEqual(cards("4:clubs", "3:clubs", "2:clubs", "A:clubs"));
    expect(state.stock).toEqual([]);
  });

  test("nothing to draw when both stock and waste are empty", () => {
    expect(advance(table({}), { type: "draw" })).toEqual({ ok: false, reason: "nothingToDraw" });
  });
});

describe("moves", () => {
  test("the tableau builds down in alternating colours", () => {
    const state = table({ tableau: [{ down: [], up: cards("9:hearts") }, empty, empty, empty, empty, empty, empty] });
    expect(fits(state, cards("8:spades")[0], col(0))).toBe(true);
    expect(fits(state, cards("8:diamonds")[0], col(0))).toBe(false);
    expect(fits(state, cards("7:spades")[0], col(0))).toBe(false);
  });

  test("only a king fills an empty column", () => {
    const state = table({});
    expect(fits(state, cards("K:clubs")[0], col(3))).toBe(true);
    expect(fits(state, cards("Q:clubs")[0], col(3))).toBe(false);
  });

  test("foundations build up by suit from the ace", () => {
    const state = table({ foundations: { clubs: cards("A:clubs"), diamonds: [], hearts: [], spades: [] } });
    expect(fits(state, cards("2:clubs")[0], home)).toBe(true);
    expect(fits(state, cards("3:clubs")[0], home)).toBe(false);
    expect(fits(state, cards("A:hearts")[0], home)).toBe(true);
    expect(fits(state, cards("2:hearts")[0], home)).toBe(false);
  });

  test("moving a run carries every card on top, and turns over what it uncovers", () => {
    const state = table({
      tableau: [
        { down: cards("4:diamonds"), up: cards("8:spades", "7:hearts", "6:clubs") },
        { down: [], up: cards("9:hearts") },
        empty,
        empty,
        empty,
        empty,
        empty
      ]
    });
    const next = apply(state, { type: "move", card: cards("8:spades")[0], to: col(1) });
    expect(next.tableau[1].up).toEqual(cards("9:hearts", "8:spades", "7:hearts", "6:clubs"));
    expect(next.tableau[0]).toEqual({ down: [], up: cards("4:diamonds") });
    expect(next.moves).toBe(1);
  });

  test("a run never goes to a foundation; only its top card can", () => {
    const state = table({
      foundations: { clubs: cards("A:clubs", "2:clubs", "3:clubs", "4:clubs", "5:clubs"), diamonds: [], hearts: [], spades: [] },
      tableau: [{ down: [], up: cards("7:hearts", "6:clubs") }, empty, empty, empty, empty, empty, empty]
    });
    expect(advance(state, { type: "move", card: cards("7:hearts")[0], to: home })).toEqual({ ok: false, reason: "doesNotFit" });
    expect(apply(state, { type: "move", card: cards("6:clubs")[0], to: home }).foundations.clubs).toHaveLength(6);
  });

  test("the waste's top card plays; cards under it don't", () => {
    const state = table({
      waste: cards("5:hearts", "Q:spades"),
      tableau: [{ down: [], up: cards("K:hearts") }, { down: [], up: cards("6:spades") }, empty, empty, empty, empty, empty]
    });
    expect(apply(state, { type: "move", card: cards("Q:spades")[0], to: col(0) }).waste).toEqual(cards("5:hearts"));
    expect(advance(state, { type: "move", card: cards("5:hearts")[0], to: col(1) })).toEqual({
      ok: false,
      reason: "notPlayable"
    });
  });

  test("a card can come back down from a foundation", () => {
    const state = table({
      foundations: { clubs: [], diamonds: [], hearts: cards("A:hearts", "2:hearts", "3:hearts"), spades: [] },
      tableau: [{ down: [], up: cards("4:spades") }, empty, empty, empty, empty, empty, empty]
    });
    const next = apply(state, { type: "move", card: cards("3:hearts")[0], to: col(0) });
    expect(next.foundations.hearts).toHaveLength(2);
    expect(next.tableau[0].up).toEqual(cards("4:spades", "3:hearts"));
  });

  test("face-down cards can't be moved, and a column can't move onto itself", () => {
    const state = initialState(42);
    const hidden = state.tableau[6].down[0];
    expect(locate(state, hidden)).toBeNull();
    const top = state.tableau[2].up[0];
    expect(advance(state, { type: "move", card: top, to: col(2) })).toEqual({ ok: false, reason: "sameColumn" });
  });
});

describe("helpers", () => {
  test("bestTarget prefers the foundation, then the first column that fits", () => {
    const state = table({
      foundations: { clubs: cards("A:clubs"), diamonds: [], hearts: [], spades: [] },
      waste: cards("2:clubs"),
      tableau: [empty, { down: [], up: cards("3:hearts") }, empty, empty, empty, empty, empty]
    });
    expect(bestTarget(state, cards("2:clubs")[0])).toEqual(home);
    const noHome = { ...state, foundations: { ...state.foundations, clubs: [] } };
    expect(bestTarget(noHome, cards("2:clubs")[0])).toEqual(col(1));
  });

  test("an open table auto-finishes to a win", () => {
    // Every remaining card face up in two descending, alternating runs.
    const runA = cards("K:spades", "Q:hearts", "J:spades", "10:hearts", "9:spades", "8:hearts", "7:spades", "6:hearts", "5:spades", "4:hearts", "3:spades", "2:hearts", "A:spades");
    const runB = cards("K:hearts", "Q:spades", "J:hearts", "10:spades", "9:hearts", "8:spades", "7:hearts", "6:spades", "5:hearts", "4:spades", "3:hearts", "2:spades", "A:hearts");
    const full = (suit: "clubs" | "diamonds") =>
      cards(...["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"].map((r) => `${r}:${suit}`));
    const state = table({
      foundations: { clubs: full("clubs"), diamonds: full("diamonds"), hearts: [], spades: [] },
      tableau: [{ down: [], up: runA }, { down: [], up: runB }, empty, empty, empty, empty, empty]
    });
    expect(canAutoFinish(state)).toBe(true);
    let finished = state;
    for (const action of finishingMoves(state)) finished = apply(finished, action);
    expect(finished.won).toBe(true);
    expect(advance(finished, { type: "draw" })).toEqual({ ok: false, reason: "gameOver" });
  });

  test("auto-finish isn't offered while anything is hidden", () => {
    expect(canAutoFinish(initialState(42))).toBe(false);
  });
});

// Random legal play: at each step, draw or make one of the legal moves.
function legalMoves(state: EngineState): Action[] {
  const movable: Card[] = [
    ...(state.waste.length ? [state.waste[state.waste.length - 1]] : []),
    ...SUITS.flatMap((suit) => state.foundations[suit].slice(-1)),
    ...state.tableau.flatMap((column) => column.up)
  ];
  const targets: Target[] = [home, ...Array.from({ length: COLUMNS }, (_, n) => col(n))];
  const actions: Action[] = [];
  for (const card of movable)
    for (const to of targets) {
      const action: Action = { type: "move", card, to };
      if (advance(state, action).ok) actions.push(action);
    }
  if (advance(state, { type: "draw" }).ok) actions.push({ type: "draw" });
  return actions;
}

describe("properties", () => {
  const seed = fc.integer({ min: 0, max: 0xffffffff });
  const picks = fc.array(fc.nat(1000), { minLength: 1, maxLength: 60 });
  const draw = fc.constantFrom<1 | 3>(1, 3);

  test("random legal play keeps all 52 cards, each exactly once", () => {
    fc.assert(
      fc.property(seed, picks, draw, (s, p, d) => {
        let state = initialState(s, d);
        for (let step = 0; step < 150 && !state.won; step++) {
          const options = legalMoves(state);
          if (options.length === 0) break;
          state = apply(state, options[p[step % p.length] % options.length]);
          const all = allCards(state).map(cardKey);
          expect(all).toHaveLength(52);
          expect(new Set(all).size).toBe(52);
          // Every non-empty column shows at least one face-up card.
          for (const column of state.tableau) if (column.down.length) expect(column.up.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 60 }
    );
  });

  test("replaying the move log reproduces the table (what undo relies on)", () => {
    fc.assert(
      fc.property(seed, picks, draw, (s, p, d) => {
        let state = initialState(s, d);
        const log: Action[] = [];
        for (let step = 0; step < 80; step++) {
          const options = legalMoves(state);
          if (options.length === 0) break;
          const action = options[p[step % p.length] % options.length];
          state = apply(state, action);
          log.push(action);
        }
        let replayed = initialState(s, d);
        for (const action of log) replayed = apply(replayed, action);
        expect(replayed).toEqual(state);
      }),
      { numRuns: 40 }
    );
  });
});
