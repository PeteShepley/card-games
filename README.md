# card-games

The card games on [game.peteshepley.com](https://game.peteshepley.com). There
is one npm workspace per game, all built on a shared card kit. Multiplayer
games play over the shared [game-relay](https://github.com/PeteShepley/game-relay).

```
packages/card-kit/   shared by every game
  cards, deck, prng      card identities, deck, seeded shuffle (mulberry32)
  assets/cards + cardAssets   the 52 card faces (see assets/cards/PROVENANCE.md)
  handOrder, fireworks, hudStyles
  net/                   relay + loopback transports, GameInfo / ContractTarget
  Lobby, RelayApp        create / join / wait / reconnect UI over the relay; play
                         the computer offline, or add computers to a room
  bots/                  the computer-player harness: which seats are bots, which
                         client runs them (first connected human), the move
                         scheduler + useBots hook, trick-taking helpers
  tricks                 follow suit, trick winner (optional trump), hand sorting
  canvas/                the Pixi card table every game draws on: the
                         engine (sprites ease to a spec; tap, drag, swipe-magnify),
                         CardCanvas, pure layouts (frame, hand, fans, four-seat
                         trick table) and the DOM over it (seat labels, hidden
                         hand buttons)
  table/                 table.css (felt, HUD, nameplates, overlays), labels,
                         seat positions, tap-to-lift
games/gin-rummy/     2 players: engine, canvas table, HUD (see its DESIGN.md)
games/crazy-eights/  2-6 players: engine, canvas table
games/hearts/        4 players: passing, no trump, game to 100
games/spades/        4 players in partnerships: bidding, spades trump, game to 500
games/solitaire/     1 player, Klondike: no relay; undo, saved games, ?seed= deals
```

Every game keeps the same invariant: **state is a pure function of
(seed, ordered action log).** The relay stamps the order and never runs a
game's rules. Each client applies only stamped actions.

## Computer players

Every multiplayer game has a computer opponent in `src/bot.ts`: a pure
`decide(state, seat)` that returns the move that seat would make now, or null.
Tests play whole games with bots in every seat. In the lobby you can play the
computer with no relay at all, or, as a room's creator, fill empty seats with
computer players. A bot's moves are ordinary actions. The first connected
human's client submits them, and if that player drops, the next one takes over.

Online bots need the relay's `addBot` / `removeBot` messages (game-relay
`bots` branch). Until card-kit pins a game-relay release that has them, they
are declared in `packages/card-kit/src/bots/seats.ts`.

## Development

```sh
npm install
npm test              # every workspace
npm run lint
npm run typecheck
npm run dev --workspace=gin-rummy
```

For networked play locally, run the relay from a `game-relay` checkout with
`npm run dev:local` (ws://localhost:8787). Then open the game in two browsers.
Gin also has dev shortcuts: `?seat=a` / `?seat=b` (two tabs over a
BroadcastChannel) and `?solo` (one-tab hot seat).

## Adding a game

1. Create `games/<id>/`. Copy gin's Vite/TS config, depend on
   `"@card-games/card-kit": "*"`, and import kit modules as
   `@card-games/card-kit/<file>.ts`.
2. Export a `GameInfo` (`id`, `title`, `minSeats`, `maxSeats`) and adapt your
   store to a `ContractTarget`: `start(contract, viewerSeat)` plus
   `apply(action)`. Render `<RelayApp>` for networked play.
3. Copy `.github/workflows/release-gin-rummy.yml` to `release-<id>.yml`.
   Change the workspace, the base path `/<id>/`, and the tag prefix `<id>-v0.<run>`.
4. In `operations`, copy `stacks/510-game-gin-rummy` to `5n0-game-<id>`
   (KVS key and deploy grant). Then add `"game/<id>"` with
   `"release_prefix": "<id>"` to `scripts/apps.json`.
5. Add the game to `peteshepley-com/src/data/games.json`.

## Releases and deploys

Each game has its own release stream (`gin-rummy-v0.<run>`), triggered when
its workspace or the kit changes. A release holds `dist-prod.tgz`,
`dist-stage.tgz` (built with that environment's relay URL) and
`manifest.json`. Deploy from `operations`:

```sh
scripts/deploy game gin-rummy stage gin-rummy-v0.<run>
```
