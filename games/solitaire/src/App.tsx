import { useSyncExternalStore } from "react";
import { Table } from "./Table.tsx";
import { createGameStore, localSlot } from "./store.ts";
import type { DrawCount } from "./engine/game.ts";

// Single player: no relay, no lobby. The deal comes from ?seed=N&draw=1|3
// when given (a shared link), otherwise the saved game resumes, otherwise a
// fresh random deal. The address bar always holds the current deal's link.

const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];

const params = new URLSearchParams(window.location.search);
const linkedSeed = params.has("seed") ? Number(params.get("seed")) >>> 0 : null;
const linkedDraw: DrawCount = params.get("draw") === "3" ? 3 : 1;

const store = createGameStore({
  seed: linkedSeed ?? randomSeed(),
  drawCount: linkedDraw,
  slot: localSlot("solitaire-game")
});
// A shared link beats the saved game when they're different deals.
const resumed = store.getSnapshot().game;
if (
  linkedSeed !== null &&
  (resumed.seed !== linkedSeed || resumed.drawCount !== linkedDraw)
) {
  store.newGame(linkedSeed, linkedDraw);
}

const linkFor = (seed: number, draw: DrawCount) => {
  const url = new URL(window.location.href);
  url.search = `?seed=${seed}&draw=${draw}`;
  return url.toString();
};

const syncAddressBar = () => {
  const { game } = store.getSnapshot();
  window.history.replaceState(null, "", linkFor(game.seed, game.drawCount));
};
syncAddressBar();

if (import.meta.hot) import.meta.hot.accept(() => window.location.reload());

function App() {
  const { game, log } = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot
  );
  return (
    <Table
      game={game}
      canUndo={log.length > 0}
      apply={store.apply}
      undo={store.undo}
      newGame={(drawCount) => {
        store.newGame(randomSeed(), drawCount);
        syncAddressBar();
      }}
      shareUrl={linkFor(game.seed, game.drawCount)}
    />
  );
}

export default App;
