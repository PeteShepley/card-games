# Crazy Eights

Crazy Eights for 2–6 players, served at `game.peteshepley.com/crazy-eights/`.
Built on the shared card kit and played over the shared game relay.

## Rules as implemented

- **Deal:** 7 cards each with two players, 5 each with three or more. Dealing
  starts left of the dealer. The next card starts the discard pile; an 8
  goes under the stock instead and the next card is turned. Play starts
  left of the dealer, and the deal passes left each hand.
- **Your turn:** play a card that matches the suit in force or the top
  card's rank. An 8 is wild, and you name the next suit. Or draw one card
  (allowed any time); your turn continues after drawing. An empty stock is
  rebuilt from the pile under the top card.
- **Passing:** only allowed when there is nothing left to draw. If every
  seat passes in a row, the hand is blocked and the lowest hand wins it (a
  tie means nobody does).
- **Scoring:** the winner scores the cards left in the other hands: 8 = 50,
  faces 10, aces 1, other cards their number. Scores carry across hands.

## Layout

- `src/engine/`: the pure rules engine (`game.ts`, `scoring.ts`). It has
  property tests (fast-check) for card conservation, replay determinism, and
  hands reaching an end.
- `src/store.ts`: the snapshot store, plus `asContractTarget` for the kit's
  transports.
- `src/layout.ts`: where every card goes (pure, tested): opponents in turn
  order across the top, the piles, your hand.
- `src/Table.tsx`, `src/index.css`: the kit's canvas table drawing that
  layout, with the HUD, suit picker and scores as DOM over it.
- `src/App.tsx`: networked play by default; `?seat=a|b` for the two-tab
  loopback; `?solo=N` for an N-player hot seat.

```sh
npm run dev --workspace=crazy-eights      # relay at ws://localhost:8787
npm test --workspace=crazy-eights
```
