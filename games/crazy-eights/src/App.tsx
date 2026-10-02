import { useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { createLoopbackTransport } from "@card-games/card-kit/net/loopback.ts";
import type { LoopbackTransport } from "@card-games/card-kit/net/loopback.ts";
import { RelayApp } from "@card-games/card-kit/RelayApp.tsx";
import { Table } from "./Table.tsx";
import { CRAZY_EIGHTS } from "./game.ts";
import { asContractTarget, createGameStore } from "./store.ts";
import type { Action, Seat } from "./engine/game.ts";

// The default (no query param) is networked play over the shared relay:
// a lobby that creates or joins a room for 2-6 players. Dev shortcuts:
// ?seat=a / ?seat=b are two tabs over the BroadcastChannel loopback, and
// ?solo=N is a single-tab hot seat for N players (default 3) that follows
// whoever is acting.
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
  const count = Math.min(6, Math.max(2, Number(params.get("solo")) || 3));
  const seats = ["a", "b", "c", "d", "e", "f"].slice(0, count);
  store.start({
    seed: Date.now() >>> 0,
    seats,
    dealer: "a",
    viewerSeat: "a",
    names: Object.fromEntries(seats.map((seat) => [seat, `Player ${seat.toUpperCase()}`]))
  });
  staticSubmit = (action) => store.apply(action);
} else if (mode === "creator" || mode === "joiner") {
  loopback = createLoopbackTransport({
    game: CRAZY_EIGHTS,
    role: mode,
    target,
    seed: Date.now() >>> 0
  });
  staticSubmit = (action) => loopback!.submit(action);
}

// A hot update re-running this module would open a second transport into
// the same room; reload outright instead.
if (import.meta.hot) {
  import.meta.hot.accept(() => window.location.reload());
  import.meta.hot.dispose(() => loopback?.destroy());
}

function GameView({
  submit,
  follow,
  banner
}: {
  submit: (action: Action) => void;
  follow: "acting" | "viewer";
  banner?: ReactNode;
}) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const game = snapshot.game;
  const perspective: Seat =
    follow === "acting"
      ? (game?.toAct ?? game?.dealer ?? "a")
      : (snapshot.viewerSeat ?? "a");
  return <Table snapshot={snapshot} perspective={perspective} submit={submit} banner={banner} />;
}

function NetworkedApp() {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return (
    <RelayApp
      game={CRAZY_EIGHTS}
      target={target}
      inGame={snapshot.game !== null}
      renderGame={(submit, banner) => <GameView submit={submit} follow="viewer" banner={banner} />}
    />
  );
}

function App() {
  if (mode === "relay") return <NetworkedApp />;
  return <GameView submit={staticSubmit!} follow={mode === "solo" ? "acting" : "viewer"} />;
}

export default App;
