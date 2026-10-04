# Spades

Partnership Spades for four players, served at `game.peteshepley.com/spades/`.
Partners sit across from each other (the 1st and 3rd players to join
against the 2nd and 4th). Built on the shared card kit and played over the
shared game relay.

## Rules as implemented

- **Deal and bid:** 13 cards each. Bidding goes once around, starting left of
  the dealer. Each player bids 0–13 tricks, where 0 means nil. There's no
  blind nil. The same player leads the first trick, and the deal passes left
  each hand.
- **Play:** you must follow suit. Spades are always trump. Spades can't be
  led until one has been played, unless you hold nothing else.
- **Contracts:** a team's contract is its members' non-nil bids added
  together. Making it scores 10 per trick bid plus 1 per overtrick (bag).
  Missing it costs 10 per trick bid.
- **Nil:** worth +100 if the player takes no tricks, −100 if they take any.
  A failed nil's tricks count as bags but never help the partner's contract.
- **Bags:** every 10 accumulated bags costs 100.
- **Game end:** at 500, or when a team falls to −200; the higher score wins.
  Level scores play another hand.

## Layout

- `src/engine/game.ts`: the pure reducer, using the kit's `tricks.ts` with
  spades as trump. Property tests play whole random games, checking that
  every card is accounted for, every hand has 13 tricks, bags stay in range,
  and replay is deterministic.
- `src/store.ts`, `src/status.ts`: the snapshot store and the table's
  wording, including per-team hand summaries.
- `src/Table.tsx`, `src/index.css`: the kit's canvas four-seat table, plus
  the bid picker (over the empty trick), the Us/Them scoreboard, and partner
  and dealer tags.
- `src/App.tsx`: networked play by default; `?solo` is a four-seat hot seat.

As in Hearts, every client holds the whole deal and the UI hides the other
hands, so this is for friends, not money.

```sh
npm run dev --workspace=spades       # relay at ws://localhost:8787
npm test --workspace=spades
```
