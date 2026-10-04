# Hearts

Four-player Hearts, served at `game.peteshepley.com/hearts/`. Built on the
shared card kit and played over the shared game relay. A room starts as soon
as the fourth player joins.

## Rules as implemented

- **Deal and pass:** 13 cards each. Before each hand everyone passes three
  cards, all at once, in the order left, right, across, then no pass.
- **Leading:** whoever holds the 2♣ leads it to the first trick. Hearts can't
  be led until one has been played, unless that's all you hold.
- **Following:** you must follow suit if you can. The highest card of the suit
  led takes the trick, and the winner leads the next. On the first trick,
  nobody may play a heart or the Q♠ unless they have nothing else.
- **Scoring:** each heart is 1 point and the Q♠ is 13. Taking all 26 shoots
  the moon: 0 for you, 26 for everyone else. When anyone reaches 100, the
  lowest total wins.

## Layout

- `src/engine/`:
  - `game.ts`: the pure reducer. Property tests play whole random legal
    games to 100, checking the deck is conserved, every hand totals 26, and
    replay is deterministic.
  - Trick-taking primitives (follow suit, trick winner) come from the kit's
    `tricks.ts`, which Spades shares.
- `src/store.ts`, `src/status.ts`: the snapshot store and the table's
  wording. A pass is announced, never shown.
- `src/Table.tsx`, `src/index.css`: the kit's canvas four-seat table (the
  next player sits on your left), plus the three-card pass picker; passed
  cards fly to their receiver.
- `src/App.tsx`: networked play by default; `?solo` is a four-seat hot seat.

Every client holds the full deal (that's what lets state replay from the
seed), so hidden cards are hidden by the UI, not by the server. That's fine
among friends, but it isn't cheat-proof.

```sh
npm run dev --workspace=hearts       # relay at ws://localhost:8787
npm test --workspace=hearts
```
