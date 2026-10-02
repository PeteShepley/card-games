import { SUIT_SYMBOL, cardLabel } from "@card-games/card-kit/table/labels.ts";
import type { Action, EngineState, Seat } from "./engine/game.ts";

// Every sentence the table shows. Pure, so it is tested without React.

export { SUIT_SYMBOL, cardLabel };

const nameOf = (names: Readonly<Record<Seat, string>>, seat: Seat) =>
  names[seat] ?? `Seat ${seat.toUpperCase()}`;

// The line under the table: whose turn it is and what they can do.
export function statusLine(
  state: EngineState | null,
  viewer: Seat,
  names: Readonly<Record<Seat, string>>
): string {
  if (!state) return "Waiting for the deal…";
  switch (state.phase) {
    case "awaitingStart":
      return "Ready to deal";
    case "handOver":
      return resultLine(state, viewer, names);
    case "play": {
      const suit = state.activeSuit ? ` (${SUIT_SYMBOL[state.activeSuit]} to follow)` : "";
      if (state.toAct === viewer) return `Your turn — play a match or an 8, or draw${suit}`;
      return `Waiting for ${nameOf(names, state.toAct!)}${suit}`;
    }
  }
}

export function resultLine(
  state: EngineState,
  viewer: Seat,
  names: Readonly<Record<Seat, string>>
): string {
  const result = state.result;
  if (!result) return "";
  if (!result.winner) return "Blocked — nobody wins this hand";
  const who = result.winner === viewer ? "You" : nameOf(names, result.winner);
  const how = result.type === "out" ? "went out" : "had the lowest hand";
  return `${who} ${how} — +${result.points} points`;
}

// One feed line per accepted action; deals reset the feed instead.
export function describeAction(
  before: EngineState,
  action: Action,
  names: Readonly<Record<Seat, string>>
): string | null {
  switch (action.type) {
    case "startHand":
      return null;
    case "play":
      return action.card.rank === "8" && action.suit
        ? `${nameOf(names, action.seat)} played ${cardLabel(action.card)} — ${action.suit} now`
        : `${nameOf(names, action.seat)} played ${cardLabel(action.card)}`;
    case "draw":
      return before.stock.length === 0
        ? `${nameOf(names, action.seat)} drew (pile reshuffled)`
        : `${nameOf(names, action.seat)} drew`;
    case "pass":
      return `${nameOf(names, action.seat)} passed`;
  }
}
