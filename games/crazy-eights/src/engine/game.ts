import { newDeck, shuffle } from "@card-games/card-kit/deck.ts";
import { sameCard } from "@card-games/card-kit/cards.ts";
import type { Card, Suit } from "@card-games/card-kit/cards.ts";
import { handPoints } from "./scoring.ts";

// Crazy Eights for 2-6 players. Pure: state is a function of (seed, seat
// order, ordered action log) and nothing else — no Date, no Math.random —
// so every client replays the relay's log to the identical table.

// Seat ids come from the relay contract ('a', 'b', ...) in seat order.
export type Seat = string;

export type Phase = "awaitingStart" | "play" | "handOver";

export type HandResult =
  // Someone played their last card.
  | { type: "out"; winner: Seat; points: number }
  // Nobody could draw or play: lowest hand wins, or nobody on a tie.
  | { type: "blocked"; winner: Seat | null; points: number };

export interface EngineState {
  readonly prngState: number;
  readonly seats: readonly Seat[];
  readonly dealer: Seat;
  readonly handNumber: number;
  readonly phase: Phase;
  readonly hands: Readonly<Record<Seat, readonly Card[]>>;
  // Top first.
  readonly stock: readonly Card[];
  // The top card is the last element.
  readonly discardPile: readonly Card[];
  // The suit to follow: the top card's suit, or the suit named with an 8.
  readonly activeSuit: Suit | null;
  readonly toAct: Seat | null;
  // Consecutive passes; a full round of them blocks the hand.
  readonly passes: number;
  readonly result: HandResult | null;
  readonly scores: Readonly<Record<Seat, number>>;
}

export type Action =
  | { type: "startHand" }
  | { type: "play"; seat: Seat; card: Card; suit?: Suit }
  | { type: "draw"; seat: Seat }
  | { type: "pass"; seat: Seat };

export type RejectReason =
  | "wrongPhase"
  | "wrongSeat"
  | "cardNotInHand"
  | "doesNotMatch"
  | "suitRequired" // an 8 must name a suit
  | "suitNotAllowed" // only an 8 names a suit
  | "nothingToDraw"
  | "mustDraw"; // pass only when the stock can't be drawn from

export type AdvanceResult =
  | { ok: true; state: EngineState }
  | { ok: false; reason: RejectReason };

export const MIN_SEATS = 2;
export const MAX_SEATS = 6;

export function cardsPerHand(seatCount: number): number {
  return seatCount === 2 ? 7 : 5;
}

export function nextSeat(state: Pick<EngineState, "seats">, seat: Seat): Seat {
  const index = state.seats.indexOf(seat);
  return state.seats[(index + 1) % state.seats.length];
}

export function initialState(
  seed: number,
  seats: readonly Seat[],
  dealer: Seat
): EngineState {
  if (seats.length < MIN_SEATS || seats.length > MAX_SEATS)
    throw new Error(`crazy eights needs ${MIN_SEATS}-${MAX_SEATS} seats`);
  if (!seats.includes(dealer)) throw new Error(`dealer ${dealer} not seated`);
  const empty = <T>(value: T) =>
    Object.fromEntries(seats.map((seat) => [seat, value])) as Record<Seat, T>;
  return {
    prngState: seed >>> 0,
    seats,
    dealer,
    handNumber: 0,
    phase: "awaitingStart",
    hands: empty<readonly Card[]>([]),
    stock: [],
    discardPile: [],
    activeSuit: null,
    toAct: null,
    passes: 0,
    result: null,
    scores: empty(0)
  };
}

export function topCard(state: EngineState): Card | null {
  return state.discardPile[state.discardPile.length - 1] ?? null;
}

// Whether `card` may go on the pile now: any 8, or a match on the suit in
// force or the top card's rank.
export function canPlay(state: EngineState, card: Card): boolean {
  if (card.rank === "8") return true;
  const top = topCard(state);
  return card.suit === state.activeSuit || (top !== null && card.rank === top.rank);
}

export function playableCards(state: EngineState, seat: Seat): Card[] {
  if (state.phase !== "play" || state.toAct !== seat) return [];
  return state.hands[seat].filter((card) => canPlay(state, card));
}

// The stock can be drawn from directly, or refilled from the discard pile
// beneath its top card.
export function canDraw(state: EngineState): boolean {
  return state.stock.length > 0 || state.discardPile.length > 1;
}

export function legalActions(state: EngineState, seat: Seat): Action["type"][] {
  switch (state.phase) {
    case "awaitingStart":
    case "handOver":
      return ["startHand"];
    case "play": {
      if (seat !== state.toAct) return [];
      const legal: Action["type"][] = [];
      if (playableCards(state, seat).length > 0) legal.push("play");
      legal.push(canDraw(state) ? "draw" : "pass");
      return legal;
    }
  }
}

export function advance(state: EngineState, action: Action): AdvanceResult {
  switch (action.type) {
    case "startHand":
      return startHand(state);
    case "play":
      return play(state, action.seat, action.card, action.suit);
    case "draw":
      return draw(state, action.seat);
    case "pass":
      return pass(state, action.seat);
  }
}

function turnRejection(state: EngineState, seat: Seat): RejectReason | null {
  if (state.phase !== "play") return "wrongPhase";
  if (seat !== state.toAct) return "wrongSeat";
  return null;
}

// Deal one card at a time, starting left of the dealer. The next card
// starts the pile; an 8 can't start it (it would hand the first player a
// free suit), so it goes under the stock and the next card is turned.
// The dealer passes left each hand after the first.
function startHand(state: EngineState): AdvanceResult {
  if (state.phase !== "awaitingStart" && state.phase !== "handOver")
    return { ok: false, reason: "wrongPhase" };

  const dealer =
    state.phase === "handOver" ? nextSeat(state, state.dealer) : state.dealer;
  const shuffled = shuffle(newDeck(), state.prngState);
  const deck = shuffled.cards;
  const perHand = cardsPerHand(state.seats.length);

  const hands: Record<Seat, Card[]> = Object.fromEntries(
    state.seats.map((seat) => [seat, []])
  );
  let seat = nextSeat(state, dealer);
  let next = 0;
  for (let i = 0; i < perHand * state.seats.length; i++) {
    hands[seat].push(deck[next++]);
    seat = nextSeat(state, seat);
  }
  let stock = deck.slice(next);
  while (stock[0].rank === "8") stock = [...stock.slice(1), stock[0]];
  const starter = stock[0];

  return {
    ok: true,
    state: {
      ...state,
      prngState: shuffled.state,
      dealer,
      handNumber: state.handNumber + 1,
      phase: "play",
      hands,
      stock: stock.slice(1),
      discardPile: [starter],
      activeSuit: starter.suit,
      toAct: nextSeat(state, dealer),
      passes: 0,
      result: null
    }
  };
}

function play(
  state: EngineState,
  seat: Seat,
  card: Card,
  suit: Suit | undefined
): AdvanceResult {
  const rejection = turnRejection(state, seat);
  if (rejection) return { ok: false, reason: rejection };
  const hand = state.hands[seat];
  const held = hand.findIndex((heldCard) => sameCard(heldCard, card));
  if (held === -1) return { ok: false, reason: "cardNotInHand" };
  if (card.rank === "8" && !suit) return { ok: false, reason: "suitRequired" };
  if (card.rank !== "8" && suit) return { ok: false, reason: "suitNotAllowed" };
  if (!canPlay(state, card)) return { ok: false, reason: "doesNotMatch" };

  const remaining = hand.filter((_, index) => index !== held);
  const played: EngineState = {
    ...state,
    hands: { ...state.hands, [seat]: remaining },
    discardPile: [...state.discardPile, hand[held]],
    activeSuit: suit ?? card.suit,
    passes: 0
  };
  if (remaining.length === 0) {
    const points = state.seats
      .filter((other) => other !== seat)
      .reduce((sum, other) => sum + handPoints(played.hands[other]), 0);
    return {
      ok: true,
      state: endHand(played, { type: "out", winner: seat, points })
    };
  }
  return { ok: true, state: { ...played, toAct: nextSeat(state, seat) } };
}

// Draw one card; the turn stays with the drawer, who may play or draw
// again. An empty stock is rebuilt from the pile under the top card,
// reshuffled from the engine's own PRNG so every client agrees.
function draw(state: EngineState, seat: Seat): AdvanceResult {
  const rejection = turnRejection(state, seat);
  if (rejection) return { ok: false, reason: rejection };
  if (!canDraw(state)) return { ok: false, reason: "nothingToDraw" };

  let { stock, discardPile, prngState } = state;
  if (stock.length === 0) {
    const reshuffled = shuffle(discardPile.slice(0, -1), prngState);
    stock = reshuffled.cards;
    prngState = reshuffled.state;
    discardPile = discardPile.slice(-1);
  }
  return {
    ok: true,
    state: {
      ...state,
      prngState,
      hands: { ...state.hands, [seat]: [...state.hands[seat], stock[0]] },
      stock: stock.slice(1),
      discardPile,
      passes: 0
    }
  };
}

// Only when there is nothing left to draw. If every seat passes in a row
// the hand is blocked: the lowest hand scores everyone else's cards.
function pass(state: EngineState, seat: Seat): AdvanceResult {
  const rejection = turnRejection(state, seat);
  if (rejection) return { ok: false, reason: rejection };
  if (canDraw(state)) return { ok: false, reason: "mustDraw" };

  const passes = state.passes + 1;
  if (passes < state.seats.length) {
    return {
      ok: true,
      state: { ...state, passes, toAct: nextSeat(state, seat) }
    };
  }
  const totals = state.seats.map((each) => handPoints(state.hands[each]));
  const lowest = Math.min(...totals);
  const lowSeats = state.seats.filter((_, index) => totals[index] === lowest);
  const winner = lowSeats.length === 1 ? lowSeats[0] : null;
  const points = winner
    ? totals.reduce((sum, total) => sum + total, 0) - lowest
    : 0;
  return {
    ok: true,
    state: endHand({ ...state, passes }, { type: "blocked", winner, points })
  };
}

function endHand(state: EngineState, result: HandResult): EngineState {
  const scores = result.winner
    ? { ...state.scores, [result.winner]: state.scores[result.winner] + result.points }
    : state.scores;
  return { ...state, phase: "handOver", toAct: null, result, scores };
}
