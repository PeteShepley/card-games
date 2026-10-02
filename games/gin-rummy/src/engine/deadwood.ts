import type { Rank } from "@card-games/card-kit/cards.ts";

// Gin's deadwood count for a card: aces low, faces 10.
export function cardValue(rank: Rank): number {
  if (rank === "A") return 1;
  if (rank === "J" || rank === "Q" || rank === "K") return 10;
  return Number(rank);
}
