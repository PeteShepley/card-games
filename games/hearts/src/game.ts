import type { GameInfo } from "@card-games/card-kit/net/types.ts";
import { SEATS } from "./engine/game.ts";

export const HEARTS: GameInfo = {
  id: "hearts",
  title: "Hearts",
  minSeats: SEATS,
  maxSeats: SEATS
};
