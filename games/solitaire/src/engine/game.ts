import { RANKS, SUITS, sameCard } from "@card-games/card-kit/cards.ts";
import type { Card, Suit } from "@card-games/card-kit/cards.ts";
import { newDeck, shuffle } from "@card-games/card-kit/deck.ts";

// Klondike for one player. Pure: the table is a function of (seed, draw
// mode, ordered move log), the same invariant as the multiplayer games —
// which is what makes undo (replay all but the last move), saved games and
// shareable deals (?seed=N) cheap.

export type DrawCount = 1 | 3;

export interface Column {
  // Face-down cards, bottom first; only the face-up run is ever playable.
  readonly down: readonly Card[];
  readonly up: readonly Card[];
}

export interface EngineState {
  readonly seed: number;
  readonly drawCount: DrawCount;
  // The top of the stock and of the waste is the last element.
  readonly stock: readonly Card[];
  readonly waste: readonly Card[];
  readonly foundations: Readonly<Record<Suit, readonly Card[]>>;
  readonly tableau: readonly Column[];
  readonly moves: number;
  readonly won: boolean;
}

export type Target =
  | { readonly kind: "foundation" } // the suit is the card's own
  | { readonly kind: "tableau"; readonly column: number };

export type Action =
  // Turn cards from the stock to the waste; on an empty stock, turn the
  // waste back over.
  | { type: "draw" }
  // Move a card — and, in the tableau, every card on top of it.
  | { type: "move"; card: Card; to: Target };

export type RejectReason =
  | "gameOver"
  | "nothingToDraw"
  | "notPlayable" // face down, buried in the waste, or under another card
  | "doesNotFit"
  | "sameColumn";

export type AdvanceResult =
  | { ok: true; state: EngineState }
  | { ok: false; reason: RejectReason };

export const COLUMNS = 7;

const isRed = (card: Card) => card.suit === "hearts" || card.suit === "diamonds";
const rankIndex = (card: Card) => RANKS.indexOf(card.rank); // A = 0 ... K = 12

export function initialState(seed: number, drawCount: DrawCount = 1): EngineState {
  const deck = shuffle(newDeck(), seed >>> 0).cards;
  let next = 0;
  // Deal row by row, as at a real table: column n gets n+1 cards.
  const columns: Card[][] = Array.from({ length: COLUMNS }, () => []);
  for (let row = 0; row < COLUMNS; row++) {
    for (let column = row; column < COLUMNS; column++) columns[column].push(deck[next++]);
  }
  return {
    seed: seed >>> 0,
    drawCount,
    stock: deck.slice(next),
    waste: [],
    foundations: { clubs: [], diamonds: [], hearts: [], spades: [] },
    tableau: columns.map((cards) => ({ down: cards.slice(0, -1), up: cards.slice(-1) })),
    moves: 0,
    won: false
  };
}

type Location =
  | { kind: "waste" }
  | { kind: "foundation"; suit: Suit }
  | { kind: "tableau"; column: number; index: number };

// Where a card can be picked up from: the top of the waste, the top of its
// foundation, or anywhere in a tableau column's face-up run.
export function locate(state: EngineState, card: Card): Location | null {
  const wasteTop = state.waste[state.waste.length - 1];
  if (wasteTop && sameCard(wasteTop, card)) return { kind: "waste" };
  const pile = state.foundations[card.suit];
  if (pile.length > 0 && sameCard(pile[pile.length - 1], card)) return { kind: "foundation", suit: card.suit };
  for (let column = 0; column < COLUMNS; column++) {
    const index = state.tableau[column].up.findIndex((up) => sameCard(up, card));
    if (index !== -1) return { kind: "tableau", column, index };
  }
  return null;
}

// Whether `card` (with whatever rides on it) may land on `to`.
export function fits(state: EngineState, card: Card, to: Target, moving = 1): boolean {
  if (to.kind === "foundation") {
    if (moving !== 1) return false;
    const pile = state.foundations[card.suit];
    return rankIndex(card) === pile.length;
  }
  const column = state.tableau[to.column];
  const top = column.up[column.up.length - 1];
  if (!top) return column.down.length === 0 && card.rank === "K";
  return isRed(top) !== isRed(card) && rankIndex(top) === rankIndex(card) + 1;
}

export function advance(state: EngineState, action: Action): AdvanceResult {
  if (state.won) return { ok: false, reason: "gameOver" };
  return action.type === "draw" ? draw(state) : move(state, action.card, action.to);
}

function draw(state: EngineState): AdvanceResult {
  if (state.stock.length === 0) {
    if (state.waste.length === 0) return { ok: false, reason: "nothingToDraw" };
    return {
      ok: true,
      state: { ...state, stock: [...state.waste].reverse(), waste: [], moves: state.moves + 1 }
    };
  }
  const turned = state.stock.slice(-state.drawCount).reverse();
  return {
    ok: true,
    state: {
      ...state,
      stock: state.stock.slice(0, -turned.length),
      waste: [...state.waste, ...turned],
      moves: state.moves + 1
    }
  };
}

function move(state: EngineState, card: Card, to: Target): AdvanceResult {
  const from = locate(state, card);
  if (!from) return { ok: false, reason: "notPlayable" };
  if (from.kind === "tableau" && to.kind === "tableau" && from.column === to.column)
    return { ok: false, reason: "sameColumn" };
  const moving = from.kind === "tableau" ? state.tableau[from.column].up.slice(from.index) : [card];
  if (!fits(state, card, to, moving.length)) return { ok: false, reason: "doesNotFit" };

  // Lift the cards off their source; a column left with no face-up cards
  // turns its next card over.
  let { waste, foundations, tableau } = state;
  if (from.kind === "waste") waste = waste.slice(0, -1);
  else if (from.kind === "foundation")
    foundations = { ...foundations, [from.suit]: foundations[from.suit].slice(0, -1) };
  else
    tableau = tableau.map((column, index) => {
      if (index !== from.column) return column;
      const up = column.up.slice(0, from.index);
      return up.length > 0 || column.down.length === 0
        ? { down: column.down, up }
        : { down: column.down.slice(0, -1), up: column.down.slice(-1) };
    });

  if (to.kind === "foundation") foundations = { ...foundations, [card.suit]: [...foundations[card.suit], card] };
  else
    tableau = tableau.map((column, index) =>
      index === to.column ? { down: column.down, up: [...column.up, ...moving] } : column
    );

  const won = SUITS.every((suit) => foundations[suit].length === 13);
  return { ok: true, state: { ...state, waste, foundations, tableau, moves: state.moves + 1, won } };
}

// Where a double-click sends a card: home to its foundation if it can go,
// else the first column that takes it.
export function bestTarget(state: EngineState, card: Card): Target | null {
  const from = locate(state, card);
  if (!from) return null;
  const moving = from.kind === "tableau" ? state.tableau[from.column].up.length - from.index : 1;
  if (from.kind !== "foundation" && fits(state, card, { kind: "foundation" }, moving)) return { kind: "foundation" };
  for (let column = 0; column < COLUMNS; column++) {
    if (from.kind === "tableau" && from.column === column) continue;
    const to: Target = { kind: "tableau", column };
    if (fits(state, card, to, moving)) return to;
  }
  return null;
}

// Once nothing is hidden — no face-down cards, empty stock and waste — the
// game is won by sweeping everything home; the UI offers that as one tap.
export function canAutoFinish(state: EngineState): boolean {
  return (
    !state.won &&
    state.stock.length === 0 &&
    state.waste.length === 0 &&
    state.tableau.every((column) => column.down.length === 0)
  );
}

// The moves that sweep a finishable table home, lowest cards first.
export function finishingMoves(state: EngineState): Action[] {
  const moves: Action[] = [];
  let current = state;
  while (!current.won) {
    const next = current.tableau
      .map((column) => column.up[column.up.length - 1])
      .filter((card): card is Card => !!card)
      .sort((a, b) => rankIndex(a) - rankIndex(b))
      .find((card) => fits(current, card, { kind: "foundation" }));
    if (!next) break;
    const action: Action = { type: "move", card: next, to: { kind: "foundation" } };
    const result = advance(current, action);
    if (!result.ok) break;
    moves.push(action);
    current = result.state;
  }
  return moves;
}
