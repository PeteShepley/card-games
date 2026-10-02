import type { Action, Contract, SeatId } from "@peteshepley/game-relay/protocol";
import type { ContractTarget, GameInfo } from "./types.ts";

// A stand-in game store for transport tests: it records what the transport
// asked of it, so two clients can be compared without any game engine.
export interface Recorded {
  contract: Contract | null;
  viewerSeat: SeatId | null;
  actions: Action[];
}

export function recordingTarget(): ContractTarget<Action> & { recorded: Recorded } {
  const recorded: Recorded = { contract: null, viewerSeat: null, actions: [] };
  return {
    recorded,
    start(contract, viewerSeat) {
      recorded.contract = contract;
      recorded.viewerSeat = viewerSeat;
      recorded.actions = [];
    },
    apply(action) {
      recorded.actions.push(action);
    }
  };
}

export const TEST_GAME: GameInfo = {
  id: "test-game",
  title: "Test Game",
  minSeats: 2,
  maxSeats: 4
};
