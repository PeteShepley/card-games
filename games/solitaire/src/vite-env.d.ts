/// <reference types="vite/client" />

interface ImportMetaEnv {
  // The game relay's WebSocket URL, injected at build time (CI) and falling back to
  // the local dev harness. See packages/card-kit/src/net/relayTransport.ts.
  readonly VITE_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
