import type { ContractTarget } from "@card-games/card-kit/net/types.ts";
import { advance, initialState } from "./engine/game.ts";
import type { Action, EngineState, Seat } from "./engine/game.ts";
import { describeAction } from "./status.ts";

export interface FeedEntry {
  readonly id: number;
  readonly text: string;
}

export interface GameSnapshot {
  readonly game: EngineState | null;
  readonly viewerSeat: Seat | null;
  // Display names by seat, from the contract.
  readonly names: Readonly<Record<Seat, string>>;
  // What just happened, oldest first. With up to six players, the last few
  // moves are how you notice someone switched the suit on you.
  readonly feed: readonly FeedEntry[];
}

export interface GameStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): GameSnapshot;
  start(options: {
    seed: number;
    seats: readonly Seat[];
    dealer: Seat;
    viewerSeat: Seat;
    names: Readonly<Record<Seat, string>>;
  }): void;
  apply(action: Action): void;
}

const FEED_LIMIT = 5;

export function createGameStore(): GameStore {
  let snapshot: GameSnapshot = { game: null, viewerSeat: null, names: {}, feed: [] };
  const listeners = new Set<() => void>();
  let nextFeedId = 1;

  const replace = (next: GameSnapshot) => {
    snapshot = next;
    for (const listener of listeners) listener();
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot() {
      return snapshot;
    },
    // A start rebuilds from scratch, per the resync contract.
    start({ seed, seats, dealer, viewerSeat, names }) {
      replace({
        game: initialState(seed, seats, dealer),
        viewerSeat,
        names,
        feed: []
      });
    },
    // Actions arrive stamped and in order (the transport's job). A rejected
    // action is a deterministic no-op on every client.
    apply(action) {
      if (!snapshot.game) throw new Error("action applied before the start contract");
      const before = snapshot.game;
      const result = advance(before, action);
      if (!result.ok) return;
      const text = describeAction(before, action, snapshot.names);
      const dealt = action.type === "startHand";
      replace({
        ...snapshot,
        game: result.state,
        feed: dealt
          ? []
          : text
            ? [...snapshot.feed, { id: nextFeedId++, text }].slice(-FEED_LIMIT)
            : snapshot.feed
      });
    }
  };
}

// The store as the kit's transports see it: seats, order and names all
// come from the relay contract.
export function asContractTarget(store: GameStore): ContractTarget<Action> {
  return {
    start(contract, viewerSeat) {
      store.start({
        seed: contract.seed,
        seats: contract.seats.map((seat) => seat.id),
        dealer: contract.dealer,
        viewerSeat,
        names: Object.fromEntries(contract.seats.map((seat) => [seat.id, seat.name]))
      });
    },
    apply: (action) => store.apply(action)
  };
}
