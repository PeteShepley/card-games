import { useState } from "react";
import type { ReactNode } from "react";
import { sameCard } from "@card-games/card-kit/cards.ts";
import type { Card } from "@card-games/card-kit/cards.ts";
import { FourSeatTable } from "@card-games/card-kit/canvas/FourSeatTable.tsx";
import { hudPrimaryButton } from "@card-games/card-kit/hudStyles.ts";
import { Nameplate } from "@card-games/card-kit/table/Cards.tsx";
import { useTapToPlay } from "@card-games/card-kit/table/tapToPlay.ts";
import { sortHand } from "@card-games/card-kit/tricks.ts";
import { cardPoints, legalPlays, passTarget } from "./engine/game.ts";
import type { Action, EngineState, Seat } from "./engine/game.ts";
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

export function Table({ snapshot, perspective, submit, banner }: TableProps) {
  const { game, names } = snapshot;
  // Cards picked to pass; local until submitted. Keyed by hand so a new
  // deal (or a hot-seat perspective change) starts clean.
  const [picked, setPicked] = useState<{ key: string; cards: Card[] }>({ key: "", cards: [] });
  // Before the early return, as hooks must be: a lift lasts for this view
  // of this hand on this turn.
  const { isLifted, tap, lift } = useTapToPlay(
    game ? `${game.handNumber}:${perspective}:${game.toAct}:${game.trick.length}` : ""
  );

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

  const hand = sortHand(game.hands[perspective] ?? []);
  const pickKey = `${game.handNumber}:${perspective}`;
  const chosen = picked.key === pickKey ? picked.cards : [];
  const passing = game.phase === "passing" && game.passed[perspective] === null;
  const alreadyPassed = game.phase === "passing" ? game.passed[perspective] : null;
  const legal = legalPlays(game, perspective);
  const myTurn = game.phase === "playing" && game.toAct === perspective;
  const isLegal = (card: Card) => myTurn && legal.some((each) => sameCard(each, card));
  const play = (card: Card) => submit({ type: "play", seat: perspective, card });

  const togglePick = (card: Card) => {
    const has = chosen.some((each) => sameCard(each, card));
    if (!has && chosen.length >= 3) return;
    setPicked({
      key: pickKey,
      cards: has ? chosen.filter((each) => !sameCard(each, card)) : [...chosen, card]
    });
  };

  const seatDetail = (seat: Seat) => `${cardPoints(game.taken[seat])} this hand · ${game.scores[seat]} total`;

  return (
    <FourSeatTable
      seats={game.seats}
      perspective={perspective}
      seatInfo={(seat) => ({
        name: nameOf(names, seat),
        count: game.hands[seat]?.length ?? 0,
        active: game.toAct === seat || (game.phase === "passing" && game.passed[seat] === null),
        badge: game.phase === "passing" && game.passed[seat] !== null && <span title="passed">✓</span>,
        detail: seatDetail(seat)
      })}
      trick={game.trick}
      lastTrick={game.phase === "playing" ? game.lastTrick : null}
      caption={game.lastTrick && `${nameOf(names, game.lastTrick.winner)} took it`}
      note={game.heartsBroken && game.phase === "playing" && <span className="hearts-broken">♥ broken</span>}
      hand={hand}
      look={(card) => {
        const isPicked = (alreadyPassed ?? chosen).some((each) => sameCard(each, card));
        const live = passing || isLegal(card);
        return {
          // While passing every card is pickable; only the picked ones stand out.
          live: live && !passing,
          picked: isPicked,
          lifted: !passing && live && isLifted(card),
          dim: (myTurn && !live) || !!alreadyPassed
        };
      }}
      // Picking a card to pass is undone by tapping it again, so it needs no lift.
      onCardTap={(card) => {
        if (passing) togglePick(card);
        else if (isLegal(card)) tap(card, () => play(card));
      }}
      // While passing a swipe only previews; picking stays a tap.
      onSwipeEnd={(card) => {
        if (isLegal(card)) lift(card);
      }}
      handExitTo={game.phase === "passing" ? passTarget(game, perspective) : null}
      canActivate={(card) => passing || isLegal(card)}
      onActivate={(card) => (passing ? togglePick(card) : play(card))}
      banner={banner}
      stack={
        <>
          <ol className="feed">
            {snapshot.feed.map((entry) => (
              <li key={entry.id}>{entry.text}</li>
            ))}
          </ol>
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
        </>
      }
      overlay={
        (game.phase === "handOver" || game.phase === "gameOver") && (
          <div className="overlay overlay--soft">
            <div className="panel">
              <h2>{game.phase === "gameOver" ? gameLine(game, perspective, names) : handLine(game, perspective, names)}</h2>
              <ScoreTable game={game} names={names} />
              <button type="button" style={hudPrimaryButton} onClick={() => submit({ type: "startHand" })}>
                {game.phase === "gameOver" ? "New game" : "Deal next hand"}
              </button>
            </div>
          </div>
        )
      }
    />
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
