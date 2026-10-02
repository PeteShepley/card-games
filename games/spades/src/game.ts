import type { GameInfo } from "@card-games/card-kit/net/types.ts";
import { SEATS } from "./engine/game.ts";

export const SPADES: GameInfo = {
  id: "spades",
  title: "Spades",
  minSeats: SEATS,
  maxSeats: SEATS
};
