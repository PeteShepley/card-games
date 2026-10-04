// Swipe a finger along your hand and the cards magnify under it, like the
// macOS Dock: the card beneath the finger grows most, its neighbours a
// little, rolling with the finger. The geometry lives here, pure; the
// canvas engine applies it.

export const MAX_MAG = 1.8;
// How far the swell spreads, in cards.
const SPREAD = 1.1;

// Where the finger is along the hand, in cards: 2.5 is halfway across the
// visible strip of the third card. `lefts` are the cards' left edges in
// order; each card's visible strip runs to the next card's left edge (the
// last card shows whole, to `lastRight`).
export function focusAt(x: number, lefts: readonly number[], lastRight: number): number {
  const n = lefts.length;
  if (n === 0) return 0;
  if (x <= lefts[0]) return 0;
  for (let i = 0; i < n; i++) {
    const left = lefts[i];
    const right = i + 1 < n ? lefts[i + 1] : lastRight;
    if (x < right) return i + (x - left) / Math.max(right - left, 1);
  }
  return n - 0.001;
}

// How much card `index` grows when the finger is at `focus`.
export function magnification(index: number, focus: number): number {
  const distance = index + 0.5 - focus;
  return 1 + (MAX_MAG - 1) * Math.exp(-(distance * distance) / (SPREAD * SPREAD));
}
