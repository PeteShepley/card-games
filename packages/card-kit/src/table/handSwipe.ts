import { useRef } from "react";
import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from "react";

// Swipe a finger along your hand and the cards magnify under it, like the
// macOS Dock: the card beneath the finger grows most, its neighbours a
// little, rolling with the finger. Lifting the finger hands the card under
// it to the game (which lifts it, ready for a tap to play). A plain tap is
// left alone. Touch and pen only: a mouse has hover and full-size cards.
//
// The per-frame work writes CSS custom properties straight onto the card
// buttons rather than re-rendering React on every move.

const MAX_MAG = 1.8;
// How far the swell spreads, in cards.
const SPREAD = 1.1;
// Movement before a press counts as a swipe rather than a tap.
const SWIPE_PX = 8;

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

interface Swipe {
  pointerId: number;
  startX: number;
  startY: number;
  swiping: boolean;
  frame: number | null;
  x: number;
}

export function useHandSwipe() {
  const swipe = useRef<Swipe | null>(null);
  // A swipe's release must not also count as a tap on whatever is under it.
  const swallowClick = useRef(false);

  const cardsOf = (hand: HTMLElement) => [...hand.querySelectorAll<HTMLElement>(":scope > .hand__card")];

  const paint = (hand: HTMLElement) => {
    const current = swipe.current;
    if (!current) return;
    current.frame = null;
    const cards = cardsOf(hand);
    // Measure the resting layout: offsetLeft ignores the transforms we set.
    const base = hand.getBoundingClientRect().left + hand.clientLeft;
    const lefts = cards.map((card) => base + card.offsetLeft);
    const last = cards[cards.length - 1];
    const lastRight = last ? base + last.offsetLeft + last.offsetWidth : 0;
    const focus = focusAt(current.x, lefts, lastRight);
    cards.forEach((card, index) => {
      const mag = magnification(index, focus);
      card.style.setProperty("--mag", mag.toFixed(3));
      card.style.zIndex = String(Math.round(mag * 100));
    });
    return Math.min(Math.floor(focus), cards.length - 1);
  };

  const schedule = (hand: HTMLElement) => {
    const current = swipe.current;
    if (current && current.frame === null) current.frame = requestAnimationFrame(() => paint(hand));
  };

  const start = (hand: HTMLElement) => {
    const cards = cardsOf(hand);
    // The edge cards grow inward, so the swell never runs off the screen.
    cards.forEach((card, index) => {
      const origin = cards.length > 1 ? (index / (cards.length - 1)) * 100 : 50;
      card.style.setProperty("--mag-origin", `${origin}%`);
    });
    hand.dataset.swiping = "";
  };

  const finish = (hand: HTMLElement) => {
    const current = swipe.current;
    if (current?.frame != null) cancelAnimationFrame(current.frame);
    swipe.current = null;
    delete hand.dataset.swiping;
    for (const card of cardsOf(hand)) {
      card.style.removeProperty("--mag");
      card.style.removeProperty("--mag-origin");
      card.style.zIndex = "";
    }
  };

  // The handlers to spread on the hand row. `onRelease` gets the index of
  // the card a swipe ended on.
  return (onRelease: (index: number) => void) => ({
    onPointerDown(event: ReactPointerEvent<HTMLElement>) {
      swallowClick.current = false;
      if (event.pointerType === "mouse" || swipe.current) return;
      swipe.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        swiping: false,
        frame: null,
        x: event.clientX
      };
    },
    onPointerMove(event: ReactPointerEvent<HTMLElement>) {
      const current = swipe.current;
      if (!current || current.pointerId !== event.pointerId) return;
      current.x = event.clientX;
      const hand = event.currentTarget;
      if (!current.swiping) {
        if (Math.hypot(event.clientX - current.startX, event.clientY - current.startY) < SWIPE_PX) return;
        current.swiping = true;
        hand.setPointerCapture(event.pointerId);
        start(hand);
      }
      schedule(hand);
    },
    onPointerUp(event: ReactPointerEvent<HTMLElement>) {
      const current = swipe.current;
      if (!current || current.pointerId !== event.pointerId) return;
      const hand = event.currentTarget;
      if (current.swiping) {
        current.x = event.clientX;
        const index = paint(hand);
        finish(hand);
        swallowClick.current = true;
        if (index !== undefined && index >= 0) onRelease(index);
      } else {
        swipe.current = null;
      }
    },
    onPointerCancel(event: ReactPointerEvent<HTMLElement>) {
      if (swipe.current?.pointerId === event.pointerId) finish(event.currentTarget);
    },
    onClickCapture(event: ReactMouseEvent<HTMLElement>) {
      if (!swallowClick.current) return;
      swallowClick.current = false;
      event.stopPropagation();
      event.preventDefault();
    }
  });
}
