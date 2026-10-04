import type {
  Roster,
  RosterSeat,
  SeatId,
  SeatInfo
} from "@peteshepley/game-relay/protocol";

// Computer players at the table: which seats they hold, and which client
// plays them.
//
// The relay's computer-player messages (game-relay `bots` branch:
// addBot / removeBot, and `bot` on roster and contract seats) are declared
// here until card-kit pins a game-relay release that has them; then these
// collapse into the protocol's own types.

export type BotAware<T> = T & { readonly bot?: boolean };
export type BotSeatInfo = BotAware<SeatInfo>;
export type BotRosterSeat = BotAware<RosterSeat>;

export type BotLobbyMessage =
  | { readonly kind: "addBot"; readonly name: string; readonly rnd: number }
  | { readonly kind: "removeBot"; readonly seat: SeatId };

// What a game's table needs to know about the computer players: their
// seats, and whether this client is the one that plays them.
export interface BotSeats {
  readonly seats: readonly SeatId[];
  readonly runner: boolean;
}

export const NO_BOTS: BotSeats = { seats: [], runner: false };

export function botSeatIds(
  seats: readonly BotAware<{ id: SeatId }>[]
): SeatId[] {
  return seats.filter((seat) => seat.bot).map((seat) => seat.id);
}

// Exactly one client plays the computer players: the first human seat that
// is connected. Every client works this out from the same roster, so they
// agree; if that player drops, the next one takes over.
export function botRunner(roster: Roster | null): SeatId | null {
  const seats = (roster?.seats ?? []) as readonly BotRosterSeat[];
  return seats.find((seat) => !seat.bot && seat.connected)?.id ?? null;
}

export function botSeatsFor(
  roster: Roster | null,
  mySeat: SeatId | null
): BotSeats {
  const seats = botSeatIds((roster?.seats ?? []) as readonly BotRosterSeat[]);
  return {
    seats,
    runner: seats.length > 0 && mySeat !== null && botRunner(roster) === mySeat
  };
}

// A table for one human against the computer, with no relay: you in seat
// 'a' (the dealer), computers in the rest.
export function offlineTable(name: string, count: number) {
  const seats = Array.from({ length: count }, (_, index) =>
    String.fromCharCode(97 + index)
  );
  const names: Record<SeatId, string> = Object.fromEntries(
    seats.map((seat, index) => [
      seat,
      index === 0 ? name : computerName(seat, count)
    ])
  );
  return {
    seed: Math.floor(Math.random() * 0x100000000) >>> 0,
    seats,
    names,
    bots: { seats: seats.slice(1), runner: true }
  };
}

// "Computer" when there's only one, else "Computer B", "Computer C"...
export function computerName(seat: SeatId, tableSize: number): string {
  return tableSize === 2 ? "Computer" : `Computer ${seat.toUpperCase()}`;
}
