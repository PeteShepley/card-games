import { useEffect, useMemo, useState } from "react";
import { cardKey, sameCard } from "@card-games/card-kit/cards.ts";
import type { Card } from "@card-games/card-kit/cards.ts";
import { CardCanvas } from "@card-games/card-kit/canvas/CardCanvas.tsx";
import type { CanvasSize } from "@card-games/card-kit/canvas/CardCanvas.tsx";
import { ACCENT } from "@card-games/card-kit/canvas/spec.ts";
import type { CardSpec, Point, SceneSpec } from "@card-games/card-kit/canvas/spec.ts";
import { moveKey, orderHand } from "@card-games/card-kit/handOrder.ts";
import { otherSeat } from "./engine/game.ts";
import type { Seat } from "./engine/game.ts";
import { bestArrangement } from "./engine/melds.ts";
import type { Arrangement } from "./engine/melds.ts";
import { groupedXs, tableMetrics } from "./layout.ts";
import type { TableMetrics } from "./layout.ts";
import type { GameSnapshot } from "./store.ts";

const DEADWOOD_TINT = 0xbdbdbd;
const GIN_TINT = 0xffd54a;

export interface TableHandlers {
  onCardClick(card: Card): void;
  onStockClick(): void;
  onDiscardPileClick(): void;
  // A finished drag: the viewer's hand, in the order they arranged it.
  onHandReorder(keys: readonly string[]): void;
  // Where the table put things, so the DOM overlay can line up with it
  // without duplicating the geometry. Fires when the size changes.
  onMetrics(metrics: TableMetrics): void;
}

interface TableCanvasProps {
  snapshot: GameSnapshot;
  // The seat rendered face-up at the bottom of the table. The hotseat
  // harness passes the acting seat; the loopback passes the tab's fixed
  // viewer seat.
  perspective: Seat;
  // Which cards go gin right now, computed once by the shell so the
  // gold tint and the declare button can never disagree.
  ginKeys: ReadonlySet<string>;
  handlers: TableHandlers;
}

// The table on the kit's canvas (CardCanvas): this turns the store's
// snapshot into where every card goes - laid out by layout.ts - and the
// kit's engine slides, flips and fades the sprites there. The opponent's
// row, the stock and discard, your hand in its groups; at the lay-down,
// both hands face up by their best arrangement, deadwood greyed.
//
// Dragging a hand card reorders the hand: while it is held the order lives
// here (the neighbours slide aside as it passes), and only the finished
// arrangement goes to the store.
export function TableCanvas({ snapshot, perspective, ginKeys, handlers }: TableCanvasProps) {
  const [size, setSize] = useState<CanvasSize | null>(null);
  const [dragOrder, setDragOrder] = useState<readonly string[] | null>(null);
  const game = snapshot.game;
  const metrics = useMemo(() => (size ? tableMetrics(size.width, size.height) : null), [size]);

  useEffect(() => {
    if (metrics) handlers.onMetrics(metrics);
    // Only a new size makes new metrics; the handler object is rebuilt
    // every render.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [metrics]);

  // The meld search runs once per snapshot, not per frame or per resize.
  const groups = useMemo(() => {
    if (!game) return null;
    if (game.phase === "handOver") {
      return {
        reveal: { top: bestArrangement(game.hands[otherSeat(perspective)]), bottom: bestArrangement(game.hands[perspective]) }
      };
    }
    if (snapshot.autoGroup) {
      const arrangement = bestArrangement(game.hands[perspective]);
      return { hand: [...arrangement.melds, arrangement.deadwood] };
    }
    return { hand: [orderHand(game.hands[perspective], snapshot.handOrder[perspective])] };
  }, [game, perspective, snapshot.autoGroup, snapshot.handOrder]);

  let spec: SceneSpec | null = null;
  if (game && metrics && size && groups) {
    const { cardW } = metrics;
    const cards: CardSpec[] = [];

    if (groups.reveal) {
      // The lay-down: a finished hand is proof, so both hands show face up.
      // Your own cards keep their keys and slide into the arrangement.
      const show = (arrangement: Arrangement, y: number) => {
        const deadwood = new Set(arrangement.deadwood.map(cardKey));
        groupedXs([...arrangement.melds, arrangement.deadwood], metrics).forEach((placed, index) =>
          cards.push({
            key: cardKey(placed.held),
            face: placed.held,
            x: placed.x,
            y,
            w: cardW,
            z: 100 + index,
            tint: deadwood.has(cardKey(placed.held)) ? DEADWOOD_TINT : undefined
          })
        );
      };
      show(groups.reveal.top, metrics.opponentY);
      show(groups.reveal.bottom, metrics.handY);
      spec = { cards };
    } else {
      const stock = metrics.stock;
      const opponentRow: Point = { x: metrics.playX, y: metrics.opponentY };

      // The opponent's hand is a row of backs, keyed by position: the
      // viewer never learns which cards they are.
      groupedXs([game.hands[otherSeat(perspective)]], metrics).forEach((placed, index) =>
        cards.push({ key: `opp:${index}`, face: null, x: placed.x, y: metrics.opponentY, w: cardW, z: index, spawn: stock })
      );

      if (game.stock.length > 0) {
        cards.push({ key: "stock", face: null, ...stock, w: cardW, z: 10, onTap: handlers.onStockClick });
      }

      // The top two discards, keyed by card: a card thrown from your hand
      // is the same sprite and slides there; the opponent's flies in from
      // their row; and a new discard lands on the one before it.
      game.discardPile.slice(-2).forEach((card, index, shown) => {
        const top = index === shown.length - 1;
        cards.push({
          key: cardKey(card),
          face: card,
          ...metrics.discard,
          w: cardW,
          z: 20 + index,
          spawn: top ? opponentRow : stock,
          onTap: top ? handlers.onDiscardPileClick : undefined
        });
      });

      // Your hand: the dragged order while a drag is live, else its groups.
      const hand = game.hands[perspective];
      const handGroups = dragOrder ? [orderHand(hand, dragOrder)] : groups.hand!;
      const shownKeys = handGroups.flat().map(cardKey);
      const drawn =
        snapshot.lastDrawn && snapshot.lastDrawn.seat === perspective ? cardKey(snapshot.lastDrawn.card) : null;

      // Drop the held card into whichever slot the pointer is nearest, so
      // the neighbours close up and slide aside.
      const dragTo = (key: string, at: Point) => {
        const order = dragOrder ?? shownKeys;
        const xs = groupedXs([orderHand(hand, order)], metrics);
        let nearest = 0;
        xs.forEach((placed, index) => {
          if (Math.abs(placed.x - at.x) < Math.abs(xs[nearest].x - at.x)) nearest = index;
        });
        const from = order.indexOf(key);
        if (from < 0) return;
        const next = nearest === from ? order : moveKey(order, from, nearest);
        if (next !== order || !dragOrder) setDragOrder(next);
      };

      groupedXs(handGroups, metrics).forEach((placed, index) => {
        const held = placed.held;
        const key = cardKey(held);
        const selected = !!snapshot.selectedCard && sameCard(held, snapshot.selectedCard);
        cards.push({
          key,
          face: held,
          x: placed.x,
          y: metrics.handY - (selected ? metrics.raise : 0),
          w: cardW,
          z: 100 + index,
          tint: ginKeys.has(key) ? GIN_TINT : undefined,
          // The card just drawn is framed until the next one.
          ring: key === drawn ? ACCENT : null,
          spawn: stock,
          onTap: () => handlers.onCardClick(held),
          drag: {
            carry: [key],
            onMove: (at) => dragTo(key, at),
            onDrop: () => {
              if (dragOrder) handlers.onHandReorder(dragOrder);
              setDragOrder(null);
            }
          }
        });
      });

      spec = {
        cards,
        slots: game.discardPile.length === 0 ? [{ key: "discard", ...metrics.discard, w: cardW, onTap: handlers.onDiscardPileClick }] : [],
        // The count sits on the stock itself: below it, it would run into
        // the HUD, which starts just under the piles.
        texts:
          game.stock.length > 0
            ? [{ key: "count", text: `${game.stock.length}`, x: stock.x, y: stock.y, size: 22 * metrics.scale }]
            : []
      };
    }
  }

  // Celebrate once per hand, and only the viewer's own gin.
  const won = game?.phase === "handOver" && game.result?.type === "gin" && game.result.winner === perspective;

  return (
    <div style={{ position: "absolute", inset: 0, background: "#1d5c2e" }}>
      <CardCanvas spec={spec} onSize={setSize} celebrate={won ? `gin:${game!.prngState}` : null} />
    </div>
  );
}
