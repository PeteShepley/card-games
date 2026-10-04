import { useState } from "react";
import { sameCard } from "../cards.ts";
import type { Card } from "../cards.ts";

// On a touch screen a long hand overlaps until only a sliver of each card
// shows, so a stray tap would play the wrong one. There the first tap lifts
// a card clear of its neighbours and a second tap on it plays it; with a
// mouse a click plays straight away.

export function isCoarsePointer(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches;
}

// What a tap on `card` does, given what is lifted already.
export function tapOutcome(lifted: Card | null, card: Card, coarse: boolean): "lift" | "play" {
  return coarse && !(lifted && sameCard(lifted, card)) ? "lift" : "play";
}

// `resetKey` names the moment the lift belongs to (whose view, what hand,
// whose turn): when it changes, the lift is dropped.
export function useTapToPlay(resetKey: string) {
  const [state, setState] = useState<{ key: string; card: Card } | null>(null);
  const lifted = state && state.key === resetKey ? state.card : null;
  const tap = (card: Card, play: () => void) => {
    if (tapOutcome(lifted, card, isCoarsePointer()) === "lift") {
      setState({ key: resetKey, card });
    } else {
      setState(null);
      play();
    }
  };
  const isLifted = (card: Card) => !!lifted && sameCard(lifted, card);
  // A swipe that ends on a card lifts it, as a first tap would.
  const lift = (card: Card) => setState({ key: resetKey, card });
  return { isLifted, tap, lift };
}
