import { describe, expect, test } from "vitest";
import { createGameStore } from "./store.ts";
import type { SavedGame, SaveSlot } from "./store.ts";
import { initialState } from "./engine/game.ts";

function memorySlot(initial: SavedGame | null = null): SaveSlot & { saved: SavedGame | null } {
  const slot = {
    saved: initial,
    load: () => slot.saved,
    save: (game: SavedGame) => {
      slot.saved = game;
    }
  };
  return slot;
}

describe("store", () => {
  test("applies legal moves, refuses illegal ones, and undoes back to the deal", () => {
    const store = createGameStore({ seed: 42, drawCount: 1 });
    expect(store.apply({ type: "draw" })).toBe(true);
    expect(store.apply({ type: "draw" })).toBe(true);
    const top = store.getSnapshot().game.tableau[0].up[0];
    expect(store.apply({ type: "move", card: top, to: { kind: "tableau", column: 0 } })).toBe(false);
    expect(store.getSnapshot().log).toHaveLength(2);

    store.undo();
    store.undo();
    store.undo(); // nothing left: a no-op
    expect(store.getSnapshot().game).toEqual(initialState(42, 1));
  });

  test("every change is saved, and a saved game resumes", () => {
    const slot = memorySlot();
    const store = createGameStore({ seed: 42, drawCount: 3, slot });
    store.apply({ type: "draw" });
    expect(slot.saved).toEqual({ seed: 42, drawCount: 3, log: [{ type: "draw" }] });

    const resumed = createGameStore({ seed: 999, drawCount: 1, slot });
    expect(resumed.getSnapshot().game).toEqual(store.getSnapshot().game);
  });

  test("a save that no longer replays is ignored", () => {
    const slot = memorySlot({ seed: 42, drawCount: 1, log: [{ type: "move", card: { rank: "K", suit: "clubs" }, to: { kind: "foundation" } }] });
    const store = createGameStore({ seed: 7, drawCount: 1, slot });
    expect(store.getSnapshot().game).toEqual(initialState(7, 1));
  });

  test("newGame starts over with a fresh deal", () => {
    const store = createGameStore({ seed: 42, drawCount: 1 });
    store.apply({ type: "draw" });
    store.newGame(43, 3);
    expect(store.getSnapshot()).toEqual({ game: initialState(43, 3), log: [] });
  });
});
