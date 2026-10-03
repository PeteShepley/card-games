import { advance, initialState } from "./engine/game.ts";
import type { Action, DrawCount, EngineState } from "./engine/game.ts";

// The single-player store. The game is (seed, draw mode, move log) — the
// state is always rebuilt from those — so undo drops the last move and a
// saved game is just the three of them in localStorage.

export interface GameSnapshot {
  readonly game: EngineState;
  readonly log: readonly Action[];
}

export interface GameStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): GameSnapshot;
  apply(action: Action): boolean;
  undo(): void;
  newGame(seed: number, drawCount: DrawCount): void;
}

export interface SavedGame {
  readonly seed: number;
  readonly drawCount: DrawCount;
  readonly log: readonly Action[];
}

export interface SaveSlot {
  load(): SavedGame | null;
  save(game: SavedGame): void;
}

const replay = (seed: number, drawCount: DrawCount, log: readonly Action[]): EngineState | null => {
  let state = initialState(seed, drawCount);
  for (const action of log) {
    const result = advance(state, action);
    if (!result.ok) return null;
    state = result.state;
  }
  return state;
};

export function createGameStore(options: { seed: number; drawCount: DrawCount; slot?: SaveSlot }): GameStore {
  const { slot } = options;
  // Resume a saved game when there is one that still replays cleanly.
  const saved = slot?.load();
  const resumed = saved ? replay(saved.seed, saved.drawCount, saved.log) : null;
  let snapshot: GameSnapshot =
    saved && resumed
      ? { game: resumed, log: saved.log }
      : { game: initialState(options.seed, options.drawCount), log: [] };
  const listeners = new Set<() => void>();

  const replace = (next: GameSnapshot) => {
    snapshot = next;
    slot?.save({ seed: next.game.seed, drawCount: next.game.drawCount, log: next.log });
    for (const listener of listeners) listener();
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot() {
      return snapshot;
    },
    apply(action) {
      const result = advance(snapshot.game, action);
      if (!result.ok) return false;
      replace({ game: result.state, log: [...snapshot.log, action] });
      return true;
    },
    undo() {
      if (snapshot.log.length === 0) return;
      const log = snapshot.log.slice(0, -1);
      replace({ game: replay(snapshot.game.seed, snapshot.game.drawCount, log)!, log });
    },
    newGame(seed, drawCount) {
      replace({ game: initialState(seed, drawCount), log: [] });
    }
  };
}

// localStorage, guarded: a private window or blocked storage just means
// the game isn't kept across a refresh.
export function localSlot(key: string): SaveSlot {
  return {
    load() {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as SavedGame;
        return Number.isInteger(parsed.seed) && (parsed.drawCount === 1 || parsed.drawCount === 3) && Array.isArray(parsed.log)
          ? parsed
          : null;
      } catch {
        return null;
      }
    },
    save(game) {
      try {
        localStorage.setItem(key, JSON.stringify(game));
      } catch {
        // ignore
      }
    }
  };
}
