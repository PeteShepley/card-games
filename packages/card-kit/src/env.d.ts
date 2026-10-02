/// <reference types="vite/client" />

interface ImportMetaEnv {
  // The game relay's WebSocket URL, injected at build time by each game's
  // release workflow; unset in dev, where it falls back to the local relay.
  readonly VITE_WS_URL?: string;
}
