import { newDeck, shuffle } from "@card-games/card-kit/deck.ts";
import { sameCard } from "@card-games/card-kit/cards.ts";
import type { Card } from "@card-games/card-kit/cards.ts";
import { followable, trickWinner } from "@card-games/card-kit/tricks.ts";
import type { Played, Seat } from "@card-games/card-kit/tricks.ts";

export type { Played, Seat };

// Partnership Spades for four players: seats 1 and 3 against 2 and 4 (in
// relay order, a+c vs b+d), spades always trump. Pure: state is a function
// of (seed, seat order, ordered action log); every client holds the whole
// deal, and hiding other hands is the UI's job.

export const SEATS = 4;
export const WIN_AT = 500;
export const LOSE_AT = -200;
export const NIL_BONUS = 100;
export const BAG_LIMIT = 10;
export const BAG_PENALTY = 100;

export type Team = 0 | 1;

export type Phase = "awaitingStart" | "bidding" | "playing" | "handOver" | "gameOver";

export interface TeamHandScore {
  // Sum of the members' non-nil bids, and the tricks those members took.
  readonly contract: number;
  readonly tricks: number;
  readonly made: boolean;
  readonly nils: readonly { readonly seat: Seat; readonly made: boolean }[];
  // Overtricks plus tricks taken by a failed nil.
  readonly bags: number;
  readonly bagPenalty: boolean;
  readonly points: number;
}

export interface EngineState {
  readonly prngState: number;
  readonly seats: readonly Seat[];
  readonly dealer: Seat;
  readonly handNumber: number;
  readonly phase: Phase;
  readonly hands: Readonly<Record<Seat, readonly Card[]>>;
  // 0 is nil; null until that seat bids.
  readonly bids: Readonly<Record<Seat, number | null>>;
  readonly trick: readonly Played[];
  readonly trickNumber: number;
  readonly lastTrick: { readonly cards: readonly Played[]; readonly winner: Seat } | null;
  readonly tricksWon: Readonly<Record<Seat, number>>;
  readonly spadesBroken: boolean;
  readonly toAct: Seat | null;
  readonly handScore: readonly [TeamHandScore, TeamHandScore] | null;
  readonly scores: readonly [number, number];
  readonly bags: readonly [number, number];
  readonly winner: Team | null;
}

export type Action =
  | { type: "startHand" }
  | { type: "bid"; seat: Seat; bid: number }
  | { type: "play"; seat: Seat; card: Card };

export type RejectReason =
  | "wrongPhase"
  | "wrongSeat"
  | "badBid" // a whole number of tricks, 0 (nil) to 13
  | "cardNotInHand"
  | "mustFollowSuit"
  | "spadesNotBroken";

export type AdvanceResult =
  | { ok: true; state: EngineState }
  | { ok: false; reason: RejectReason };

export function teamOf(state: Pick<EngineState, "seats">, seat: Seat): Team {
  return (state.seats.indexOf(seat) % 2) as Team;
}

export function teamSeats(state: Pick<EngineState, "seats">, team: Team): [Seat, Seat] {
  return [state.seats[team], state.seats[team + 2]];
}

export function partnerOf(state: Pick<EngineState, "seats">, seat: Seat): Seat {
  return nextSeat(state, seat, 2);
}

export function nextSeat(state: Pick<EngineState, "seats">, seat: Seat, steps = 1): Seat {
  const index = state.seats.indexOf(seat);
  return state.seats[(index + steps) % state.seats.length];
}

const bySeat = <T>(seats: readonly Seat[], value: (seat: Seat) => T): Record<Seat, T> =>
  Object.fromEntries(seats.map((seat) => [seat, value(seat)]));

export function initialState(seed: number, seats: readonly Seat[], dealer: Seat): EngineState {
  if (seats.length !== SEATS) throw new Error(`spades needs exactly ${SEATS} seats`);
  if (!seats.includes(dealer)) throw new Error(`dealer ${dealer} not seated`);
  return {
    prngState: seed >>> 0,
    seats,
    dealer,
    handNumber: 0,
    phase: "awaitingStart",
    hands: bySeat<readonly Card[]>(seats, () => []),
    bids: bySeat<number | null>(seats, () => null),
    trick: [],
    trickNumber: 1,
    lastTrick: null,
    tricksWon: bySeat(seats, () => 0),
    spadesBroken: false,
    toAct: null,
    handScore: null,
    scores: [0, 0],
    bags: [0, 0],
    winner: null
  };
}

// The cards `seat` may play now; the reducer's guards agree exactly.
export function legalPlays(state: EngineState, seat: Seat): Card[] {
  if (state.phase !== "playing" || state.toAct !== seat) return [];
  const hand = state.hands[seat];
  if (state.trick.length > 0) return followable(hand, state.trick);
  if (state.spadesBroken) return [...hand];
  const nonSpades = hand.filter((card) => card.suit !== "spades");
  return nonSpades.length > 0 ? nonSpades : [...hand];
}

export function advance(state: EngineState, action: Action): AdvanceResult {
  switch (action.type) {
    case "startHand":
      return startHand(state);
    case "bid":
      return bid(state, action.seat, action.bid);
    case "play":
      return play(state, action.seat, action.card);
  }
}

// Deal 13 each, starting left of the dealer; bidding starts there too. The
// deal passes left each hand. After a game ends, the next deal starts a new
// game.
function startHand(state: EngineState): AdvanceResult {
  if (state.phase !== "awaitingStart" && state.phase !== "handOver" && state.phase !== "gameOver")
    return { ok: false, reason: "wrongPhase" };

  const fresh = state.phase === "gameOver";
  const dealer = state.phase === "awaitingStart" ? state.dealer : nextSeat(state, state.dealer);
  const shuffled = shuffle(newDeck(), state.prngState);
  const hands = bySeat<Card[]>(state.seats, () => []);
  shuffled.cards.forEach((card, index) => hands[nextSeat(state, dealer, 1 + (index % SEATS))].push(card));

  return {
    ok: true,
    state: {
      ...state,
      prngState: shuffled.state,
      dealer,
      handNumber: fresh ? 1 : state.handNumber + 1,
      phase: "bidding",
      hands,
      bids: bySeat<number | null>(state.seats, () => null),
      trick: [],
      trickNumber: 1,
      lastTrick: null,
      tricksWon: bySeat(state.seats, () => 0),
      spadesBroken: false,
      toAct: nextSeat(state, dealer),
      handScore: null,
      scores: fresh ? [0, 0] : state.scores,
      bags: fresh ? [0, 0] : state.bags,
      winner: null
    }
  };
}

// Bids go around once, left of the dealer first; the fourth bid starts play
// with the same seat on lead.
function bid(state: EngineState, seat: Seat, tricks: number): AdvanceResult {
  if (state.phase !== "bidding") return { ok: false, reason: "wrongPhase" };
  if (seat !== state.toAct) return { ok: false, reason: "wrongSeat" };
  if (!Number.isInteger(tricks) || tricks < 0 || tricks > 13) return { ok: false, reason: "badBid" };

  const bids = { ...state.bids, [seat]: tricks };
  if (state.seats.some((each) => bids[each] === null)) {
    return { ok: true, state: { ...state, bids, toAct: nextSeat(state, seat) } };
  }
  return { ok: true, state: { ...state, bids, phase: "playing", toAct: nextSeat(state, state.dealer) } };
}

function play(state: EngineState, seat: Seat, card: Card): AdvanceResult {
  if (state.phase !== "playing") return { ok: false, reason: "wrongPhase" };
  if (seat !== state.toAct) return { ok: false, reason: "wrongSeat" };
  const hand = state.hands[seat];
  if (!hand.some((held) => sameCard(held, card))) return { ok: false, reason: "cardNotInHand" };
  if (!legalPlays(state, seat).some((legal) => sameCard(legal, card)))
    return { ok: false, reason: state.trick.length > 0 ? "mustFollowSuit" : "spadesNotBroken" };

  const trick = [...state.trick, { seat, card }];
  const after: EngineState = {
    ...state,
    hands: { ...state.hands, [seat]: hand.filter((held) => !sameCard(held, card)) },
    trick,
    spadesBroken: state.spadesBroken || card.suit === "spades"
  };
  if (trick.length < SEATS) return { ok: true, state: { ...after, toAct: nextSeat(state, seat) } };

  const winner = trickWinner(trick, "spades");
  const collected: EngineState = {
    ...after,
    trick: [],
    trickNumber: state.trickNumber + 1,
    lastTrick: { cards: trick, winner },
    tricksWon: { ...state.tricksWon, [winner]: state.tricksWon[winner] + 1 },
    toAct: winner
  };
  return { ok: true, state: state.trickNumber === 13 ? scoreHand(collected) : collected };
}

// Per team: make the contract for 10 a trick plus 1 per overtrick (a bag),
// or lose 10 a trick bid. Each nil is +/-100 on its own; a failed nil's
// tricks are bags but never help the partner's contract. Every ten bags
// costs 100.
export function scoreTeam(state: EngineState, team: Team, bagsBefore: number): TeamHandScore & { bagsAfter: number } {
  const members = teamSeats(state, team);
  const bidders = members.filter((seat) => state.bids[seat]! > 0);
  const nilSeats = members.filter((seat) => state.bids[seat] === 0);

  const contract = bidders.reduce((sum, seat) => sum + state.bids[seat]!, 0);
  const tricks = bidders.reduce((sum, seat) => sum + state.tricksWon[seat], 0);
  const made = tricks >= contract;
  let points = contract === 0 ? 0 : made ? 10 * contract + (tricks - contract) : -10 * contract;
  let bags = made && contract > 0 ? tricks - contract : 0;

  const nils = nilSeats.map((seat) => ({ seat, made: state.tricksWon[seat] === 0 }));
  for (const nil of nils) {
    const taken = state.tricksWon[nil.seat];
    points += nil.made ? NIL_BONUS : -NIL_BONUS + taken;
    bags += taken;
  }

  let bagsAfter = bagsBefore + bags;
  const bagPenalty = bagsAfter >= BAG_LIMIT;
  while (bagsAfter >= BAG_LIMIT) {
    points -= BAG_PENALTY;
    bagsAfter -= BAG_LIMIT;
  }
  return { contract, tricks, made, nils, bags, bagPenalty, points, bagsAfter };
}

// The game ends when a team reaches 500 or falls to -200; the higher score
// wins. Level scores play another hand.
function scoreHand(state: EngineState): EngineState {
  const [zero, one] = [scoreTeam(state, 0, state.bags[0]), scoreTeam(state, 1, state.bags[1])];
  const scores: [number, number] = [state.scores[0] + zero.points, state.scores[1] + one.points];
  const ended =
    (Math.max(...scores) >= WIN_AT || Math.min(...scores) <= LOSE_AT) && scores[0] !== scores[1];
  const strip = ({ bagsAfter: _, ...score }: TeamHandScore & { bagsAfter: number }) => score;
  return {
    ...state,
    phase: ended ? "gameOver" : "handOver",
    toAct: null,
    handScore: [strip(zero), strip(one)],
    scores,
    bags: [zero.bagsAfter, one.bagsAfter],
    winner: ended ? (scores[0] > scores[1] ? 0 : 1) : null
  };
}
