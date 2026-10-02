import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { cardKey, sameCard } from "@card-games/card-kit/cards.ts";
import type { Card } from "@card-games/card-kit/cards.ts";
import { hudPrimaryButton } from "@card-games/card-kit/hudStyles.ts";
import { CardFace, Nameplate, OpponentSeat } from "@card-games/card-kit/table/Cards.tsx";
import { cardLabel, squeeze } from "@card-games/card-kit/table/labels.ts";
import { cardPoints, legalPlays, nextSeat, passTarget } from "./engine/game.ts";
import type { Action, EngineState, Played, Seat } from "./engine/game.ts";
import { sortHand } from "./engine/tricks.ts";
import { gameLine, handLine, nameOf, statusLine } from "./status.ts";
import type { GameSnapshot } from "./store.ts";

interface TableProps {
  snapshot: GameSnapshot;
  // The seat drawn face-up at the bottom: the viewer, or in the hot seat
  // whoever is acting.
  perspective: Seat;
  submit: (action: Action) => void;
  banner?: ReactNode;
}

type Position = "left" | "top" | "right" | "bottom";

// Play passes to the left, so the next seat sits on your left, the one
// after across, and the last on your right.
function positions(game: EngineState, perspective: Seat): Record<Position, Seat> {
  return {
    bottom: perspective,
    left: nextSeat(game, perspective, 1),
    top: nextSeat(game, perspective, 2),
    right: nextSeat(game, perspective, 3)
  };
}

export function Table({ snapshot, perspective, submit, banner }: TableProps) {
  const { game, names } = snapshot;
  // Cards picked to pass; local until submitted. Keyed by hand so a new
  // deal (or a hot-seat perspective change) starts clean.
  const [picked, setPicked] = useState<{ key: string; cards: Card[] }>({ key: "", cards: [] });

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

  const seatAt = positions(game, perspective);
  const hand = sortHand(game.hands[perspective] ?? []);
  const pickKey = `${game.handNumber}:${perspective}`;
  const chosen = picked.key === pickKey ? picked.cards : [];
  const passing = game.phase === "passing" && game.passed[perspective] === null;
  const alreadyPassed = game.phase === "passing" ? game.passed[perspective] : null;
  const legal = legalPlays(game, perspective);
  const myTurn = game.phase === "playing" && game.toAct === perspective;

  const togglePick = (card: Card) => {
    const has = chosen.some((each) => sameCard(each, card));
    if (!has && chosen.length >= 3) return;
    setPicked({
      key: pickKey,
      cards: has ? chosen.filter((each) => !sameCard(each, card)) : [...chosen, card]
    });
  };

  const onCardClick = (card: Card) => {
    if (passing) togglePick(card);
    else if (legal.some((each) => sameCard(each, card))) submit({ type: "play", seat: perspective, card });
  };

  const seatDetail = (seat: Seat) =>
    `${cardPoints(game.taken[seat])} this hand · ${game.scores[seat]} total`;

  return (
    <div className="table hearts">
      {banner}
      {(["left", "top", "right"] as const).map((position) => {
        const seat = seatAt[position];
        return (
          <div className={`seat seat--${position}`} key={position}>
            <OpponentSeat
              name={nameOf(names, seat)}
              count={game.hands[seat]?.length ?? 0}
              active={game.toAct === seat || (game.phase === "passing" && game.passed[seat] === null)}
              badge={game.phase === "passing" && game.passed[seat] !== null && <span title="passed">✓</span>}
              detail={seatDetail(seat)}
            />
          </div>
        );
      })}

      <TrickArea game={game} seatAt={seatAt} names={names} />

      <ol className="feed">
        {snapshot.feed.map((entry) => (
          <li key={entry.id}>{entry.text}</li>
        ))}
      </ol>

      <div className="seat seat--bottom">
        <div className="hud">
          <Nameplate active={myTurn || passing}>{nameOf(names, perspective)}</Nameplate>
          <span>{statusLine(game, perspective, names)}</span>
          <span className="hud__score">{seatDetail(perspective)}</span>
          {passing && (
            <button
              type="button"
              style={hudPrimaryButton}
              disabled={chosen.length !== 3}
              onClick={() => submit({ type: "pass", seat: perspective, cards: chosen })}
            >
              Pass {game.passDirection} to {nameOf(names, passTarget(game, perspective))} ({chosen.length}/3)
            </button>
          )}
        </div>
        <div className="hand" style={{ "--squeeze": squeeze(hand.length, 10) } as CSSProperties}>
          {hand.map((card) => {
            const isPicked = (alreadyPassed ?? chosen).some((each) => sameCard(each, card));
            const live = passing || (myTurn && legal.some((each) => sameCard(each, card)));
            const classes = [
              "hand__card",
              live && "hand__card--live",
              isPicked && "hand__card--picked",
              ((myTurn && !live) || alreadyPassed) && "hand__card--dim"
            ].filter(Boolean);
            return (
              <button
                type="button"
                key={cardKey(card)}
                className={classes.join(" ")}
                onClick={() => onCardClick(card)}
                disabled={!live}
                aria-pressed={passing ? isPicked : undefined}
                aria-label={cardLabel(card)}
              >
                <CardFace card={card} />
              </button>
            );
          })}
        </div>
      </div>

      {(game.phase === "handOver" || game.phase === "gameOver") && (
        <div className="overlay overlay--soft">
          <div className="panel">
            <h2>{game.phase === "gameOver" ? gameLine(game, perspective, names) : handLine(game, perspective, names)}</h2>
            <ScoreTable game={game} names={names} />
            <button type="button" style={hudPrimaryButton} onClick={() => submit({ type: "startHand" })}>
              {game.phase === "gameOver" ? "New game" : "Deal next hand"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// The trick in a cross, each card in front of whoever played it. Between
// tricks the last one stays on the felt (dimmed) so the fourth card is seen.
function TrickArea({
  game,
  seatAt,
  names
}: {
  game: EngineState;
  seatAt: Record<Position, Seat>;
  names: Readonly<Record<Seat, string>>;
}) {
  const showingLast = game.trick.length === 0 && game.lastTrick !== null && game.phase === "playing";
  const cards: readonly Played[] = showingLast ? game.lastTrick!.cards : game.trick;
  const at = (position: Position) => cards.find((played) => played.seat === seatAt[position]);
  return (
    <div className={`trick${showingLast ? " trick--last" : ""}`}>
      {(["top", "left", "right", "bottom"] as const).map((position) => {
        const played = at(position);
        return (
          <div className={`trick__slot trick__slot--${position}`} key={position}>
            {played && <CardFace card={played.card} />}
          </div>
        );
      })}
      {showingLast && (
        <span className="trick__caption">{nameOf(names, game.lastTrick!.winner)} took it</span>
      )}
      {game.heartsBroken && game.phase === "playing" && <span className="trick__broken">♥ broken</span>}
    </div>
  );
}

function ScoreTable({ game, names }: { game: EngineState; names: Readonly<Record<Seat, string>> }) {
  return (
    <table className="scores">
      <thead>
        <tr>
          <th />
          <th>Hand</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        {[...game.seats]
          .sort((a, b) => game.scores[a] - game.scores[b])
          .map((seat) => (
            <tr key={seat}>
              <td>{nameOf(names, seat)}</td>
              <td>{game.handScore ? `+${game.handScore.points[seat]}` : ""}</td>
              <td>{game.scores[seat]}</td>
            </tr>
          ))}
      </tbody>
    </table>
  );
}
