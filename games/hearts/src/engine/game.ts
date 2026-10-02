import { newDeck, shuffle } from "@card-games/card-kit/deck.ts";
import { sameCard } from "@card-games/card-kit/cards.ts";
import type { Card } from "@card-games/card-kit/cards.ts";
import { followable, trickWinner } from "@card-games/card-kit/tricks.ts";
import type { Played, Seat } from "@card-games/card-kit/tricks.ts";

export type { Played, Seat };

// Hearts for exactly four players. Pure: state is a function of (seed,
// seat order, ordered action log), so every client replays the relay's log
// to the identical table. Every hand is fully determined on every client —
// hiding opponents' cards (and what they passed) is the UI's job.

export const SEATS = 4;
export const GAME_OVER_AT = 100;
export const MOON = 26;

export type Phase = "awaitingStart" | "passing" | "playing" | "handOver" | "gameOver";

// Hand 1 passes left, then right, across, and a hold hand; repeat.
export type PassDirection = "left" | "right" | "across" | "hold";
export const PASS_CYCLE: readonly PassDirection[] = ["left", "right", "across", "hold"];
const PASS_OFFSET: Record<PassDirection, number> = { left: 1, right: 3, across: 2, hold: 0 };

export interface HandScore {
  // Points each seat took this hand, after any moon shot.
  readonly points: Readonly<Record<Seat, number>>;
  readonly moon: Seat | null;
}

export interface EngineState {
  readonly prngState: number;
  readonly seats: readonly Seat[];
  readonly handNumber: number;
  readonly phase: Phase;
  readonly hands: Readonly<Record<Seat, readonly Card[]>>;
  readonly passDirection: PassDirection;
  // Each seat's three chosen cards, null until chosen. Exchanged together
  // once all four have chosen.
  readonly passed: Readonly<Record<Seat, readonly Card[] | null>>;
  readonly trick: readonly Played[];
  // 1-13 within a hand.
  readonly trickNumber: number;
  readonly lastTrick: { readonly cards: readonly Played[]; readonly winner: Seat } | null;
  readonly taken: Readonly<Record<Seat, readonly Card[]>>;
  readonly heartsBroken: boolean;
  readonly toAct: Seat | null;
  readonly handScore: HandScore | null;
  readonly scores: Readonly<Record<Seat, number>>;
  // Lowest score(s) once someone reaches GAME_OVER_AT.
  readonly winners: readonly Seat[];
}

export type Action =
  | { type: "startHand" }
  | { type: "pass"; seat: Seat; cards: readonly Card[] }
  | { type: "play"; seat: Seat; card: Card };

export type RejectReason =
  | "wrongPhase"
  | "wrongSeat"
  | "cardNotInHand"
  | "alreadyPassed"
  | "passThree" // exactly three distinct held cards
  | "mustLeadTwoOfClubs"
  | "mustFollowSuit"
  | "heartsNotBroken"
  | "noPointsOnFirstTrick";

export type AdvanceResult =
  | { ok: true; state: EngineState }
  | { ok: false; reason: RejectReason };

const TWO_OF_CLUBS: Card = { rank: "2", suit: "clubs" };
const QUEEN_OF_SPADES: Card = { rank: "Q", suit: "spades" };

export function isPointCard(card: Card): boolean {
  return card.suit === "hearts" || sameCard(card, QUEEN_OF_SPADES);
}

export function cardPoints(cards: readonly Card[]): number {
  return cards.reduce(
    (sum, card) => sum + (card.suit === "hearts" ? 1 : sameCard(card, QUEEN_OF_SPADES) ? 13 : 0),
    0
  );
}

export function nextSeat(state: Pick<EngineState, "seats">, seat: Seat, steps = 1): Seat {
  const index = state.seats.indexOf(seat);
  return state.seats[(index + steps) % state.seats.length];
}

// Who `seat` passes to this hand.
export function passTarget(state: EngineState, seat: Seat): Seat {
  return nextSeat(state, seat, PASS_OFFSET[state.passDirection]);
}

const bySeat = <T>(seats: readonly Seat[], value: (seat: Seat) => T): Record<Seat, T> =>
  Object.fromEntries(seats.map((seat) => [seat, value(seat)]));

export function initialState(seed: number, seats: readonly Seat[]): EngineState {
  if (seats.length !== SEATS) throw new Error(`hearts needs exactly ${SEATS} seats`);
  return {
    prngState: seed >>> 0,
    seats,
    handNumber: 0,
    phase: "awaitingStart",
    hands: bySeat<readonly Card[]>(seats, () => []),
    passDirection: "left",
    passed: bySeat<readonly Card[] | null>(seats, () => null),
    trick: [],
    trickNumber: 1,
    lastTrick: null,
    taken: bySeat<readonly Card[]>(seats, () => []),
    heartsBroken: false,
    toAct: null,
    handScore: null,
    scores: bySeat(seats, () => 0),
    winners: []
  };
}

// The cards `seat` may play right now. The reducer's guards agree with this
// exactly (see rejectionFor).
export function legalPlays(state: EngineState, seat: Seat): Card[] {
  if (state.phase !== "playing" || state.toAct !== seat) return [];
  const hand = state.hands[seat];
  if (state.trick.length === 0) {
    if (state.trickNumber === 1) return hand.filter((card) => sameCard(card, TWO_OF_CLUBS));
    if (state.heartsBroken) return [...hand];
    const nonHearts = hand.filter((card) => card.suit !== "hearts");
    return nonHearts.length > 0 ? nonHearts : [...hand];
  }
  const following = followable(hand, state.trick);
  if (state.trickNumber === 1) {
    const safe = following.filter((card) => !isPointCard(card));
    return safe.length > 0 ? safe : following;
  }
  return following;
}

function rejectionFor(state: EngineState, seat: Seat): RejectReason {
  const hand = state.hands[seat];
  if (state.trick.length === 0)
    return state.trickNumber === 1 ? "mustLeadTwoOfClubs" : "heartsNotBroken";
  if (hand.some((card) => card.suit === state.trick[0].card.suit)) return "mustFollowSuit";
  return "noPointsOnFirstTrick";
}

export function advance(state: EngineState, action: Action): AdvanceResult {
  switch (action.type) {
    case "startHand":
      return startHand(state);
    case "pass":
      return pass(state, action.seat, action.cards);
    case "play":
      return play(state, action.seat, action.card);
  }
}

function holderOf(hands: Readonly<Record<Seat, readonly Card[]>>, card: Card): Seat {
  const holder = Object.keys(hands).find((seat) => hands[seat].some((held) => sameCard(held, card)));
  if (!holder) throw new Error("card not dealt");
  return holder;
}

// Deal 13 each, one at a time around the table. A hold hand skips straight
// to play; otherwise everyone chooses three cards to pass. After a game
// ends, the next startHand begins a new game.
function startHand(state: EngineState): AdvanceResult {
  if (state.phase !== "awaitingStart" && state.phase !== "handOver" && state.phase !== "gameOver")
    return { ok: false, reason: "wrongPhase" };

  const fresh = state.phase === "gameOver";
  const handNumber = fresh ? 1 : state.handNumber + 1;
  const passDirection = PASS_CYCLE[(handNumber - 1) % PASS_CYCLE.length];
  const shuffled = shuffle(newDeck(), state.prngState);
  const hands = bySeat<Card[]>(state.seats, () => []);
  shuffled.cards.forEach((card, index) => hands[state.seats[index % SEATS]].push(card));

  const dealt: EngineState = {
    ...state,
    prngState: shuffled.state,
    handNumber,
    phase: "passing",
    hands,
    passDirection,
    passed: bySeat<readonly Card[] | null>(state.seats, () => null),
    trick: [],
    trickNumber: 1,
    lastTrick: null,
    taken: bySeat<readonly Card[]>(state.seats, () => []),
    heartsBroken: false,
    toAct: null,
    handScore: null,
    scores: fresh ? bySeat(state.seats, () => 0) : state.scores,
    winners: []
  };
  return { ok: true, state: passDirection === "hold" ? beginPlay(dealt) : dealt };
}

function beginPlay(state: EngineState): EngineState {
  return { ...state, phase: "playing", toAct: holderOf(state.hands, TWO_OF_CLUBS) };
}

function pass(state: EngineState, seat: Seat, cards: readonly Card[]): AdvanceResult {
  if (state.phase !== "passing") return { ok: false, reason: "wrongPhase" };
  if (!state.seats.includes(seat)) return { ok: false, reason: "wrongSeat" };
  if (state.passed[seat] !== null) return { ok: false, reason: "alreadyPassed" };
  const hand = state.hands[seat];
  const distinct = cards.every((card, index) => cards.findIndex((other) => sameCard(other, card)) === index);
  if (
    cards.length !== 3 ||
    !distinct ||
    !cards.every((card) => hand.some((held) => sameCard(held, card)))
  )
    return { ok: false, reason: "passThree" };

  const passed = { ...state.passed, [seat]: cards };
  if (state.seats.some((each) => passed[each] === null)) {
    return { ok: true, state: { ...state, passed } };
  }
  // Everyone has chosen: swap simultaneously.
  const hands = bySeat<Card[]>(state.seats, (each) =>
    state.hands[each].filter((card) => !passed[each]!.some((out) => sameCard(out, card)))
  );
  for (const giver of state.seats) hands[passTarget(state, giver)].push(...passed[giver]!);
  return { ok: true, state: beginPlay({ ...state, passed, hands }) };
}

function play(state: EngineState, seat: Seat, card: Card): AdvanceResult {
  if (state.phase !== "playing") return { ok: false, reason: "wrongPhase" };
  if (seat !== state.toAct) return { ok: false, reason: "wrongSeat" };
  const hand = state.hands[seat];
  if (!hand.some((held) => sameCard(held, card))) return { ok: false, reason: "cardNotInHand" };
  if (!legalPlays(state, seat).some((legal) => sameCard(legal, card)))
    return { ok: false, reason: rejectionFor(state, seat) };

  const trick = [...state.trick, { seat, card }];
  const after: EngineState = {
    ...state,
    hands: { ...state.hands, [seat]: hand.filter((held) => !sameCard(held, card)) },
    trick,
    heartsBroken: state.heartsBroken || card.suit === "hearts"
  };
  if (trick.length < SEATS) {
    return { ok: true, state: { ...after, toAct: nextSeat(state, seat) } };
  }

  // The trick is complete: the winner takes it and leads the next.
  const winner = trickWinner(trick);
  const collected: EngineState = {
    ...after,
    trick: [],
    trickNumber: state.trickNumber + 1,
    lastTrick: { cards: trick, winner },
    taken: { ...state.taken, [winner]: [...state.taken[winner], ...trick.map((each) => each.card)] },
    toAct: winner
  };
  return { ok: true, state: state.trickNumber === 13 ? scoreHand(collected) : collected };
}

// Hearts 1 each, the Q♠ 13. Taking all 26 shoots the moon: 0 for the
// shooter, 26 for everyone else. The game ends when anyone reaches 100;
// lowest total wins (ties share it).
function scoreHand(state: EngineState): EngineState {
  const taken = bySeat(state.seats, (seat) => cardPoints(state.taken[seat]));
  const moon = state.seats.find((seat) => taken[seat] === MOON) ?? null;
  const points = moon ? bySeat(state.seats, (seat) => (seat === moon ? 0 : MOON)) : taken;
  const scores = bySeat(state.seats, (seat) => state.scores[seat] + points[seat]);
  const over = state.seats.some((seat) => scores[seat] >= GAME_OVER_AT);
  const low = Math.min(...state.seats.map((seat) => scores[seat]));
  return {
    ...state,
    phase: over ? "gameOver" : "handOver",
    toAct: null,
    handScore: { points, moon },
    scores,
    winners: over ? state.seats.filter((seat) => scores[seat] === low) : []
  };
}
