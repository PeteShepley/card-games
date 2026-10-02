import { describe, expect, test } from "vitest";
import fc from "fast-check";
import { cardKey } from "@card-games/card-kit/cards.ts";
import type { Card } from "@card-games/card-kit/cards.ts";
import { cards } from "@card-games/card-kit/testCards.ts";
import {
  GAME_OVER_AT,
  advance,
  cardPoints,
  initialState,
  legalPlays,
  passTarget
} from "./game.ts";
import type { Action, EngineState, Seat } from "./game.ts";

const SEATS = ["a", "b", "c", "d"];

function apply(state: EngineState, action: Action): EngineState {
  const result = advance(state, action);
  if (!result.ok) throw new Error(`rejected: ${result.reason}`);
  return result.state;
}

const allCards = (state: EngineState) => [
  ...state.seats.flatMap((seat) => state.hands[seat]),
  ...state.trick.map((played) => played.card),
  ...state.seats.flatMap((seat) => state.taken[seat])
];

// A table mid-play with hand-picked cards.
function playing(over: Partial<EngineState>): EngineState {
  return {
    ...initialState(1, SEATS),
    phase: "playing",
    handNumber: 1,
    trickNumber: 2,
    heartsBroken: false,
    toAct: "a",
    ...over
  };
}

describe("deal and pass", () => {
  test("13 each, everyone chooses three, hand 1 passes left", () => {
    const state = apply(initialState(42, SEATS), { type: "startHand" });
    expect(state.phase).toBe("passing");
    expect(state.passDirection).toBe("left");
    for (const seat of SEATS) expect(state.hands[seat]).toHaveLength(13);
    expect(new Set(allCards(state).map(cardKey)).size).toBe(52);
    expect(passTarget(state, "a")).toBe("b");
    expect(passTarget(state, "d")).toBe("a");
  });

  test("the direction cycles left, right, across, hold", () => {
    let state = initialState(42, SEATS);
    const seen: string[] = [];
    for (let hand = 0; hand < 5; hand++) {
      state = apply({ ...state, phase: hand === 0 ? "awaitingStart" : "handOver" }, { type: "startHand" });
      seen.push(state.passDirection);
    }
    expect(seen).toEqual(["left", "right", "across", "hold", "left"]);
  });

  test("a hold hand goes straight to play with the 2♣ holder on lead", () => {
    const state = apply({ ...initialState(42, SEATS), phase: "handOver", handNumber: 3 }, { type: "startHand" });
    expect(state.passDirection).toBe("hold");
    expect(state.phase).toBe("playing");
    expect(state.hands[state.toAct!].some((card) => cardKey(card) === "2:clubs")).toBe(true);
  });

  test("passes swap simultaneously once all four have chosen", () => {
    let state = apply(initialState(42, SEATS), { type: "startHand" });
    const chosen = Object.fromEntries(SEATS.map((seat) => [seat, state.hands[seat].slice(0, 3)]));
    for (const seat of SEATS.slice(0, 3)) {
      state = apply(state, { type: "pass", seat, cards: chosen[seat] });
      expect(state.phase).toBe("passing");
    }
    state = apply(state, { type: "pass", seat: "d", cards: chosen.d });
    expect(state.phase).toBe("playing");
    // a passed left to b: b now holds a's three, and not its own.
    for (const card of chosen.a) expect(state.hands.b).toContainEqual(card);
    for (const card of chosen.b) expect(state.hands.b).not.toContainEqual(card);
    for (const seat of SEATS) expect(state.hands[seat]).toHaveLength(13);
  });

  test.each([
    ["two cards", (state: EngineState) => state.hands.a.slice(0, 2)],
    ["a duplicate", (state: EngineState) => [state.hands.a[0], state.hands.a[0], state.hands.a[1]]],
    ["cards it doesn't hold", (state: EngineState) => state.hands.b.slice(0, 3)]
  ])("refuses a pass of %s", (_, pick) => {
    const state = apply(initialState(42, SEATS), { type: "startHand" });
    expect(advance(state, { type: "pass", seat: "a", cards: pick(state) })).toEqual({
      ok: false,
      reason: "passThree"
    });
  });

  test("a seat can't pass twice", () => {
    let state = apply(initialState(42, SEATS), { type: "startHand" });
    state = apply(state, { type: "pass", seat: "a", cards: state.hands.a.slice(0, 3) });
    expect(advance(state, { type: "pass", seat: "a", cards: state.hands.a.slice(3, 6) })).toEqual({
      ok: false,
      reason: "alreadyPassed"
    });
  });
});

describe("play", () => {
  test("the first lead must be the 2♣", () => {
    const state = playing({
      trickNumber: 1,
      hands: { a: cards("2:clubs", "A:clubs"), b: [], c: [], d: [] }
    });
    expect(legalPlays(state, "a")).toEqual(cards("2:clubs"));
    expect(advance(state, { type: "play", seat: "a", card: cards("A:clubs")[0] })).toEqual({
      ok: false,
      reason: "mustLeadTwoOfClubs"
    });
  });

  test("no points on the first trick unless that's all you have", () => {
    const trick = [{ seat: "a", card: cards("2:clubs")[0] }];
    const state = playing({
      trickNumber: 1,
      trick,
      toAct: "b",
      hands: { a: [], b: cards("K:hearts", "Q:spades", "3:diamonds"), c: [], d: [] }
    });
    expect(legalPlays(state, "b")).toEqual(cards("3:diamonds"));
    expect(advance(state, { type: "play", seat: "b", card: cards("Q:spades")[0] })).toEqual({
      ok: false,
      reason: "noPointsOnFirstTrick"
    });
    const onlyPoints = { ...state, hands: { ...state.hands, b: cards("K:hearts", "Q:spades") } };
    expect(legalPlays(onlyPoints, "b")).toEqual(cards("K:hearts", "Q:spades"));
  });

  test("must follow suit", () => {
    const state = playing({
      trick: [{ seat: "d", card: cards("9:diamonds")[0] }],
      hands: { a: cards("2:diamonds", "A:spades"), b: [], c: [], d: [] }
    });
    expect(advance(state, { type: "play", seat: "a", card: cards("A:spades")[0] })).toEqual({
      ok: false,
      reason: "mustFollowSuit"
    });
  });

  test("hearts can't be led until broken, unless nothing else is held", () => {
    const state = playing({ hands: { a: cards("2:hearts", "3:clubs"), b: [], c: [], d: [] } });
    expect(legalPlays(state, "a")).toEqual(cards("3:clubs"));
    expect(advance(state, { type: "play", seat: "a", card: cards("2:hearts")[0] })).toEqual({
      ok: false,
      reason: "heartsNotBroken"
    });
    expect(legalPlays({ ...state, heartsBroken: true }, "a")).toHaveLength(2);
    expect(legalPlays({ ...state, hands: { ...state.hands, a: cards("2:hearts") } }, "a")).toEqual(
      cards("2:hearts")
    );
  });

  test("a discarded heart breaks hearts; the trick goes to the winner, who leads", () => {
    let state = playing({
      hands: {
        a: cards("5:clubs", "2:spades"),
        b: cards("K:hearts", "3:spades"),
        c: cards("J:clubs", "4:spades"),
        d: cards("10:clubs", "5:spades")
      }
    });
    state = apply(state, { type: "play", seat: "a", card: cards("5:clubs")[0] });
    state = apply(state, { type: "play", seat: "b", card: cards("K:hearts")[0] });
    expect(state.heartsBroken).toBe(true);
    state = apply(state, { type: "play", seat: "c", card: cards("J:clubs")[0] });
    state = apply(state, { type: "play", seat: "d", card: cards("10:clubs")[0] });
    expect(state.trick).toEqual([]);
    expect(state.lastTrick?.winner).toBe("c");
    expect(state.toAct).toBe("c");
    expect(state.taken.c).toHaveLength(4);
    expect(state.trickNumber).toBe(3);
  });
});

describe("scoring", () => {
  // The last trick of a hand, with `taken` pre-loaded to set up the score.
  function lastTrick(taken: Record<Seat, Card[]>, scores = { a: 0, b: 0, c: 0, d: 0 }) {
    return playing({
      trickNumber: 13,
      heartsBroken: true,
      taken,
      scores,
      hands: { a: cards("2:clubs"), b: cards("3:clubs"), c: cards("4:clubs"), d: cards("5:clubs") }
    });
  }
  const finish = (state: EngineState) =>
    ["a", "b", "c", "d"].reduce(
      (s, seat) => apply(s, { type: "play", seat, card: s.hands[seat][0] }),
      state
    );
  const hearts = (n: number, from = 0) =>
    cards(...["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"].slice(from, from + n).map((r) => `${r}:hearts`));

  test("hearts are 1 each and the Q♠ 13", () => {
    expect(cardPoints(cards("2:hearts", "Q:spades", "K:spades"))).toBe(14);
    const state = finish(lastTrick({ a: [...hearts(10), ...cards("Q:spades")], b: hearts(3, 10), c: [], d: [] }));
    expect(state.phase).toBe("handOver");
    expect(state.handScore).toEqual({ points: { a: 23, b: 3, c: 0, d: 0 }, moon: null });
    expect(state.scores).toEqual({ a: 23, b: 3, c: 0, d: 0 });
  });

  test("taking all 26 shoots the moon", () => {
    const state = finish(lastTrick({ a: [...hearts(13), ...cards("Q:spades")], b: [], c: [], d: [] }));
    expect(state.handScore).toEqual({ points: { a: 0, b: 26, c: 26, d: 26 }, moon: "a" });
  });

  test("reaching 100 ends the game; lowest total wins", () => {
    const state = finish(
      lastTrick({ a: [...hearts(10), ...cards("Q:spades")], b: hearts(3, 10), c: [], d: [] }, { a: 80, b: 10, c: 40, d: 40 })
    );
    expect(state.phase).toBe("gameOver");
    expect(state.scores.a).toBe(103);
    expect(state.winners).toEqual(["b"]);
    // The next deal starts a fresh game.
    const next = apply(state, { type: "startHand" });
    expect(next.scores).toEqual({ a: 0, b: 0, c: 0, d: 0 });
    expect(next.handNumber).toBe(1);
    expect(next.passDirection).toBe("left");
  });
});

// Random but legal whole games: each step picks among the legal moves.
function playGame(seed: number, picks: number[], maxHands = 40) {
  let state = initialState(seed, SEATS);
  const log: Action[] = [];
  const step = (action: Action) => {
    state = apply(state, action);
    log.push(action);
  };
  let n = 0;
  const pick = () => picks[n++ % picks.length];
  for (let hand = 0; hand < maxHands && state.phase !== "gameOver"; hand++) {
    step({ type: "startHand" });
    if (state.phase === "passing") {
      for (const seat of SEATS) {
        const held = state.hands[seat];
        const start = pick() % (held.length - 2);
        step({ type: "pass", seat, cards: held.slice(start, start + 3) });
      }
    }
    while (state.phase === "playing") {
      expect(new Set(allCards(state).map(cardKey)).size).toBe(52);
      const seat = state.toAct!;
      const legal = legalPlays(state, seat);
      expect(legal.length).toBeGreaterThan(0);
      step({ type: "play", seat, card: legal[pick() % legal.length] });
    }
    const handTotal = Object.values(state.handScore!.points).reduce((a, b) => a + b, 0);
    expect(state.handScore!.moon ? handTotal === 78 : handTotal === 26).toBe(true);
  }
  return { state, log };
}

describe("properties", () => {
  const seed = fc.integer({ min: 0, max: 0xffffffff });
  const picks = fc.array(fc.nat(1000), { minLength: 1, maxLength: 40 });

  test("random legal games conserve the deck, score 26 a hand, and end at 100", () => {
    fc.assert(
      fc.property(seed, picks, (s, p) => {
        const { state } = playGame(s, p);
        expect(state.phase).toBe("gameOver");
        expect(Math.max(...Object.values(state.scores))).toBeGreaterThanOrEqual(GAME_OVER_AT);
        const low = Math.min(...Object.values(state.scores));
        expect(state.winners.every((seat) => state.scores[seat] === low)).toBe(true);
      }),
      { numRuns: 40 }
    );
  });

  test("replaying a game's log reproduces it exactly", () => {
    fc.assert(
      fc.property(seed, picks, (s, p) => {
        const { state, log } = playGame(s, p, 3);
        let replayed = initialState(s, SEATS);
        for (const action of log) replayed = apply(replayed, action);
        expect(replayed).toEqual(state);
      }),
      { numRuns: 40 }
    );
  });
});
