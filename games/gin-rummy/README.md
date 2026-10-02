# Gin Rummy

Two-player Gin Rummy on a PixiJS table. Served at
`game.peteshepley.com/gin-rummy/`. See [DESIGN.md](./DESIGN.md) for the
rules engine, the table, and the protocol reasoning.

- `src/engine/`: the pure rules engine (`game.ts`, `melds.ts`,
  `deadwood.ts`), with no React, Pixi or network imports.
- `src/store.ts`: the snapshot store. `asContractTarget` adapts it for the
  kit's transports.
- `src/scene.ts`, `TableCanvas.tsx`, `Hud.tsx`, `Feed.tsx`, `status.ts`: the
  table and its overlay.
- `src/App.tsx`: picks a mode. The default is networked play through the kit's
  `RelayApp`; `?seat=a|b` uses the loopback and `?solo` the hot seat.

```sh
npm run dev --workspace=gin-rummy       # VITE_WS_URL defaults to ws://localhost:8787
npm test --workspace=gin-rummy
```
