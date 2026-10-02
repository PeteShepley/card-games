import { describe, expect, test } from "vitest";
import fc from "fast-check";
import { cardKey } from "@card-games/card-kit/cards.ts";
import { cards } from "@card-games/card-kit/testCards.ts";
import {
  LOSE_AT,
  WIN_AT,
  advance,
  initialState,
  legalPlays,
  partnerOf,
  scoreTeam,
  teamOf
} from "./game.ts";
import type { Action, EngineState, Seat } from "./game.ts";

const SEATS = ["a", "b", "c", "d"];

function apply(state: EngineState, action: Action): EngineState {
  const result = advance(state, action);
  if (!result.ok) throw new Error(`rejected: ${result.reason}`);
  return result.state;
}

function bidAll(state: EngineState, bids: Record<Seat, number>): EngineState {
  let next = state;
  while (next.phase === "bidding") next = apply(next, { type: "bid", seat: next.toAct!, bid: bids[next.toAct!] });
  return next;
}

const allCards = (state: EngineState) => [
  ...state.seats.flatMap((seat) => state.hands[seat]),
  ...state.trick.map((played) => played.card)
];

function playing(over: Partial<EngineState>): EngineState {
  return {
    ...initialState(1, SEATS, "d"),
    phase: "playing",
    handNumber: 1,
    bids: { a: 3, b: 3, c: 3, d: 3 },
    trickNumber: 2,
    toAct: "a",
    ...over
  };
}

describe("teams", () => {
  test("partners sit across: a+c against b+d", () => {
    const state = initialState(1, SEATS, "a");
    expect([teamOf(state, "a"), teamOf(state, "b"), teamOf(state, "c"), teamOf(state, "d")]).toEqual([0, 1, 0, 1]);
    expect(partnerOf(state, "a")).toBe("c");
    expect(partnerOf(state, "d")).toBe("b");
  });
});

describe("deal and bid", () => {
  test("13 each; bidding then play start left of the dealer", () => {
    let state = apply(initialState(42, SEATS, "a"), { type: "startHand" });
    expect(state.phase).toBe("bidding");
    expect(state.toAct).toBe("b");
    for (const seat of SEATS) expect(state.hands[seat]).toHaveLength(13);
    expect(new Set(allCards(state).map(cardKey)).size).toBe(52);

    state = apply(state, { type: "bid", seat: "b", bid: 4 });
    expect(state.toAct).toBe("c");
    state = bidAll(state, { a: 2, b: 4, c: 0, d: 3 });
    expect(state.phase).toBe("playing");
    expect(state.toAct).toBe("b");
    expect(state.bids).toEqual({ a: 2, b: 4, c: 0, d: 3 });
  });

  test.each([[-1], [14], [2.5]])("refuses a bid of %s", (value) => {
    const state = apply(initialState(42, SEATS, "a"), { type: "startHand" });
    expect(advance(state, { type: "bid", seat: "b", bid: value })).toEqual({ ok: false, reason: "badBid" });
  });

  test("bids are taken in turn", () => {
    const state = apply(initialState(42, SEATS, "a"), { type: "startHand" });
    expect(advance(state, { type: "bid", seat: "c", bid: 3 })).toEqual({ ok: false, reason: "wrongSeat" });
  });

  test("the deal passes left each hand", () => {
    const first = apply(initialState(42, SEATS, "a"), { type: "startHand" });
    const second = apply({ ...first, phase: "handOver" }, { type: "startHand" });
    expect(second.dealer).toBe("b");
    expect(second.toAct).toBe("c");
  });
});

describe("play", () => {
  test("spades can't be led until broken, unless that's all you hold", () => {
    const state = playing({ hands: { a: cards("2:spades", "3:hearts"), b: [], c: [], d: [] } });
    expect(legalPlays(state, "a")).toEqual(cards("3:hearts"));
    expect(advance(state, { type: "play", seat: "a", card: cards("2:spades")[0] })).toEqual({
      ok: false,
      reason: "spadesNotBroken"
    });
    expect(legalPlays({ ...state, hands: { ...state.hands, a: cards("2:spades") } }, "a")).toEqual(cards("2:spades"));
  });

  test("must follow suit; a void player may trump, which breaks spades", () => {
    let state = playing({
      hands: {
        a: cards("K:hearts", "9:clubs"),
        b: cards("2:spades", "4:diamonds"),
        c: cards("A:hearts", "Q:clubs"),
        d: cards("5:hearts", "J:clubs")
      }
    });
    state = apply(state, { type: "play", seat: "a", card: cards("K:hearts")[0] });
    state = apply(state, { type: "play", seat: "b", card: cards("2:spades")[0] });
    expect(state.spadesBroken).toBe(true);
    expect(advance(state, { type: "play", seat: "c", card: cards("Q:clubs")[0] })).toEqual({
      ok: false,
      reason: "mustFollowSuit"
    });
    state = apply(state, { type: "play", seat: "c", card: cards("A:hearts")[0] });
    state = apply(state, { type: "play", seat: "d", card: cards("5:hearts")[0] });
    // The 2♠ trumps the A♥.
    expect(state.lastTrick?.winner).toBe("b");
    expect(state.tricksWon.b).toBe(1);
    expect(state.toAct).toBe("b");
  });
});

describe("scoring", () => {
  function scored(bids: Record<Seat, number>, won: Record<Seat, number>, bags: [number, number] = [0, 0]) {
    const state = playing({ bids, tricksWon: won, bags });
    return [scoreTeam(state, 0, bags[0]), scoreTeam(state, 1, bags[1])] as const;
  }

  test("a made contract scores 10 a trick plus 1 a bag; a missed one loses 10 a trick", () => {
    const [ac, bd] = scored({ a: 3, b: 4, c: 2, d: 3 }, { a: 4, b: 2, c: 2, d: 5 });
    expect(ac).toMatchObject({ contract: 5, tricks: 6, made: true, bags: 1, points: 51 });
    expect(bd).toMatchObject({ contract: 7, tricks: 7, made: true, bags: 0, points: 70 });
    const [missed] = scored({ a: 5, b: 4, c: 4, d: 0 }, { a: 4, b: 5, c: 4, d: 0 });
    expect(missed).toMatchObject({ contract: 9, tricks: 8, made: false, points: -90 });
  });

  test("nil is +100 if no tricks are taken, -100 otherwise, and doesn't carry the partner", () => {
    // c bid nil and took none; a bid 4 and took 4.
    const [made] = scored({ a: 4, b: 5, c: 0, d: 4 }, { a: 4, b: 5, c: 0, d: 4 });
    expect(made).toMatchObject({ contract: 4, made: true, nils: [{ seat: "c", made: true }], points: 140 });
    // c took 2 tricks: nil fails, those are bags, and they don't help a's 4.
    const [failed] = scored({ a: 4, b: 4, c: 0, d: 3 }, { a: 3, b: 4, c: 2, d: 4 });
    expect(failed).toMatchObject({ contract: 4, tricks: 3, made: false, bags: 2 });
    expect(failed.points).toBe(-40 - 100 + 2);
  });

  test("every ten bags costs 100", () => {
    const [ac] = scored({ a: 2, b: 4, c: 2, d: 4 }, { a: 3, b: 4, c: 2, d: 4 }, [9, 0]);
    expect(ac).toMatchObject({ bags: 1, bagPenalty: true, bagsAfter: 0, points: 41 - 100 });
  });

  test("the game ends at 500 or -200; the higher score wins", () => {
    const last = (scores: [number, number]) => {
      const state = playing({
        trickNumber: 13,
        spadesBroken: true,
        bids: { a: 1, b: 1, c: 1, d: 1 },
        tricksWon: { a: 6, b: 0, c: 6, d: 0 },
        scores,
        hands: { a: cards("A:clubs"), b: cards("2:clubs"), c: cards("3:clubs"), d: cards("4:clubs") }
      });
      return ["a", "b", "c", "d"].reduce((s, seat) => apply(s, { type: "play", seat, card: s.hands[seat][0] }), state);
    };
    // a+c made 2 bid with 13 tricks: 20 + 11 bags (penalty) = -69. b+d set: -20.
    const nearWin = last([470, 100]);
    expect(nearWin.phase).toBe("handOver");
    expect(nearWin.scores).toEqual([401, 80]);
    const lost = last([100, LOSE_AT + 10]);
    expect(lost.phase).toBe("gameOver");
    expect(lost.winner).toBe(0);
    expect(WIN_AT).toBe(500);
  });
});

// Whole random games: bids random, plays random among the legal.
function playGame(seed: number, picks: number[], maxHands = 60) {
  let state = initialState(seed, SEATS, "a");
  const log: Action[] = [];
  const step = (action: Action) => {
    state = apply(state, action);
    log.push(action);
  };
  let n = 0;
  const pick = () => picks[n++ % picks.length];
  for (let hand = 0; hand < maxHands && state.phase !== "gameOver"; hand++) {
    step({ type: "startHand" });
    while (state.phase === "bidding") step({ type: "bid", seat: state.toAct!, bid: pick() % 6 });
    while (state.phase === "playing") {
      const seat = state.toAct!;
      const legal = legalPlays(state, seat);
      expect(legal.length).toBeGreaterThan(0);
      step({ type: "play", seat, card: legal[pick() % legal.length] });
      // Every card is in a hand, on the table, or in a won trick.
      const won = Object.values(state.tricksWon).reduce((a, b) => a + b, 0);
      expect(new Set(allCards(state).map(cardKey)).size).toBe(allCards(state).length);
      expect(allCards(state).length + 4 * won).toBe(52);
    }
    expect(Object.values(state.tricksWon).reduce((a, b) => a + b, 0)).toBe(13);
  }
  return { state, log };
}

describe("properties", () => {
  const seed = fc.integer({ min: 0, max: 0xffffffff });
  const picks = fc.array(fc.nat(1000), { minLength: 1, maxLength: 40 });

  test("random games keep their invariants, and any that end have a rightful winner", () => {
    fc.assert(
      fc.property(seed, picks, (s, p) => {
        // Not every game ends within the cap: two partnerships trading made
        // and set contracts can circle below 500 for a long time, as in
        // real play. playGame checks the per-hand invariants throughout.
        const { state } = playGame(s, p);
        expect(state.bags.every((bags) => bags >= 0 && bags < 10)).toBe(true);
        if (state.phase !== "gameOver") return;
        expect(state.winner).not.toBeNull();
        expect(state.scores[state.winner!]).toBeGreaterThan(state.scores[1 - state.winner!]);
        expect(Math.max(...state.scores) >= WIN_AT || Math.min(...state.scores) <= LOSE_AT).toBe(true);
      }),
      { numRuns: 40 }
    );
  });

  test("games under a varied chooser reach a result", () => {
    // A linear-congruential chooser varies bids and plays the way people
    // do; over these seeds every game ends well inside the cap.
    for (let seed = 1; seed <= 100; seed++) {
      let n = seed;
      const lcg = Array.from({ length: 997 }, () => (n = (Math.imul(n, 1103515245) + 12345) >>> 0) % 1000);
      const { state } = playGame(seed, lcg);
      expect(state.phase).toBe("gameOver");
    }
  });

  test("replaying a game's log reproduces it exactly", () => {
    fc.assert(
      fc.property(seed, picks, (s, p) => {
        const { state, log } = playGame(s, p, 3);
        let replayed = initialState(s, SEATS, "a");
        for (const action of log) replayed = apply(replayed, action);
        expect(replayed).toEqual(state);
      }),
      { numRuns: 40 }
    );
  });
});

test("bidAll helper bids around once", () => {
  const state = bidAll(apply(initialState(5, SEATS, "c"), { type: "startHand" }), { a: 1, b: 2, c: 3, d: 4 });
  expect(state.phase).toBe("playing");
  expect(state.toAct).toBe("d");
});
