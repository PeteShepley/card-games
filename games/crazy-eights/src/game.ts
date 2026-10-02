import type { GameInfo } from "@card-games/card-kit/net/types.ts";
import { MAX_SEATS, MIN_SEATS } from "./engine/game.ts";

export const CRAZY_EIGHTS: GameInfo = {
  id: "crazy-eights",
  title: "Crazy Eights",
  minSeats: MIN_SEATS,
  maxSeats: MAX_SEATS
};
