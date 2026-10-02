// Where each seat sits around a four-seat table, seen from `perspective`.
// Play passes to the left, so the next seat sits on your left, the one
// after across, and the last on your right.

export type Position = "left" | "top" | "right" | "bottom";

export function seatPositions(seats: readonly string[], perspective: string): Record<Position, string> {
  if (seats.length !== 4) throw new Error("seatPositions is for four-seat tables");
  const at = (steps: number) => seats[(seats.indexOf(perspective) + steps) % 4];
  return { bottom: perspective, left: at(1), top: at(2), right: at(3) };
}
