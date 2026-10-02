import type { CSSProperties, ReactNode } from "react";
import { cardKey, sameCard } from "@card-games/card-kit/cards.ts";
import type { Card } from "@card-games/card-kit/cards.ts";
import { hudButton, hudPrimaryButton } from "@card-games/card-kit/hudStyles.ts";
import { CardFace, Nameplate, OpponentSeat } from "@card-games/card-kit/table/Cards.tsx";
import { cardLabel, squeeze } from "@card-games/card-kit/table/labels.ts";
import { seatPositions } from "@card-games/card-kit/table/seats.ts";
import { TrickArea } from "@card-games/card-kit/table/Trick.tsx";
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

  const seatAt = seatPositions(game.seats, perspective);
  const hand = sortHand(game.hands[perspective] ?? []);
  const legal = legalPlays(game, perspective);
  const myTurn = game.toAct === perspective;
  const bidding = game.phase === "bidding" && myTurn;
  const us = teamOf(game, perspective);

  // What a seat bid and has taken so far: "bid 3 · 1 won", or "bidding…".
  const seatDetail = (seat: Seat) => {
    const bid = game.bids[seat];
    if (bid === null) return game.phase === "bidding" && game.toAct === seat ? "bidding…" : "no bid yet";
    return `bid ${bidLabel(bid)} · ${game.tricksWon[seat]} won`;
  };

  return (
    <div className="table table--four">
      {banner}
      {(["left", "top", "right"] as const).map((position) => {
        const seat = seatAt[position];
        return (
          <div className={`seat seat--${position}`} key={position}>
            <OpponentSeat
              name={nameOf(names, seat)}
              count={game.hands[seat]?.length ?? 0}
              active={game.toAct === seat}
              badge={
                <>
                  {seat === partnerOf(game, perspective) && <span className="seat__tag">partner</span>}
                  {seat === game.dealer && <span className="opponent__dealer" title="dealer">D</span>}
                </>
              }
              detail={seatDetail(seat)}
            />
          </div>
        );
      })}

      <TrickArea
        trick={game.trick}
        last={game.phase === "playing" ? game.lastTrick?.cards : null}
        seatAt={seatAt}
        caption={game.lastTrick && `${nameOf(names, game.lastTrick.winner)} took it`}
        note={game.spadesBroken && game.phase === "playing" && "♠ broken"}
      />

      <ol className="feed">
        {snapshot.feed.map((entry) => (
          <li key={entry.id}>{entry.text}</li>
        ))}
      </ol>

      <div className="seat seat--bottom">
        <Scoreboard game={game} us={us} names={names} />
        <div className="hud">
          <Nameplate active={myTurn}>{nameOf(names, perspective)}</Nameplate>
          <span>{statusLine(game, perspective, names)}</span>
          <span className="hud__score">{seatDetail(perspective)}</span>
        </div>
        {bidding && (
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
        )}
        <div className="hand" style={{ "--squeeze": squeeze(hand.length, 10) } as CSSProperties}>
          {hand.map((card: Card) => {
            const live = game.phase === "playing" && myTurn && legal.some((each) => sameCard(each, card));
            const classes = ["hand__card", live && "hand__card--live", game.phase === "playing" && myTurn && !live && "hand__card--dim"];
            return (
              <button
                type="button"
                key={cardKey(card)}
                className={classes.filter(Boolean).join(" ")}
                onClick={() => live && submit({ type: "play", seat: perspective, card })}
                disabled={!live}
                aria-label={cardLabel(card)}
              >
                <CardFace card={card} />
              </button>
            );
          })}
        </div>
      </div>

      {(game.phase === "handOver" || game.phase === "gameOver") && game.handScore && (
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
      )}
    </div>
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
