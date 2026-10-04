import { useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { NO_BOTS, offlineTable } from "@card-games/card-kit/bots/seats.ts";
import type { BotSeats } from "@card-games/card-kit/bots/seats.ts";
import { useBots } from "@card-games/card-kit/bots/useBots.ts";
import { RelayApp } from "@card-games/card-kit/RelayApp.tsx";
import { decide } from "./bot.ts";
import { Table } from "./Table.tsx";
import { SPADES } from "./game.ts";
import { asContractTarget, createGameStore } from "./store.ts";
import type { Action, EngineState, Seat } from "./engine/game.ts";

// The default (no query param) is networked play over the shared relay: a
// lobby that fills four seats (partners sit across), then starts. Dev shortcut: ?solo is a
// single-tab hot seat for all four seats that follows whoever must act.
// (The two-tab loopback only seats two, so Spades has no ?seat mode.)
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
    dealer: "a",
    viewerSeat: "a",
    names: Object.fromEntries(seats.map((seat) => [seat, `Player ${seat.toUpperCase()}`]))
  });
  staticSubmit = (action) => store.apply(action);
}

// A hot update re-running this module would rebuild the store under a live
// relay connection; reload outright instead.
if (import.meta.hot) import.meta.hot.accept(() => window.location.reload());

// In the hot seat: whoever is to bid or play.
function actingSeat(game: EngineState | null): Seat {
  return game?.toAct ?? game?.dealer ?? "a";
}

function GameView({
  submit,
  follow,
  banner,
  bots = NO_BOTS
}: {
  submit: (action: Action) => void;
  follow: "acting" | "viewer";
  banner?: ReactNode;
  bots?: BotSeats;
}) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  useBots(snapshot.game, bots, decide, submit);
  const perspective = follow === "acting" ? actingSeat(snapshot.game) : (snapshot.viewerSeat ?? "a");
  return <Table snapshot={snapshot} perspective={perspective} submit={submit} banner={banner} />;
}

function NetworkedApp() {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  // Set once the player picks "Play the computer": no relay, this store.
  const [offline, setOffline] = useState<BotSeats | null>(null);
  if (offline) return <GameView submit={(action) => store.apply(action)} follow="viewer" bots={offline} />;
  return (
    <RelayApp
      game={SPADES}
      target={target}
      inGame={snapshot.game !== null}
      renderGame={(submit, banner, bots) => <GameView submit={submit} follow="viewer" banner={banner} bots={bots} />}
      onPlayComputer={(name, count) => {
        const table = offlineTable(name, count);
        store.start({ seed: table.seed, seats: table.seats, dealer: "a", viewerSeat: "a", names: table.names });
        setOffline(table.bots);
      }}
    />
  );
}

function App() {
  if (solo) return <GameView submit={staticSubmit!} follow="acting" />;
  return <NetworkedApp />;
}

export default App;
