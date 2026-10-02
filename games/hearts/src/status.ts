import { SUIT_SYMBOL, cardLabel } from "@card-games/card-kit/table/labels.ts";
import { cardPoints, passTarget } from "./engine/game.ts";
import type { Action, EngineState, Seat } from "./engine/game.ts";

// Every sentence the table shows. Pure, so it is tested without React.
// Hidden information stays hidden here: a pass is announced, never shown.

type Names = Readonly<Record<Seat, string>>;

export const nameOf = (names: Names, seat: Seat) => names[seat] ?? `Seat ${seat.toUpperCase()}`;

export function statusLine(state: EngineState | null, viewer: Seat, names: Names): string {
  if (!state) return "Waiting for the deal…";
  switch (state.phase) {
    case "awaitingStart":
      return "Ready to deal";
    case "passing": {
      if (state.passed[viewer] === null)
        return `Choose 3 cards to pass ${state.passDirection} to ${nameOf(names, passTarget(state, viewer))}`;
      const waiting = state.seats.filter((seat) => state.passed[seat] === null).map((seat) => nameOf(names, seat));
      return `Waiting for ${waiting.join(", ")} to pass`;
    }
    case "playing": {
      if (state.toAct !== viewer) return `Waiting for ${nameOf(names, state.toAct!)}`;
      if (state.trick.length === 0)
        return state.trickNumber === 1 ? "Your lead — the 2♣ opens" : "Your lead";
      const led = state.trick[0].card.suit;
      return `Your turn — follow ${SUIT_SYMBOL[led]} if you can`;
    }
    case "handOver":
      return handLine(state, viewer, names);
    case "gameOver":
      return gameLine(state, viewer, names);
  }
}

export function handLine(state: EngineState, viewer: Seat, names: Names): string {
  const moon = state.handScore?.moon;
  if (moon) return moon === viewer ? "You shot the moon! Everyone else takes 26" : `${nameOf(names, moon)} shot the moon!`;
  return `Hand ${state.handNumber} over`;
}

export function gameLine(state: EngineState, viewer: Seat, names: Names): string {
  const who = state.winners.map((seat) => (seat === viewer ? "You" : nameOf(names, seat)));
  const score = state.scores[state.winners[0]];
  if (who.length === 1) return `${who[0]} ${who[0] === "You" ? "win" : "wins"} with ${score}`;
  return `${who.join(" and ")} tie with ${score}`;
}

// One feed line per accepted action; deals reset the feed instead.
export function describeAction(before: EngineState, after: EngineState, action: Action, names: Names): string | null {
  switch (action.type) {
    case "startHand":
      return null;
    case "pass":
      return `${nameOf(names, action.seat)} passed 3 cards`;
    case "play": {
      const played = `${nameOf(names, action.seat)} played ${cardLabel(action.card)}`;
      if (before.trick.length < 3) return played;
      const winner = after.lastTrick!.winner;
      const points = cardPoints(after.lastTrick!.cards.map((each) => each.card));
      return `${played} — ${nameOf(names, winner)} takes it${points ? ` (+${points})` : ""}`;
    }
  }
}
