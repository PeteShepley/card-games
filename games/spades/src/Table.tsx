import type { ReactNode } from "react";
import { sameCard } from "@card-games/card-kit/cards.ts";
import type { Card } from "@card-games/card-kit/cards.ts";
import { FourSeatTable } from "@card-games/card-kit/canvas/FourSeatTable.tsx";
import { hudButton, hudPrimaryButton } from "@card-games/card-kit/hudStyles.ts";
import { Nameplate } from "@card-games/card-kit/table/Cards.tsx";
import { useTapToPlay } from "@card-games/card-kit/table/tapToPlay.ts";
import { sortHand } from "@card-games/card-kit/tricks.ts";
import { legalPlays, partnerOf, teamOf } from "./engine/game.ts";
import type { Action, EngineState, Seat, Team } from "./engine/game.ts";
import { bidLabel, gameLine, handSummary, nameOf, statusLine, teamName } from "./status.ts";
import type { GameSnapshot } from "./store.ts";

interface TableProps {
  snapshot: GameSnapshot;
  // The seat drawn face-up at the bottom: the viewer, or in the hot seat
  // whoever is acting.
  perspective: Seat;
  submit: (action: Action) => void;
  banner?: ReactNode;
}

const BIDS = Array.from({ length: 14 }, (_, bid) => bid);

export function Table({ snapshot, perspective, submit, banner }: TableProps) {
  const { game, names } = snapshot;
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
  const legal = legalPlays(game, perspective);
  const myTurn = game.toAct === perspective;
  const bidding = game.phase === "bidding" && myTurn;
  const us = teamOf(game, perspective);
  const isLegal = (card: Card) => game.phase === "playing" && myTurn && legal.some((each) => sameCard(each, card));
  const play = (card: Card) => submit({ type: "play", seat: perspective, card });

  // What a seat bid and has taken so far: "bid 3 · 1 won", or "bidding…".
  const seatDetail = (seat: Seat) => {
    const bid = game.bids[seat];
    if (bid === null) return game.phase === "bidding" && game.toAct === seat ? "bidding…" : "no bid yet";
    return `bid ${bidLabel(bid)} · ${game.tricksWon[seat]} won`;
  };

  return (
    <FourSeatTable
      seats={game.seats}
      perspective={perspective}
      seatInfo={(seat) => ({
        name: nameOf(names, seat),
        count: game.hands[seat]?.length ?? 0,
        active: game.toAct === seat,
        badge: (
          <>
            {seat === partnerOf(game, perspective) && <span className="seat__tag">partner</span>}
            {seat === game.dealer && (
              <span className="opponent__dealer" title="dealer">
                D
              </span>
            )}
          </>
        ),
        detail: seatDetail(seat)
      })}
      trick={game.trick}
      lastTrick={game.phase === "playing" ? game.lastTrick : null}
      caption={game.lastTrick && `${nameOf(names, game.lastTrick.winner)} took it`}
      note={game.spadesBroken && game.phase === "playing" && <span className="spades-broken">♠ broken</span>}
      hand={hand}
      look={(card) => {
        const live = isLegal(card);
        return { live, lifted: live && isLifted(card), dim: game.phase === "playing" && myTurn && !live };
      }}
      onCardTap={(card) => {
        if (isLegal(card)) tap(card, () => play(card));
      }}
      onSwipeEnd={(card) => {
        if (isLegal(card)) lift(card);
      }}
      canActivate={isLegal}
      onActivate={play}
      banner={banner}
      // The trick is empty while bidding, so the bids take its place.
      center={
        bidding && (
          <div className="bids" role="group" aria-label="Your bid">
            {BIDS.map((bid) => (
              <button
                type="button"
                key={bid}
                style={bid === 0 ? hudButton : hudPrimaryButton}
                onClick={() => submit({ type: "bid", seat: perspective, bid })}
                title={bid === 0 ? "Nil: take no tricks for +100 (or −100)" : `${bid} tricks`}
              >
                {bid === 0 ? "Nil" : bid}
              </button>
            ))}
          </div>
        )
      }
      stack={
        <>
          <ol className="feed">
            {snapshot.feed.map((entry) => (
              <li key={entry.id}>{entry.text}</li>
            ))}
          </ol>
          <Scoreboard game={game} us={us} names={names} />
          <div className="hud">
            <Nameplate active={myTurn}>{nameOf(names, perspective)}</Nameplate>
            <span>{statusLine(game, perspective, names)}</span>
            <span className="hud__score">{seatDetail(perspective)}</span>
          </div>
        </>
      }
      overlay={
        (game.phase === "handOver" || game.phase === "gameOver") &&
        game.handScore && (
          <div className="overlay overlay--soft">
            <div className="panel">
              <h2>{game.phase === "gameOver" ? gameLine(game, perspective, names) : statusLine(game, perspective, names)}</h2>
              <table className="scores">
                <tbody>
                  {([us, (1 - us) as Team] as const).map((team) => (
                    <tr key={team}>
                      <td>{teamName(game, team, names)}</td>
                      <td className="scores__detail">{handSummary(game.handScore![team], names)}</td>
                      <td>{game.scores[team]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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

// Both partnerships at a glance: running score, bags, and this hand's
// combined bid against tricks taken.
function Scoreboard({ game, us, names }: { game: EngineState; us: Team; names: Readonly<Record<Seat, string>> }) {
  const line = (team: Team, label: string) => {
    const [x, y] = [game.seats[team], game.seats[team + 2]];
    const bid = [x, y].reduce((sum, seat) => sum + (game.bids[seat] ?? 0), 0);
    const won = game.tricksWon[x] + game.tricksWon[y];
    const bidding = game.bids[x] === null || game.bids[y] === null;
    return (
      <span className={`team${team === us ? " team--us" : ""}`} title={teamName(game, team, names)}>
        <strong>{label}</strong> {game.scores[team]}
        <span className="team__detail">
          {game.bags[team]} bags{bidding ? "" : ` · ${won}/${bid} tricks`}
        </span>
      </span>
    );
  };
  return (
    <div className="scoreboard">
      {line(us, "Us")}
      {line((1 - us) as Team, "Them")}
    </div>
  );
}
