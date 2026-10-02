import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { cardAssetUrl } from "@card-games/card-kit/cardAssets.ts";
import { cardKey, sameCard, SUITS } from "@card-games/card-kit/cards.ts";
import type { Card, Suit } from "@card-games/card-kit/cards.ts";
import { hudButton, hudPrimaryButton } from "@card-games/card-kit/hudStyles.ts";
import { canDraw, legalActions, nextSeat, playableCards, topCard } from "./engine/game.ts";
import type { Action, EngineState, Seat } from "./engine/game.ts";
import { SUIT_SYMBOL, cardLabel, resultLine, statusLine } from "./status.ts";
import type { GameSnapshot } from "./store.ts";

interface TableProps {
  snapshot: GameSnapshot;
  // The seat drawn face-up at the bottom: the viewer, or in the hot seat
  // whoever is acting.
  perspective: Seat;
  submit: (action: Action) => void;
  banner?: ReactNode;
}

export function Table({ snapshot, perspective, submit, banner }: TableProps) {
  const { game, names } = snapshot;
  // An 8 waiting for its suit. Local UI state: nothing is submitted until
  // the suit is chosen.
  const [pendingEight, setPendingEight] = useState<Card | null>(null);

  if (!game || game.phase === "awaitingStart") {
    return (
      <div className="table table--idle">
        {banner}
        <div className="hud">
          <span>{statusLine(game, perspective, names)}</span>
          {game && (
            <button type="button" style={hudPrimaryButton} onClick={() => submit({ type: "startHand" })}>
              Deal
            </button>
          )}
        </div>
      </div>
    );
  }

  const legal = legalActions(game, perspective);
  const playable = playableCards(game, perspective);
  const myTurn = game.phase === "play" && game.toAct === perspective;
  const hand = game.hands[perspective] ?? [];

  const onCardClick = (card: Card) => {
    if (!playable.some((each) => sameCard(each, card))) return;
    if (card.rank === "8") setPendingEight(card);
    else submit({ type: "play", seat: perspective, card });
  };
  const chooseSuit = (suit: Suit) => {
    if (pendingEight) submit({ type: "play", seat: perspective, card: pendingEight, suit });
    setPendingEight(null);
  };

  return (
    <div className="table">
      {banner}
      <Opponents game={game} perspective={perspective} names={names} />

      <div className="center">
        <button
          type="button"
          className={`pile${legal.includes("draw") ? " pile--live" : ""}`}
          disabled={!legal.includes("draw")}
          onClick={() => submit({ type: "draw", seat: perspective })}
          aria-label={`Draw a card (${game.stock.length} in stock)`}
        >
          {game.stock.length > 0 || canDraw(game) ? <div className="card card--back" /> : <div className="card card--empty" />}
          <span className="pile__count">{game.stock.length}</span>
        </button>
        <div className="pile">
          <CardFace card={topCard(game)!} />
          {game.activeSuit && game.activeSuit !== topCard(game)!.suit && (
            <span className={`suit-badge suit-badge--${game.activeSuit}`} title={`${game.activeSuit} to follow`}>
              {SUIT_SYMBOL[game.activeSuit]}
            </span>
          )}
        </div>
      </div>

      <ol className="feed">
        {snapshot.feed.map((entry) => (
          <li key={entry.id}>{entry.text}</li>
        ))}
      </ol>

      <div className="hud">
        <span className={`nameplate nameplate--inline${myTurn ? " nameplate--active" : ""}`}>
          <span className="nameplate__dot" />
          {names[perspective] ?? "You"}
        </span>
        <span>{statusLine(game, perspective, names)}</span>
        {legal.includes("startHand") && (
          <button type="button" style={hudPrimaryButton} onClick={() => submit({ type: "startHand" })}>
            Deal next hand
          </button>
        )}
        {legal.includes("draw") && (
          <button type="button" style={hudButton} onClick={() => submit({ type: "draw", seat: perspective })}>
            Draw
          </button>
        )}
        {legal.includes("pass") && (
          <button type="button" style={hudButton} onClick={() => submit({ type: "pass", seat: perspective })}>
            Pass
          </button>
        )}
      </div>

      <div className="hand" style={{ "--squeeze": squeeze(hand.length) } as CSSProperties}>
        {hand.map((card) => {
          const live = myTurn && playable.some((each) => sameCard(each, card));
          return (
            <button
              type="button"
              key={cardKey(card)}
              className={`hand__card${live ? " hand__card--live" : ""}${myTurn && !live ? " hand__card--dim" : ""}`}
              onClick={() => onCardClick(card)}
              disabled={!live}
              aria-label={cardLabel(card)}
            >
              <CardFace card={card} />
            </button>
          );
        })}
      </div>

      {pendingEight && (
        <div className="overlay" role="dialog" aria-label="Choose a suit">
          <div className="panel">
            <h2>Name the suit</h2>
            <div className="suit-choices">
              {SUITS.map((suit) => (
                <button type="button" key={suit} className={`suit-choice suit-choice--${suit}`} onClick={() => chooseSuit(suit)}>
                  <span aria-hidden="true">{SUIT_SYMBOL[suit]}</span> {suit}
                </button>
              ))}
            </div>
            <button type="button" style={hudButton} onClick={() => setPendingEight(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {game.phase === "handOver" && (
        <div className="overlay overlay--soft">
          <div className="panel">
            <h2>{resultLine(game, perspective, names)}</h2>
            <Scores game={game} names={names} />
            <button type="button" style={hudPrimaryButton} onClick={() => submit({ type: "startHand" })}>
              Deal next hand
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Everyone but the perspective seat, in turn order starting from the seat
// after it — so the player to act after you sits leftmost.
function Opponents({
  game,
  perspective,
  names
}: {
  game: EngineState;
  perspective: Seat;
  names: Readonly<Record<Seat, string>>;
}) {
  const order: Seat[] = [];
  for (let seat = nextSeat(game, perspective); seat !== perspective; seat = nextSeat(game, seat)) {
    order.push(seat);
  }
  return (
    <div className="opponents">
      {order.map((seat) => {
        const count = game.hands[seat]?.length ?? 0;
        const active = game.phase === "play" && game.toAct === seat;
        return (
          <div className="opponent" key={seat}>
            <div className="opponent__fan" aria-hidden="true">
              {Array.from({ length: Math.min(count, 8) }, (_, index) => (
                <div className="card card--back card--mini" key={index} />
              ))}
            </div>
            <span className={`nameplate nameplate--inline${active ? " nameplate--active" : ""}`}>
              <span className="nameplate__dot" />
              {names[seat] ?? seat}
              <span className="opponent__count">{count} cards</span>
              {seat === game.dealer && <span className="opponent__dealer" title="dealer">D</span>}
            </span>
            <span className="opponent__score">{game.scores[seat]} pts</span>
          </div>
        );
      })}
    </div>
  );
}

function Scores({ game, names }: { game: EngineState; names: Readonly<Record<Seat, string>> }) {
  const ranked = [...game.seats].sort((a, b) => game.scores[b] - game.scores[a]);
  return (
    <table className="scores">
      <tbody>
        {ranked.map((seat) => (
          <tr key={seat}>
            <td>{names[seat] ?? seat}</td>
            <td>{game.scores[seat]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CardFace({ card }: { card: Card }) {
  return <img className="card" src={cardAssetUrl(card)} alt={cardLabel(card)} draggable={false} />;
}

// How much neighbouring cards overlap: none for a normal hand, then more
// as draws pile up, so a long hand still fits one row.
function squeeze(count: number): number {
  return count <= 7 ? 0.05 : Math.min(0.72, 1 - 7 / count);
}
