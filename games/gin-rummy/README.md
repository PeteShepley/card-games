# Gin Rummy

Two-player Gin Rummy on a PixiJS table. Served at
`game.peteshepley.com/gin-rummy/`. See [DESIGN.md](./DESIGN.md) for the
rules engine, the table, and the protocol reasoning.

- `src/engine/`: the pure rules engine (`game.ts`, `melds.ts`,
  `deadwood.ts`), with no React, Pixi or network imports.
- `src/store.ts`: the snapshot store. `asContractTarget` adapts it for the
  kit's transports.
- `src/layout.ts`: the table's geometry (pure, tested), shared by the canvas
  and the DOM overlay, including the grouped hand row.
- `src/TableCanvas.tsx`: turns the snapshot into card places for the kit's
  canvas table (the same engine as the other games), with drag-to-reorder.
- `Hud.tsx`, `Feed.tsx`, `status.ts`: the DOM overlay.
- `src/App.tsx`: picks a mode. The default is networked play through the kit's
  `RelayApp`; `?seat=a|b` uses the loopback and `?solo` the hot seat.

```sh
npm run dev --workspace=gin-rummy       # VITE_WS_URL defaults to ws://localhost:8787
npm test --workspace=gin-rummy
```
