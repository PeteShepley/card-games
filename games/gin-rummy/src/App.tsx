import { useState, useSyncExternalStore } from "react";
import type { CSSProperties } from "react";
import { TableCanvas } from "./TableCanvas.tsx";
import { asContractTarget, createGameStore } from "./store.ts";
import { GIN_RUMMY } from "./game.ts";
import { createLoopbackTransport } from "@card-games/card-kit/net/loopback.ts";
import type { LoopbackTransport } from "@card-games/card-kit/net/loopback.ts";
import { RelayApp } from "@card-games/card-kit/RelayApp.tsx";
import { Feed } from "./Feed.tsx";
import { Hud, Nameplate, WinBanner } from "./Hud.tsx";
import { hudButton, hudPrimaryButton } from "@card-games/card-kit/hudStyles.ts";
import { legalActions, otherSeat } from "./engine/game.ts";
import { ginDiscards } from "./engine/melds.ts";
import { cardKey, sameCard } from "@card-games/card-kit/cards.ts";
import type { TableMetrics } from "./layout.ts";
import type { Action, Seat } from "./engine/game.ts";
import type { Card } from "@card-games/card-kit/cards.ts";

// The default (no query param) is networked play: a lobby that creates or
// joins a room over the WebSocket relay. The dev shortcuts survive: ?seat=a
// is the loopback creating tab (sequencer shim), ?seat=b joins it over the
// BroadcastChannel, ?solo is the single-tab hotseat harness. In every
// networked mode the store only ever applies stamped actions.
const params = new URLSearchParams(window.location.search);
const mode: "solo" | "creator" | "joiner" | "relay" =
  params.get("seat") === "a"
    ? "creator"
    : params.get("seat") === "b"
      ? "joiner"
      : params.has("solo")
        ? "solo"
        : "relay";

const store = createGameStore();
const target = asContractTarget(store);
let loopback: LoopbackTransport<Action> | null = null;
let staticSubmit: ((action: Action) => void) | null = null;
if (mode === "solo") {
  // The hotseat follows whoever is acting, so both seats are "you" in turn;
  // neutral labels are the honest ones now that the nameplates always show.
  store.start({
    seed: Date.now() >>> 0,
    dealer: "a",
    viewerSeat: "a",
    names: { a: "Player A", b: "Player B" }
  });
  staticSubmit = (action) => store.apply(action);
} else if (mode === "creator" || mode === "joiner") {
  loopback = createLoopbackTransport({
    game: GIN_RUMMY,
    role: mode,
    target,
    seed: Date.now() >>> 0
  });
  staticSubmit = (action) => loopback!.submit(action);
}

// This top-level bootstrap re-runs on any hot update that reaches this
// module; a second live transport would corrupt the room. Dispose of the old
// one and reload outright.
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    window.location.reload();
  });
  import.meta.hot.dispose(() => {
    loopback?.destroy();
  });
}

// The table + overlay, shared by every mode. `follow` decides whose seat is
// rendered face-up: the hot seat follows the acting seat; networked modes fix
// the view to the viewer's own seat. Seat names come from the hand contract.
interface GameViewProps {
  submit: (action: Action) => void;
  follow: "acting" | "viewer";
  noGameText: string;
  banner?: React.ReactNode;
}

function GameView({ submit, follow, noGameText, banner }: GameViewProps) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  // Where the Pixi table put things. Pixi's resizeTo stays the single resize
  // owner; the scene reports its geometry so the DOM chrome can line up with
  // the piles and the card rows instead of guessing.
  const [metrics, setMetrics] = useState<TableMetrics | null>(null);
  const game = snapshot.game;
  const soloFallback: Seat =
    game?.result?.type === "gin" ? game.result.winner : (game?.dealer ?? "a");
  const seatToPlay: Seat =
    follow === "acting"
      ? (game?.toAct ?? soloFallback)
      : (snapshot.viewerSeat ?? "a");
  const legal = game ? legalActions(game, seatToPlay) : [];
  const selected = snapshot.selectedCard;

  const ginKeys: ReadonlySet<string> = new Set(
    game && game.phase === "discard" && game.toAct === seatToPlay
      ? ginDiscards(game.hands[seatToPlay]).map(cardKey)
      : []
  );
  const discardBlocked =
    selected && game?.takenFromDiscard
      ? sameCard(selected, game.takenFromDiscard)
      : false;

  const submitDiscard = (declareGin: boolean) => {
    if (selected)
      submit({ type: "discard", seat: seatToPlay, card: selected, declareGin });
  };

  const handlers = {
    onCardClick: (clicked: Card) => {
      const held =
        game?.hands[seatToPlay].some((own) => sameCard(own, clicked)) ?? false;
      if (!held) return;
      store.selectCard(
        selected && sameCard(clicked, selected) ? null : clicked
      );
    },
    onStockClick: () => {
      if (legal.includes("drawStock"))
        submit({ type: "drawStock", seat: seatToPlay });
    },
    // An undeclared discard of a gin card is a legitimate plain discard: no
    // explicit declaration, no gin (user ruling, per the rules).
    onDiscardPileClick: () => {
      if (legal.includes("takeUpcard"))
        submit({ type: "takeUpcard", seat: seatToPlay });
      else if (legal.includes("drawDiscard"))
        submit({ type: "drawDiscard", seat: seatToPlay });
      else if (legal.includes("discard") && selected && !discardBlocked)
        submitDiscard(false);
    },
    // A finished drag. This is presentation state only: it never becomes an
    // action, so the two clients may hold the same hand in different orders.
    onHandReorder: (keys: readonly string[]) =>
      store.setHandOrder(seatToPlay, keys),
    onMetrics: setMetrics
  };

  const opponent = otherSeat(seatToPlay);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <TableCanvas
        snapshot={snapshot}
        perspective={seatToPlay}
        ginKeys={ginKeys}
        handlers={handlers}
      />
      <Feed entries={snapshot.feed} metrics={metrics} />
      {game && (
        <Nameplate
          name={snapshot.names[opponent]}
          active={game.toAct === opponent}
          style={{
            top: metrics
              ? `${metrics.opponentY + metrics.cardH / 2 + 8}px`
              : "9rem"
          }}
        />
      )}
      {game?.result && (
        <WinBanner
          result={game.result}
          names={snapshot.names}
          perspective={seatToPlay}
          metrics={metrics}
        />
      )}
      {banner}
      <Hud
        game={game}
        names={snapshot.names}
        perspective={seatToPlay}
        metrics={metrics}
        noGameText={noGameText}
      >
        {legal.includes("startHand") && (
          <button
            type="button"
            style={hudPrimaryButton}
            onClick={() => submit({ type: "startHand" })}
          >
            Deal
          </button>
        )}
        {legal.includes("takeUpcard") && (
          <button
            type="button"
            style={hudButton}
            onClick={() => submit({ type: "takeUpcard", seat: seatToPlay })}
          >
            Take upcard
          </button>
        )}
        {legal.includes("passUpcard") && (
          <button
            type="button"
            style={hudButton}
            onClick={() => submit({ type: "passUpcard", seat: seatToPlay })}
          >
            Pass
          </button>
        )}
        {legal.includes("discard") && selected && !discardBlocked && (
          <button
            type="button"
            style={hudButton}
            onClick={() => submitDiscard(false)}
          >
            Discard selected
          </button>
        )}
        {selected && ginKeys.has(cardKey(selected)) && (
          <button
            type="button"
            style={hudPrimaryButton}
            onClick={() => submitDiscard(true)}
          >
            Declare gin!
          </button>
        )}
        {/* Auto-sort and dragging cannot both own the layout, so this is a
            one-shot: it re-groups the hand and any later drag takes it back. */}
        {game &&
          game.phase !== "handOver" &&
          game.phase !== "awaitingStart" && (
            <button
              type="button"
              style={hudButton}
              onClick={() => store.autoSort(seatToPlay)}
              title="arrange the hand into melds — drag a card to take over"
            >
              Auto-sort
            </button>
          )}
        {legal.includes("discard") && selected && discardBlocked && (
          <span style={hint}>
            the card you just took cannot go straight back
          </span>
        )}
        {ginKeys.size > 0 && !(selected && ginKeys.has(cardKey(selected))) && (
          <span style={hint}>gin available — select a gold card</span>
        )}
      </Hud>
    </div>
  );
}

// Networked play over the shared game relay: the kit owns the lobby and
// the connection; the table renders once the contract lands in the store.
function NetworkedApp() {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return (
    <RelayApp
      game={GIN_RUMMY}
      target={target}
      inGame={snapshot.game !== null}
      renderGame={(submit, banner) => (
        <GameView
          submit={submit}
          follow="viewer"
          noGameText="connecting…"
          banner={banner}
        />
      )}
    />
  );
}

function App() {
  if (mode === "relay") return <NetworkedApp />;
  if (mode === "solo") {
    return (
      <GameView submit={staticSubmit!} follow="acting" noGameText="no game" />
    );
  }
  // Loopback creator/joiner: fixed to one seat over the BroadcastChannel.
  return (
    <GameView
      submit={staticSubmit!}
      follow="viewer"
      noGameText={
        mode === "joiner"
          ? "waiting for the creating tab (open ?seat=a)"
          : "no game"
      }
    />
  );
}

const hint: CSSProperties = { opacity: 0.7, alignSelf: "center" };

export default App;
