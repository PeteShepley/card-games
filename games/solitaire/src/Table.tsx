import { useState } from "react";
import { cardKey, sameCard, SUITS } from "@card-games/card-kit/cards.ts";
import type { Card } from "@card-games/card-kit/cards.ts";
import { hudButton, hudPrimaryButton } from "@card-games/card-kit/hudStyles.ts";
import { CardBack, CardFace } from "@card-games/card-kit/table/Cards.tsx";
import { SUIT_SYMBOL, cardLabel } from "@card-games/card-kit/table/labels.ts";
import { bestTarget, canAutoFinish, finishingMoves, locate } from "./engine/game.ts";
import type { Action, DrawCount, EngineState, Target } from "./engine/game.ts";

interface TableProps {
  game: EngineState;
  canUndo: boolean;
  apply: (action: Action) => boolean;
  undo: () => void;
  newGame: (drawCount: DrawCount) => void;
  shareUrl: string;
}

// Click a card to pick it up (it and everything on it), then click where it
// goes. Clicking the held card again sends it to its foundation (or the
// first column that takes it), so a double-click does the same - and works
// on a phone, which has no reliable double-tap. The stock turns cards; an
// empty stock turns the waste.
export function Table({ game, canUndo, apply, undo, newGame, shareUrl }: TableProps) {
  const [selected, setSelected] = useState<Card | null>(null);
  const [copied, setCopied] = useState(false);
  const isSelected = (card: Card) => !!selected && sameCard(selected, card);

  const moveTo = (to: Target) => {
    if (selected && apply({ type: "move", card: selected, to })) setSelected(null);
  };

  // A click on a face-up card: send the held card home if this is it, drop
  // it onto this card's column, or pick this one up instead.
  const onCardClick = (card: Card, column?: number) => {
    if (isSelected(card)) {
      sendHome(card);
      return;
    }
    if (selected && !isSelected(card) && column !== undefined) {
      if (apply({ type: "move", card: selected, to: { kind: "tableau", column } })) {
        setSelected(null);
        return;
      }
    }
    setSelected(locate(game, card) ? card : null);
  };

  const sendHome = (card: Card) => {
    const to = bestTarget(game, card);
    if (to) apply({ type: "move", card, to });
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

  // Draw-3 shows up to three waste cards fanned; only the top one plays.
  const shown = game.waste.slice(-(game.drawCount === 3 ? 3 : 1));

  return (
    <div className="table solitaire">
      <div className="hud">
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

      <div className="top-row">
        <button
          type="button"
          className="slot"
          onClick={() => {
            apply({ type: "draw" });
            setSelected(null);
          }}
          aria-label={game.stock.length ? `Draw (${game.stock.length} left)` : "Turn the waste over"}
        >
          {game.stock.length > 0 ? <CardBack /> : <div className="card card--empty slot__recycle">↻</div>}
        </button>

        <div className={`waste waste--${game.drawCount}`}>
          {shown.length === 0 && <div className="card card--empty" />}
          {shown.map((card, index) => {
            const top = index === shown.length - 1;
            return (
              <button
                type="button"
                key={cardKey(card)}
                className={`slot${isSelected(card) ? " slot--selected" : ""}`}
                disabled={!top}
                onClick={() => onCardClick(card)}
                aria-label={cardLabel(card)}
              >
                <CardFace card={card} />
              </button>
            );
          })}
        </div>

        <div className="spacer" />

        {SUITS.map((suit) => {
          const pile = game.foundations[suit];
          const top = pile[pile.length - 1];
          return (
            <button
              type="button"
              key={suit}
              className={`slot${top && isSelected(top) ? " slot--selected" : ""}`}
              onClick={() => (selected ? moveTo({ kind: "foundation" }) : top && onCardClick(top))}
              aria-label={top ? `${suit} foundation, ${cardLabel(top)}` : `${suit} foundation, empty`}
            >
              {top ? (
                <CardFace card={top} />
              ) : (
                <div className={`card card--empty foundation--${suit}`}>{SUIT_SYMBOL[suit]}</div>
              )}
            </button>
          );
        })}
      </div>

      <div className="tableau">
        {game.tableau.map((column, index) => (
          <div className="column" key={index}>
            {column.down.length === 0 && column.up.length === 0 && (
              <button
                type="button"
                className="slot"
                onClick={() => moveTo({ kind: "tableau", column: index })}
                aria-label={`Empty column ${index + 1}`}
              >
                <div className="card card--empty">K</div>
              </button>
            )}
            {column.down.map((card) => (
              <div className="column__card column__card--down" key={cardKey(card)}>
                <CardBack />
              </div>
            ))}
            {column.up.map((card) => (
              <button
                type="button"
                key={cardKey(card)}
                className={`column__card slot${isSelected(card) ? " slot--selected" : ""}`}
                onClick={() => onCardClick(card, index)}
                aria-label={cardLabel(card)}
              >
                <CardFace card={card} />
              </button>
            ))}
          </div>
        ))}
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
