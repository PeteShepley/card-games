import { describe, expect, test } from "vitest";
import fc from "fast-check";
import { cardKey } from "@card-games/card-kit/cards.ts";
import { cards } from "@card-games/card-kit/testCards.ts";
import {
  advance,
  canPlay,
  cardsPerHand,
  initialState,
  legalActions,
  nextSeat,
  playableCards,
  topCard
} from "./game.ts";
import type { Action, EngineState, Seat } from "./game.ts";
import { cardPoints, handPoints } from "./scoring.ts";

function apply(state: EngineState, action: Action): EngineState {
  const result = advance(state, action);
  if (!result.ok) throw new Error(`rejected: ${result.reason}`);
  return result.state;
}

const SEATS3 = ["a", "b", "c"];

// A hand-built mid-hand table, so rules can be tested on exact cards.
function table(over: Partial<EngineState>): EngineState {
  return {
    ...initialState(1, SEATS3, "a"),
    phase: "play",
    handNumber: 1,
    hands: { a: [], b: [], c: [] },
    stock: cards("2:clubs", "3:clubs"),
    discardPile: cards("9:hearts"),
    activeSuit: "hearts",
    toAct: "b",
    ...over
  };
}

const allCards = (state: EngineState) => [
  ...state.seats.flatMap((seat) => state.hands[seat]),
  ...state.stock,
  ...state.discardPile
];

describe("setup", () => {
  test("rejects too few or too many seats", () => {
    expect(() => initialState(1, ["a"], "a")).toThrow();
    expect(() => initialState(1, ["a", "b", "c", "d", "e", "f", "g"], "a")).toThrow();
  });

  test.each([
    [2, 7],
    [3, 5],
    [6, 5]
  ])("%i seats get %i cards each", (count, perHand) => {
    const seats = ["a", "b", "c", "d", "e", "f"].slice(0, count);
    const state = apply(initialState(42, seats, "a"), { type: "startHand" });
    for (const seat of seats) expect(state.hands[seat]).toHaveLength(perHand);
    expect(cardsPerHand(count)).toBe(perHand);
    expect(state.discardPile).toHaveLength(1);
    expect(allCards(state)).toHaveLength(52);
    expect(new Set(allCards(state).map(cardKey)).size).toBe(52);
  });

  test("play starts left of the dealer with the starter's suit in force", () => {
    const state = apply(initialState(42, SEATS3, "a"), { type: "startHand" });
    expect(state.phase).toBe("play");
    expect(state.toAct).toBe("b");
    expect(state.activeSuit).toBe(topCard(state)!.suit);
    expect(state.handNumber).toBe(1);
  });

  test("the starter is never an 8", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xffffffff }), (seed) => {
        const state = apply(initialState(seed, SEATS3, "a"), { type: "startHand" });
        expect(topCard(state)!.rank).not.toBe("8");
      })
    );
  });

  test("the deal is a pure function of the seed", () => {
    const one = apply(initialState(7, SEATS3, "a"), { type: "startHand" });
    const two = apply(initialState(7, SEATS3, "a"), { type: "startHand" });
    const other = apply(initialState(8, SEATS3, "a"), { type: "startHand" });
    expect(one).toEqual(two);
    expect(one.hands).not.toEqual(other.hands);
  });

  test("startHand is refused mid-hand", () => {
    expect(advance(table({}), { type: "startHand" })).toEqual({
      ok: false,
      reason: "wrongPhase"
    });
  });
});

describe("play", () => {
  test("matching suit or rank is playable; anything else is not", () => {
    const state = table({});
    expect(canPlay(state, cards("2:hearts")[0])).toBe(true);
    expect(canPlay(state, cards("9:spades")[0])).toBe(true);
    expect(canPlay(state, cards("2:spades")[0])).toBe(false);
    expect(canPlay(state, cards("8:spades")[0])).toBe(true);
  });

  test("a matching play moves the card, sets the suit, and passes the turn", () => {
    const state = table({ hands: { a: [], b: cards("4:hearts", "K:clubs"), c: [] } });
    const next = apply(state, { type: "play", seat: "b", card: cards("4:hearts")[0] });
    expect(next.hands.b).toEqual(cards("K:clubs"));
    expect(topCard(next)).toEqual(cards("4:hearts")[0]);
    expect(next.activeSuit).toBe("hearts");
    expect(next.toAct).toBe("c");
  });

  test("an 8 is wild and names the suit to follow", () => {
    const state = table({ hands: { a: [], b: cards("8:spades", "K:clubs"), c: [] } });
    const next = apply(state, {
      type: "play",
      seat: "b",
      card: cards("8:spades")[0],
      suit: "clubs"
    });
    expect(next.activeSuit).toBe("clubs");
    // Now clubs follow the 8, and so do other 8s; hearts no longer do.
    expect(canPlay(next, cards("2:clubs")[0])).toBe(true);
    expect(canPlay(next, cards("8:diamonds")[0])).toBe(true);
    expect(canPlay(next, cards("2:hearts")[0])).toBe(false);
  });

  test.each([
    ["an 8 without a suit", { card: "8:spades" }, "suitRequired"],
    ["a suit on a non-8", { card: "4:hearts", suit: "clubs" }, "suitNotAllowed"],
    ["a card that doesn't match", { card: "K:clubs" }, "doesNotMatch"],
    ["a card not held", { card: "5:hearts" }, "cardNotInHand"]
  ] as const)("refuses %s", (_, { card, ...rest }, reason) => {
    const state = table({
      hands: { a: [], b: cards("8:spades", "4:hearts", "K:clubs"), c: [] }
    });
    const suit = "suit" in rest ? rest.suit : undefined;
    expect(
      advance(state, { type: "play", seat: "b", card: cards(card)[0], suit })
    ).toEqual({ ok: false, reason });
  });

  test("only the seat to act may play", () => {
    const state = table({ hands: { a: cards("4:hearts"), b: [], c: [] } });
    expect(
      advance(state, { type: "play", seat: "a", card: cards("4:hearts")[0] })
    ).toEqual({ ok: false, reason: "wrongSeat" });
  });

  test("playing the last card wins the hand and scores the other hands", () => {
    const state = table({
      hands: {
        a: cards("8:clubs", "K:spades"), // 50 + 10
        b: cards("4:hearts"),
        c: cards("A:diamonds", "7:clubs") // 1 + 7
      },
      scores: { a: 0, b: 5, c: 0 }
    });
    const next = apply(state, { type: "play", seat: "b", card: cards("4:hearts")[0] });
    expect(next.phase).toBe("handOver");
    expect(next.toAct).toBeNull();
    expect(next.result).toEqual({ type: "out", winner: "b", points: 68 });
    expect(next.scores).toEqual({ a: 0, b: 73, c: 0 });
    expect(legalActions(next, "a")).toEqual(["startHand"]);
  });
});

describe("draw and pass", () => {
  test("a draw takes the top of the stock and keeps the turn", () => {
    const state = table({ hands: { a: [], b: cards("K:clubs"), c: [] } });
    const next = apply(state, { type: "draw", seat: "b" });
    expect(next.hands.b).toEqual(cards("K:clubs", "2:clubs"));
    expect(next.stock).toEqual(cards("3:clubs"));
    expect(next.toAct).toBe("b");
  });

  test("an empty stock is rebuilt from the pile under the top card", () => {
    const state = table({
      hands: { a: [], b: cards("K:clubs"), c: [] },
      stock: [],
      discardPile: cards("2:hearts", "3:hearts", "9:hearts")
    });
    const next = apply(state, { type: "draw", seat: "b" });
    expect(next.discardPile).toEqual(cards("9:hearts"));
    expect(next.stock).toHaveLength(1);
    expect(next.hands.b).toHaveLength(2);
    expect(allCards(next).map(cardKey).sort()).toEqual(
      allCards(state).map(cardKey).sort()
    );
    expect(next.prngState).not.toBe(state.prngState);
  });

  test("pass is only allowed when there is nothing to draw", () => {
    const state = table({ hands: { a: [], b: cards("K:clubs"), c: [] } });
    expect(advance(state, { type: "pass", seat: "b" })).toEqual({
      ok: false,
      reason: "mustDraw"
    });
    expect(legalActions(state, "b")).toEqual(["draw"]);

    const dry = table({ hands: { a: [], b: cards("K:clubs"), c: [] }, stock: [] });
    expect(legalActions(dry, "b")).toEqual(["pass"]);
    expect(advance(dry, { type: "draw", seat: "b" })).toEqual({
      ok: false,
      reason: "nothingToDraw"
    });
    expect(apply(dry, { type: "pass", seat: "b" }).toAct).toBe("c");
  });

  test("a full round of passes blocks the hand; the lowest hand wins", () => {
    let state = table({
      hands: {
        a: cards("K:clubs"), // 10
        b: cards("2:clubs", "3:spades"), // 5
        c: cards("Q:spades", "J:spades") // 20
      },
      stock: [],
      toAct: "b"
    });
    state = apply(state, { type: "pass", seat: "b" });
    state = apply(state, { type: "pass", seat: "c" });
    expect(state.phase).toBe("play");
    state = apply(state, { type: "pass", seat: "a" });
    expect(state.phase).toBe("handOver");
    expect(state.result).toEqual({ type: "blocked", winner: "b", points: 30 });
    expect(state.scores.b).toBe(30);
  });

  test("a blocked hand with tied low hands has no winner", () => {
    let state = table({
      hands: { a: cards("K:clubs"), b: cards("Q:spades"), c: cards("J:spades") },
      stock: [],
      toAct: "a"
    });
    for (const seat of ["a", "b", "c"]) state = apply(state, { type: "pass", seat });
    expect(state.result).toEqual({ type: "blocked", winner: null, points: 0 });
  });
});

describe("hands in sequence", () => {
  test("the deal passes left each hand and scores carry over", () => {
    const first = apply(initialState(3, SEATS3, "a"), { type: "startHand" });
    const over: EngineState = {
      ...first,
      phase: "handOver",
      toAct: null,
      scores: { a: 10, b: 0, c: 0 }
    };
    const second = apply(over, { type: "startHand" });
    expect(second.dealer).toBe("b");
    expect(second.toAct).toBe("c");
    expect(second.handNumber).toBe(2);
    expect(second.scores).toEqual({ a: 10, b: 0, c: 0 });
    expect(nextSeat(second, "c")).toBe("a");
  });
});

describe("scoring", () => {
  test("8s are 50, faces 10, aces 1, pips face value", () => {
    expect(cardPoints("8")).toBe(50);
    expect(cardPoints("K")).toBe(10);
    expect(cardPoints("A")).toBe(1);
    expect(cardPoints("7")).toBe(7);
    expect(handPoints(cards("8:clubs", "K:spades", "A:hearts", "7:clubs"))).toBe(68);
  });
});

// Random but legal playouts: a deterministic chooser picks among the legal
// moves, so these explore real games end to end.
function playout(seed: number, seatCount: number, choices: number[], limit = 2000) {
  const seats = ["a", "b", "c", "d", "e", "f"].slice(0, seatCount);
  let state = apply(initialState(seed, seats, "a"), { type: "startHand" });
  const log: Action[] = [{ type: "startHand" }];
  for (let step = 0; step < limit && state.phase === "play"; step++) {
    const seat: Seat = state.toAct!;
    const pick = choices[step % choices.length];
    const playable = playableCards(state, seat);
    const legal = legalActions(state, seat);
    let action: Action;
    // Mostly play when possible (every 4th pick draws instead), so hands
    // both finish and exercise the stock and the reshuffle.
    if (playable.length > 0 && pick % 4 !== 0) {
      const card = playable[pick % playable.length];
      action =
        card.rank === "8"
          ? { type: "play", seat, card, suit: (["clubs", "diamonds", "hearts", "spades"] as const)[pick % 4] }
          : { type: "play", seat, card };
    } else {
      action = { type: legal.includes("draw") ? "draw" : "pass", seat };
    }
    state = apply(state, action);
    log.push(action);
    expect(allCards(state)).toHaveLength(52);
  }
  return { state, log, seats };
}

describe("properties", () => {
  const seed = fc.integer({ min: 0, max: 0xffffffff });
  const seatCount = fc.integer({ min: 2, max: 6 });
  const choices = fc.array(fc.nat(1000), { minLength: 1, maxLength: 50 });

  test("every legal playout conserves the 52 cards with no duplicates", () => {
    fc.assert(
      fc.property(seed, seatCount, choices, (s, n, c) => {
        const { state } = playout(s, n, c);
        expect(new Set(allCards(state).map(cardKey)).size).toBe(52);
      }),
      { numRuns: 200 }
    );
  });

  test("replaying the log reproduces the table exactly", () => {
    fc.assert(
      fc.property(seed, seatCount, choices, (s, n, c) => {
        const { state, log, seats } = playout(s, n, c);
        let replayed = initialState(s, seats, "a");
        for (const action of log) replayed = apply(replayed, action);
        expect(replayed).toEqual(state);
      }),
      { numRuns: 100 }
    );
  });

  test("playouts that keep playing when they can finish the hand", () => {
    fc.assert(
      fc.property(seed, seatCount, (s, n) => {
        // Always play when possible (choice 1 never hits `% 4 === 0`).
        const { state } = playout(s, n, [1]);
        expect(state.phase).toBe("handOver");
        expect(state.result).not.toBeNull();
      }),
      { numRuns: 200 }
    );
  });

  test("a hand-over always leaves the winner's score raised by the points", () => {
    fc.assert(
      fc.property(seed, seatCount, (s, n) => {
        const { state } = playout(s, n, [1]);
        const result = state.result!;
        const total = Object.values(state.scores).reduce((a, b) => a + b, 0);
        expect(total).toBe(result.winner ? result.points : 0);
      }),
      { numRuns: 100 }
    );
  });
});
