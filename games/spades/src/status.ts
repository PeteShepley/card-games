import { SUIT_SYMBOL, cardLabel } from "@card-games/card-kit/table/labels.ts";
import { teamOf, teamSeats } from "./engine/game.ts";
import type { Action, EngineState, Seat, Team, TeamHandScore } from "./engine/game.ts";

// Every sentence the table shows. Pure, so it is tested without React.

type Names = Readonly<Record<Seat, string>>;

export const nameOf = (names: Names, seat: Seat) => names[seat] ?? `Seat ${seat.toUpperCase()}`;

export const bidLabel = (bid: number) => (bid === 0 ? "nil" : String(bid));

export function teamName(state: EngineState, team: Team, names: Names): string {
  return teamSeats(state, team)
    .map((seat) => nameOf(names, seat))
    .join(" & ");
}

export function statusLine(state: EngineState | null, viewer: Seat, names: Names): string {
  if (!state) return "Waiting for the deal…";
  switch (state.phase) {
    case "awaitingStart":
      return "Ready to deal";
    case "bidding":
      return state.toAct === viewer
        ? "Your bid — how many tricks will you take?"
        : `Waiting for ${nameOf(names, state.toAct!)} to bid`;
    case "playing": {
      if (state.toAct !== viewer) return `Waiting for ${nameOf(names, state.toAct!)}`;
      if (state.trick.length === 0) return "Your lead";
      return `Your turn — follow ${SUIT_SYMBOL[state.trick[0].card.suit]} if you can`;
    }
    case "handOver":
      return `Hand ${state.handNumber} over`;
    case "gameOver":
      return gameLine(state, viewer, names);
  }
}

export function gameLine(state: EngineState, viewer: Seat, names: Names): string {
  if (state.winner === null) return "";
  return state.winner === teamOf(state, viewer)
    ? `You and ${nameOf(names, teamSeats(state, state.winner).find((seat) => seat !== viewer)!)} win!`
    : `${teamName(state, state.winner, names)} win`;
}

// How one team's hand went, in a line: "bid 5, took 6: +51".
export function handSummary(score: TeamHandScore, names: Names): string {
  const parts: string[] = [];
  if (score.contract > 0)
    parts.push(`bid ${score.contract}, took ${score.tricks}${score.made ? "" : " — set"}`);
  for (const nil of score.nils) parts.push(`${nameOf(names, nil.seat)} nil ${nil.made ? "made" : "failed"}`);
  if (score.bagPenalty) parts.push("10 bags −100");
  const sign = score.points >= 0 ? "+" : "−";
  return `${parts.join(" · ")}: ${sign}${Math.abs(score.points)}`;
}

// One feed line per accepted action; deals reset the feed instead.
export function describeAction(before: EngineState, after: EngineState, action: Action, names: Names): string | null {
  switch (action.type) {
    case "startHand":
      return null;
    case "bid":
      return `${nameOf(names, action.seat)} bid ${bidLabel(action.bid)}`;
    case "play": {
      const played = `${nameOf(names, action.seat)} played ${cardLabel(action.card)}`;
      if (before.trick.length < 3) return played;
      return `${played} — ${nameOf(names, after.lastTrick!.winner)} takes it`;
    }
  }
}
