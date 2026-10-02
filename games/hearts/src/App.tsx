import { useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { RelayApp } from "@card-games/card-kit/RelayApp.tsx";
import { Table } from "./Table.tsx";
import { HEARTS } from "./game.ts";
import { asContractTarget, createGameStore } from "./store.ts";
import type { Action, EngineState, Seat } from "./engine/game.ts";

// The default (no query param) is networked play over the shared relay: a
// lobby that fills four seats, then starts. Dev shortcut: ?solo is a
// single-tab hot seat for all four seats that follows whoever must act.
// (The two-tab loopback only seats two, so Hearts has no ?seat mode.)
const params = new URLSearchParams(window.location.search);
const solo = params.has("solo");

const store = createGameStore();
const target = asContractTarget(store);
let staticSubmit: ((action: Action) => void) | null = null;

if (solo) {
  const seats = ["a", "b", "c", "d"];
  store.start({
    seed: Date.now() >>> 0,
    seats,
    viewerSeat: "a",
    names: Object.fromEntries(seats.map((seat) => [seat, `Player ${seat.toUpperCase()}`]))
  });
  staticSubmit = (action) => store.apply(action);
}

// A hot update re-running this module would rebuild the store under a live
// relay connection; reload outright instead.
if (import.meta.hot) import.meta.hot.accept(() => window.location.reload());

// In the hot seat: during passing, the first seat still to choose; in
// play, whoever is to act.
function actingSeat(game: EngineState | null): Seat {
  if (!game) return "a";
  if (game.phase === "passing") return game.seats.find((seat) => game.passed[seat] === null) ?? "a";
  return game.toAct ?? "a";
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
  const perspective = follow === "acting" ? actingSeat(snapshot.game) : (snapshot.viewerSeat ?? "a");
  return <Table snapshot={snapshot} perspective={perspective} submit={submit} banner={banner} />;
}

function NetworkedApp() {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return (
    <RelayApp
      game={HEARTS}
      target={target}
      inGame={snapshot.game !== null}
      renderGame={(submit, banner) => <GameView submit={submit} follow="viewer" banner={banner} />}
    />
  );
}

function App() {
  if (solo) return <GameView submit={staticSubmit!} follow="acting" />;
  return <NetworkedApp />;
}

export default App;
