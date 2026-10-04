import type {
  Roster,
  SeatId,
  SeatInfo
} from "@peteshepley/game-relay/protocol";

// Computer players at the table: which seats they hold, and which client
// plays them. The relay marks them (`bot: true` on roster and contract
// seats); a room's creator adds them with addBot / removeBot.

// What a game's table needs to know about the computer players: their
// seats, and whether this client is the one that plays them.
export interface BotSeats {
  readonly seats: readonly SeatId[];
  readonly runner: boolean;
}

export const NO_BOTS: BotSeats = { seats: [], runner: false };

export function botSeatIds(seats: readonly SeatInfo[]): SeatId[] {
  return seats.filter((seat) => seat.bot).map((seat) => seat.id);
}

// Exactly one client plays the computer players: the first human seat that
// is connected. Every client works this out from the same roster, so they
// agree; if that player drops, the next one takes over.
export function botRunner(roster: Roster | null): SeatId | null {
  const seats = roster?.seats ?? [];
  return seats.find((seat) => !seat.bot && seat.connected)?.id ?? null;
}

export function botSeatsFor(
  roster: Roster | null,
  mySeat: SeatId | null
): BotSeats {
  const seats = botSeatIds(roster?.seats ?? []);
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

// A name for the next computer added to a room: "Computer C" after the
// first free seat letter, skipping names already asked for and not yet in
// the roster (several can be added before the relay answers).
export function nextComputerName(
  roster: Roster | null,
  pending: readonly string[],
  maxSeats: number
): string {
  const taken = new Set([
    ...(roster?.seats ?? []).map((seat) => seat.name),
    ...pending
  ]);
  const used = new Set((roster?.seats ?? []).map((seat) => seat.id));
  for (let index = 0; index < 26; index++) {
    const seat = String.fromCharCode(97 + index);
    const name = computerName(seat, maxSeats);
    if (!used.has(seat) && !taken.has(name)) return name;
  }
  return "Computer";
}
