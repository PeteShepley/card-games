import type { Action, Contract, SeatId } from "@peteshepley/game-relay/protocol";

// What a card game tells the kit about itself. `id` tags relay rooms (a
// gin-rummy code can't join a hearts room) and namespaces local storage;
// the seat bounds go to the relay on create.
export interface GameInfo {
  readonly id: string;
  readonly title: string;
  readonly minSeats: number;
  readonly maxSeats: number;
}

// What a transport drives: a game's store, seen only through the two calls
// the DESIGN.md invariant needs — build fresh state from the contract, then
// apply stamped actions in order. Each game adapts its own store to this.
export interface ContractTarget<A extends Action> {
  start(contract: Contract, viewerSeat: SeatId): void;
  apply(action: A): void;
}

// The contract fields alone, from a `start` or `resync` message — so a
// target never sees wire envelope fields (`kind`, `log`).
export function contractOf(message: Contract): Contract {
  const { game, seed, dealer, seats } = message;
  return { game, seed, dealer, seats };
}
