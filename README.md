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
  Lobby, RelayApp        create / join / wait / reconnect UI over the relay
games/gin-rummy/     2 players: engine, Pixi table, HUD (see its DESIGN.md)
```

Every game keeps the same invariant: **state is a pure function of
(seed, ordered action log).** The relay stamps the order and never runs a
game's rules. Each client applies only stamped actions.

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
