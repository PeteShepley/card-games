import { useRef, useState } from "react";
import { cardKey, sameCard, SUITS } from "@card-games/card-kit/cards.ts";
import type { Card } from "@card-games/card-kit/cards.ts";
import { CardCanvas } from "@card-games/card-kit/canvas/CardCanvas.tsx";
import type { CanvasSize } from "@card-games/card-kit/canvas/CardCanvas.tsx";
import { PICKED } from "@card-games/card-kit/canvas/spec.ts";
import type { CardSpec, SceneSpec, SlotSpec } from "@card-games/card-kit/canvas/spec.ts";
import { useElementHeight } from "@card-games/card-kit/canvas/useElementHeight.ts";
import { hudButton, hudPrimaryButton } from "@card-games/card-kit/hudStyles.ts";
import { SUIT_SYMBOL, cardLabel } from "@card-games/card-kit/table/labels.ts";
import { bestTarget, canAutoFinish, finishingMoves, locate } from "./engine/game.ts";
import type { Action, DrawCount, EngineState, Target } from "./engine/game.ts";
import { dropTarget, solitaireLayout } from "./layout.ts";

interface TableProps {
  game: EngineState;
  canUndo: boolean;
  apply: (action: Action) => boolean;
  undo: () => void;
  newGame: (drawCount: DrawCount) => void;
  shareUrl: string;
}

// The cards are drawn on the canvas (laid out by layout.ts); the controls
// are DOM over it.
//
// Drag a card - and everything on it - to a column or a foundation. Or
// click it to pick it up, then click where it goes; clicking the held card
// again sends it to its foundation (or the first column that takes it), so
// a double-click does the same, and works on a phone. The stock turns
// cards; an empty stock turns the waste.
export function Table({ game, canUndo, apply, undo, newGame, shareUrl }: TableProps) {
  const [selected, setSelected] = useState<Card | null>(null);
  const [copied, setCopied] = useState(false);
  const [size, setSize] = useState<CanvasSize | null>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const hudHeight = useElementHeight(hudRef);
  const isSelected = (card: Card) => !!selected && sameCard(selected, card);

  const move = (card: Card, to: Target) => apply({ type: "move", card, to });
  const moveTo = (to: Target) => {
    if (selected && move(selected, to)) setSelected(null);
  };

  const sendHome = (card: Card) => {
    const to = bestTarget(game, card);
    if (to) move(card, to);
    setSelected(null);
  };

  // A click on a face-up card: send the held card home if this is it, drop
  // it onto this card's column, or pick this one up instead.
  const onCardClick = (card: Card, column?: number) => {
    if (isSelected(card)) {
      sendHome(card);
      return;
    }
    if (selected && column !== undefined && move(selected, { kind: "tableau", column })) {
      setSelected(null);
      return;
    }
    setSelected(locate(game, card) ? card : null);
  };

  const draw = () => {
    apply({ type: "draw" });
    setSelected(null);
  };

  const finish = () => {
    for (const action of finishingMoves(game)) apply(action);
    setSelected(null);
  };

  const share = () => {
    void navigator.clipboard?.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  let spec: SceneSpec | null = null;
  if (size) {
    const layout = solitaireLayout(game, size.width, size.height, hudHeight);
    const wasteTop = game.waste[game.waste.length - 1];
    const cards: CardSpec[] = layout.placed.map((placed) => {
      const { card } = placed;
      const base = { key: cardKey(card), face: placed.faceUp ? card : null, x: placed.x, y: placed.y, w: layout.cardW, z: placed.z };
      const ring = isSelected(card) ? PICKED : null;
      const drop = (at: { x: number; y: number }) => {
        const to = dropTarget(layout, at);
        if (to) move(card, to);
        setSelected(null);
      };
      switch (placed.where) {
        case "stock":
          return { ...base, onTap: draw };
        case "waste": {
          if (!wasteTop || !sameCard(card, wasteTop)) return base;
          return { ...base, ring, onTap: () => onCardClick(card), drag: { carry: [base.key], onDrop: drop } };
        }
        case "foundation": {
          const pile = game.foundations[card.suit];
          if (!sameCard(card, pile[pile.length - 1])) return base;
          return {
            ...base,
            ring,
            onTap: () => (selected && !isSelected(card) ? moveTo({ kind: "foundation" }) : onCardClick(card)),
            drag: { carry: [base.key], onDrop: drop }
          };
        }
        case "tableau": {
          if (!placed.faceUp) return base;
          const column = game.tableau[placed.column!].up;
          const from = column.findIndex((each) => sameCard(each, card));
          return {
            ...base,
            ring,
            onTap: () => onCardClick(card, placed.column),
            drag: { carry: column.slice(from).map(cardKey), onDrop: drop }
          };
        }
      }
    });
    const slots: SlotSpec[] = [
      { key: "stock", ...layout.stock, w: layout.cardW, label: game.stock.length ? "" : "↻", onTap: draw },
      { key: "waste", ...layout.waste, w: layout.cardW },
      ...SUITS.map((suit) => ({
        key: `foundation:${suit}`,
        ...layout.foundations[suit],
        w: layout.cardW,
        label: SUIT_SYMBOL[suit],
        labelColor: suit === "hearts" || suit === "diamonds" ? 0xff9a9a : 0xffffff,
        onTap: () => moveTo({ kind: "foundation" })
      })),
      ...game.tableau.flatMap((column, index) =>
        column.down.length === 0 && column.up.length === 0
          ? [{ key: `column:${index}`, x: layout.columnXs[index], y: layout.tableauY, w: layout.cardW, label: "K", onTap: () => moveTo({ kind: "tableau", column: index }) }]
          : []
      )
    ];
    spec = { cards, slots };
  }

  return (
    <div className="table table--canvas solitaire">
      <CardCanvas spec={spec} onSize={setSize} celebrate={game.won ? `won:${game.seed}:${game.drawCount}` : null} />
      <div className="hud solitaire__hud" ref={hudRef}>
        <span>{game.won ? "Solved!" : `${game.moves} ${game.moves === 1 ? "move" : "moves"}`}</span>
        <button type="button" style={hudButton} onClick={undo} disabled={!canUndo || game.won}>
          Undo
        </button>
        {canAutoFinish(game) && (
          <button type="button" style={hudPrimaryButton} onClick={finish}>
            Auto-finish
          </button>
        )}
        <button type="button" style={hudButton} onClick={() => newGame(1)}>
          <span className="wide-only">New · </span>draw 1
        </button>
        <button type="button" style={hudButton} onClick={() => newGame(3)}>
          <span className="wide-only">New · </span>draw 3
        </button>
        <button type="button" style={hudButton} onClick={share} title="Copy a link to this deal">
          {copied ? "Link copied" : `Deal #${game.seed}`}
        </button>
      </div>

      {/* The playable cards as hidden buttons, so a keyboard or screen
          reader can still send a card home. */}
      <div className="sr-only" role="group" aria-label="Playable cards">
        {[game.waste[game.waste.length - 1], ...game.tableau.flatMap((column) => column.up)]
          .filter((card): card is Card => !!card)
          .map((card) => (
            <button type="button" key={cardKey(card)} onClick={() => sendHome(card)}>
              Send {cardLabel(card)} home
            </button>
          ))}
        <button type="button" onClick={draw}>
          {game.stock.length ? `Draw (${game.stock.length} left)` : "Turn the waste over"}
        </button>
      </div>

      {game.won && (
        <div className="overlay overlay--soft">
          <div className="panel">
            <h2>Solved in {game.moves} moves</h2>
            <button type="button" style={hudPrimaryButton} onClick={() => newGame(game.drawCount)}>
              Deal again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
