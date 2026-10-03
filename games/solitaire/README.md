# Solitaire

Klondike for one player, served at `game.peteshepley.com/solitaire/`. It has
no relay, lobby, or room; it's just the card kit and a pure engine.

## Rules as implemented

- **Deal:** seven columns of 1–7 cards, each with its top card face up. The
  other 24 cards form the stock.
- **Tableau:** columns build down in alternating colours. Any face-up run can
  move together, and only a King fills an empty column. Uncovering a face-down
  card turns it over.
- **Foundations:** build up by suit from the ace. A card can come back down
  from a foundation onto a column.
- **Stock:** draw 1 or draw 3, chosen per game. An empty stock turns the
  waste back over, with unlimited passes.

## How it's built

The game is a pure function of (seed, draw mode, move log), the same
invariant the multiplayer games use. Here it buys:

- **Undo:** replay the log minus the last move.
- **Saved games:** the seed, draw mode and log live in `localStorage`
  (`solitaire-game`), so a refresh resumes. If storage is unavailable, the
  game simply isn't kept.
- **Shareable deals:** `?seed=N&draw=1|3` plays a specific deal. The address
  bar always holds the current one, and **Deal #N** copies it.

To play, click a card (and everything on it) to pick it up, then click where
it goes. Double-click sends a card to its foundation, or to the first column
that takes it. **Auto-finish** appears once nothing is hidden.

- `src/engine/game.ts`: the reducer, plus `bestTarget`, `canAutoFinish` and
  `finishingMoves`. Property tests make random legal moves, checking all 52
  cards survive and replay is exact.
- `src/store.ts`: the move log, undo, and the save slot.
- `src/Table.tsx`, `src/index.css`: the top row and seven columns, sized so
  seven cards fit across a phone.

```sh
npm run dev --workspace=solitaire
npm test --workspace=solitaire
```
