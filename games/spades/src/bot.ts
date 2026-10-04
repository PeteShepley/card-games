import type { Card } from "@card-games/card-kit/cards.ts";
import {
  highestLoser,
  lowest,
  lowestWinner,
  suitCounts
} from "@card-games/card-kit/bots/tricks.ts";
import { rankValue, trickWinner } from "@card-games/card-kit/tricks.ts";
import { legalPlays, partnerOf, teamSeats, teamOf } from "./engine/game.ts";
import type { Action, EngineState, Seat } from "./engine/game.ts";

// The computer's Spades: bid by counting likely tricks (aces, guarded
// kings, spade length, ruffs), go nil only with a hopeless hand, then
// play to make the contract without piling up bags - win cheaply, don't
// overtake a partner who already has the trick, and duck once the team's
// bid is made. Pure: what `seat` would do now, or null.

const TRUMP = "spades";

export function decide(state: EngineState, seat: Seat): Action | null {
  if (state.toAct !== seat) return null;
  if (state.phase === "bidding")
    return { type: "bid", seat, bid: chooseBid(state.hands[seat]) };
  if (state.phase === "playing")
    return { type: "play", seat, card: choosePlay(state, seat) };
  return null;
}

export function estimateTricks(hand: readonly Card[]): number {
  const counts = suitCounts(hand);
  let tricks = 0;
  for (const card of hand) {
    const rank = rankValue(card.rank);
    if (card.suit === TRUMP) {
      if (rank >= rankValue("Q")) tricks += 1;
    } else if (card.rank === "A") {
      tricks += counts[card.suit] <= 5 ? 1 : 0.7;
    } else if (card.rank === "K" && counts[card.suit] >= 2) {
      tricks += 0.7;
    } else if (card.rank === "Q" && counts[card.suit] >= 3) {
      tricks += 0.3;
    }
  }
  // Long spades win late; short side suits let them ruff.
  tricks += Math.max(0, counts[TRUMP] - 3);
  if (counts[TRUMP] >= 2) {
    for (const suit of ["clubs", "diamonds", "hearts"] as const) {
      if (counts[suit] === 0) tricks += 0.8;
      else if (counts[suit] === 1) tricks += 0.4;
    }
  }
  return tricks;
}

export function chooseBid(hand: readonly Card[]): number {
  const estimate = estimateTricks(hand);
  const highSpade = hand.some(
    (card) => card.suit === TRUMP && rankValue(card.rank) >= rankValue("10")
  );
  if (estimate < 0.6 && !highSpade) return 0;
  return Math.max(1, Math.min(13, Math.round(estimate)));
}

export function choosePlay(state: EngineState, seat: Seat): Card {
  const legal = legalPlays(state, seat);
  if (legal.length === 1) return legal[0];
  const trick = state.trick;
  const nil = state.bids[seat] === 0;

  // A nil bidder only ever tries to lose.
  if (nil) {
    if (trick.length === 0) return lowest(legal);
    return highestLoser(legal, trick, TRUMP) ?? lowest(legal);
  }

  const team = teamOf(state, seat);
  const [x, y] = teamSeats(state, team);
  const contract = (state.bids[x] ?? 0) + (state.bids[y] ?? 0);
  const made = state.tricksWon[x] + state.tricksWon[y] >= contract;
  const offSuit = legal.filter((card) => card.suit !== TRUMP);

  if (trick.length === 0) {
    if (made) return lowest(legal);
    // Cash an off-suit ace, else lead low from the longest side suit.
    const ace = offSuit.find((card) => card.rank === "A");
    if (ace) return ace;
    if (offSuit.length === 0) return lowest(legal);
    const counts = suitCounts(offSuit);
    const longest = offSuit.reduce((best, card) =>
      counts[card.suit] > counts[best.suit] ? card : best
    );
    return lowest(offSuit.filter((card) => card.suit === longest.suit));
  }

  const partnerWinning = trickWinner(trick, TRUMP) === partnerOf(state, seat);
  const shed = () =>
    lowest(
      offSuit.length > 0 &&
        !legal.some((card) => card.suit === trick[0].card.suit)
        ? offSuit
        : legal
    );
  if (made || partnerWinning) {
    // Don't take bags, and don't overtake a partner who has it.
    return highestLoser(legal, trick, TRUMP) ?? shed();
  }
  // Take it as cheaply as possible, or shed low when it can't be taken.
  return lowestWinner(legal, trick, TRUMP) ?? shed();
}
