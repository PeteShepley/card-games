import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { cardKey, sameCard, SUITS } from "@card-games/card-kit/cards.ts";
import type { Card, Suit } from "@card-games/card-kit/cards.ts";
import { CardCanvas } from "@card-games/card-kit/canvas/CardCanvas.tsx";
import type { CanvasSize } from "@card-games/card-kit/canvas/CardCanvas.tsx";
import { HandButtons, SeatLabel } from "@card-games/card-kit/canvas/dom.tsx";
import { fanSpecs, handSpecs } from "@card-games/card-kit/canvas/layout.ts";
import { ACCENT } from "@card-games/card-kit/canvas/spec.ts";
import type { CardSpec, SceneSpec } from "@card-games/card-kit/canvas/spec.ts";
import { useElementHeight } from "@card-games/card-kit/canvas/useElementHeight.ts";
import { hudButton, hudPrimaryButton } from "@card-games/card-kit/hudStyles.ts";
import { Nameplate } from "@card-games/card-kit/table/Cards.tsx";
import { useTapToPlay } from "@card-games/card-kit/table/tapToPlay.ts";
import { canDraw, legalActions, nextSeat, playableCards, topCard } from "./engine/game.ts";
import type { Action, EngineState, Seat } from "./engine/game.ts";
import { eightsGeometry } from "./layout.ts";
import { SUIT_SYMBOL, resultLine, statusLine } from "./status.ts";
import type { GameSnapshot } from "./store.ts";

interface TableProps {
  snapshot: GameSnapshot;
  // The seat drawn face-up at the bottom: the viewer, or in the hot seat
  // whoever is acting.
  perspective: Seat;
  submit: (action: Action) => void;
  banner?: ReactNode;
}

// The cards are drawn on the canvas (the kit's CardCanvas, laid out by
// layout.ts); the words and buttons are DOM over it.
export function Table({ snapshot, perspective, submit, banner }: TableProps) {
  const { game, names } = snapshot;
  // An 8 waiting for its suit. Local UI state: nothing is submitted until
  // the suit is chosen.
  const [pendingEight, setPendingEight] = useState<Card | null>(null);
  const [size, setSize] = useState<CanvasSize | null>(null);
  const stackRef = useRef<HTMLDivElement>(null);
  const stackHeight = useElementHeight(stackRef);
  // Hooks before the early return: the lift belongs to this view of this
  // hand on this turn.
  const hand = game?.hands[perspective] ?? [];
  const myTurn = !!game && game.phase === "play" && game.toAct === perspective;
  const { isLifted, tap, lift } = useTapToPlay(`${perspective}:${myTurn}:${hand.map(cardKey).join(",")}`);

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
  const isPlayable = (card: Card) => myTurn && playable.some((each) => sameCard(each, card));
  const play = (card: Card) => {
    if (card.rank === "8") setPendingEight(card);
    else submit({ type: "play", seat: perspective, card });
  };
  const chooseSuit = (suit: Suit) => {
    if (pendingEight) submit({ type: "play", seat: perspective, card: pendingEight, suit });
    setPendingEight(null);
  };
  const draw = () => submit({ type: "draw", seat: perspective });

  // Everyone but the perspective seat, in turn order starting from the seat
  // after it - so the player to act after you sits leftmost.
  const order: Seat[] = [];
  for (let seat = nextSeat(game, perspective); seat !== perspective; seat = nextSeat(game, seat)) order.push(seat);

  const geometry = size ? eightsGeometry(size.width, size.height, stackHeight, order.length) : null;
  let spec: SceneSpec | null = null;
  if (geometry) {
    const seatPoint = (seat: Seat) =>
      seat === perspective ? { x: geometry.handCenterX, y: geometry.handTop } : geometry.seats[order.indexOf(seat)].fan;
    // Whoever played the top card: the seat before the one to act (or the
    // winner, who went out). A card from your own hand slides from there by
    // itself; anyone else's flies in from their seat.
    let lastPlayer: Seat | null = game.toAct ? game.seats.find((seat) => nextSeat(game, seat) === game.toAct) ?? null : null;
    if (game.result?.type === "out") lastPlayer = game.result.winner;
    // The top two cards of the pile, so a new card lands on the old one.
    const pile: CardSpec[] = game.discardPile.slice(-2).map((card, index, shown) => ({
      key: cardKey(card),
      face: card,
      ...geometry.discard,
      w: geometry.pileW,
      z: 20 + index,
      spawn: index === shown.length - 1 && lastPlayer ? seatPoint(lastPlayer) : geometry.stock
    }));
    const drawLive = legal.includes("draw");
    spec = {
      cards: [
        ...order.flatMap((seat, index) =>
          fanSpecs(seat, game.hands[seat]?.length ?? 0, geometry.seats[index].fan, geometry.miniW, geometry.seats[index].fanMaxWidth, geometry.stock)
        ),
        ...(game.stock.length > 0
          ? [{ key: "stock", face: null, ...geometry.stock, w: geometry.pileW, z: 10, ring: drawLive ? ACCENT : null, onTap: drawLive ? draw : undefined }]
          : []),
        ...pile,
        ...handSpecs(hand, {
          cx: geometry.handCenterX,
          maxWidth: geometry.handMaxWidth,
          bottom: geometry.handBottom,
          w: geometry.cardW,
          look: (card) => {
            const live = isPlayable(card);
            return { live, lifted: live && isLifted(card), dim: myTurn && !live };
          },
          onTap: (card) => {
            if (isPlayable(card)) tap(card, () => play(card));
          },
          spawn: geometry.stock
        })
      ],
      slots: game.stock.length === 0 && !canDraw(game) ? [{ key: "stock", ...geometry.stock, w: geometry.pileW }] : [],
      texts: [{ key: "count", text: `${game.stock.length}`, x: geometry.stock.x, y: geometry.countY, size: 13 }],
      onSwipeEnd: (key) => {
        const card = hand.find((each) => cardKey(each) === key);
        if (card && isPlayable(card)) lift(card);
      }
    };
  }

  const column = geometry?.stack.column;
  return (
    <div className="table table--canvas">
      <CardCanvas spec={spec} onSize={setSize} />
      {banner}
      {geometry &&
        order.map((seat, index) => (
          <SeatLabel
            key={seat}
            at={geometry.seats[index].label}
            maxWidth={geometry.seats[index].fanMaxWidth}
            name={names[seat] ?? seat}
            count={game.hands[seat]?.length ?? 0}
            active={game.phase === "play" && game.toAct === seat}
            badge={
              seat === game.dealer && (
                <span className="opponent__dealer" title="dealer">
                  D
                </span>
              )
            }
            detail={`${game.scores[seat]} pts`}
          />
        ))}
      {geometry && game.activeSuit && game.activeSuit !== topCard(game)!.suit && (
        <span
          className={`suit-badge suit-badge--${game.activeSuit}`}
          title={`${game.activeSuit} to follow`}
          style={{ left: geometry.discard.x + geometry.pileW / 2, top: geometry.discard.y - geometry.pileW * 0.72 }}
        >
          {SUIT_SYMBOL[game.activeSuit]}
        </span>
      )}
      <div
        ref={stackRef}
        className={`stack${column ? " stack--column" : ""}`}
        style={
          geometry
            ? {
                bottom: geometry.stack.bottom,
                ...(column ? { right: column.right, width: column.width, maxHeight: column.maxHeight } : {})
              }
            : { visibility: "hidden" }
        }
      >
        <ol className="feed">
          {snapshot.feed.map((entry) => (
            <li key={entry.id}>{entry.text}</li>
          ))}
        </ol>
        <div className="hud">
          <Nameplate active={myTurn}>{names[perspective] ?? "You"}</Nameplate>
          <span>{statusLine(game, perspective, names)}</span>
          {legal.includes("startHand") && (
            <button type="button" style={hudPrimaryButton} onClick={() => submit({ type: "startHand" })}>
              Deal next hand
            </button>
          )}
          {legal.includes("draw") && (
            <button type="button" style={hudButton} onClick={draw}>
              Draw
            </button>
          )}
          {legal.includes("pass") && (
            <button type="button" style={hudButton} onClick={() => submit({ type: "pass", seat: perspective })}>
              Pass
            </button>
          )}
        </div>
      </div>
      <HandButtons cards={hand} enabled={isPlayable} onActivate={play} />

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
