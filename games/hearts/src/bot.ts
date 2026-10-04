import type { Card } from "@card-games/card-kit/cards.ts";
import {
  highest,
  highestLoser,
  lowest,
  suitCounts,
  winsNow
} from "@card-games/card-kit/bots/tricks.ts";
import { rankValue } from "@card-games/card-kit/tricks.ts";
import { cardPoints, legalPlays } from "./engine/game.ts";
import type { Action, EngineState, Seat } from "./engine/game.ts";

// The computer's Hearts: pass the dangerous cards, duck tricks with the
// highest card that still loses, take point-free tricks when last, and
// dump the queen of spades and high hearts when void. Pure: what `seat`
// would do now, or null when it has nothing to do (dealing is the humans').

const isQueenOfSpades = (card: Card) =>
  card.suit === "spades" && card.rank === "Q";

export function decide(state: EngineState, seat: Seat): Action | null {
  if (state.phase === "passing" && state.passed[seat] === null) {
    return { type: "pass", seat, cards: choosePass(state.hands[seat]) };
  }
  if (state.phase === "playing" && state.toAct === seat) {
    return { type: "play", seat, card: choosePlay(state, seat) };
  }
  return null;
}

// The three most dangerous cards: the queen and her protectors' betters
// (A♠ K♠), high hearts, then high cards in short suits, which also works
// toward a void. Low spades stay to guard the queen.
export function choosePass(hand: readonly Card[]): Card[] {
  const counts = suitCounts(hand);
  const danger = (card: Card) => {
    const rank = rankValue(card.rank);
    if (isQueenOfSpades(card)) return 100;
    if (card.suit === "spades") return rank > rankValue("Q") ? 90 : -1;
    if (card.suit === "hearts") return 40 + rank;
    return rank + (13 - counts[card.suit]) * 1.5;
  };
  return [...hand].sort((a, b) => danger(b) - danger(a)).slice(0, 3);
}

export function choosePlay(state: EngineState, seat: Seat): Card {
  const legal = legalPlays(state, seat);
  const trick = state.trick;
  if (legal.length === 1) return legal[0];

  // Leading: low, and not hearts while anything else will do.
  if (trick.length === 0) {
    const safe = legal.filter(
      (card) => card.suit !== "hearts" && !isQueenOfSpades(card)
    );
    return lowest(safe.length > 0 ? safe : legal);
  }

  const led = trick[0].card.suit;
  const following = legal.some((card) => card.suit === led);
  if (!following) {
    // Void: unload the worst first.
    const queen = legal.find(isQueenOfSpades);
    if (queen) return queen;
    const hearts = legal.filter((card) => card.suit === "hearts");
    if (hearts.length > 0) return highest(hearts);
    const bigSpades = legal.filter(
      (card) => card.suit === "spades" && rankValue(card.rank) > rankValue("Q")
    );
    if (bigSpades.length > 0) return highest(bigSpades);
    return highest(legal);
  }

  const points = cardPoints(trick.map((played) => played.card));
  // Last to play on a clean trick: taking it costs nothing, so shed the
  // highest card that isn't the queen.
  if (trick.length === 3 && points === 0) {
    const shed = legal.filter(
      (card) => !isQueenOfSpades(card) || !winsNow(card, trick)
    );
    return highest(shed.length > 0 ? shed : legal);
  }
  // Otherwise duck with the highest card that loses...
  const duck = highestLoser(legal, trick);
  if (duck) return duck;
  // ...or, forced to win, win with the highest - it's yours anyway - but
  // never hand yourself the queen.
  const notQueen = legal.filter((card) => !isQueenOfSpades(card));
  return highest(notQueen.length > 0 ? notQueen : legal);
}
