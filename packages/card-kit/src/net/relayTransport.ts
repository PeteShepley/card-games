import type {
  Action,
  Contract,
  ErrorReason,
  Roster,
  SeatId,
  Stamped,
  WireMessage
} from "@peteshepley/game-relay/protocol";
import { contractOf } from "./types.ts";
import type { ContractTarget, GameInfo } from "./types.ts";

// The production transport: a WebSocket to the shared game relay, which is
// the sequencer. Compared with the loopback this is *simpler* — the client
// never stamps. It submits actions and applies only the server's stamped
// echoes, in order, deduplicating by seq and asking for a resync on a gap
// (the same `inbox`/`applyContract` discipline the loopback uses). On top of
// the game relay it drives the lobby handshake (create / join / reconnect /
// begin), keeps the socket alive, and reports progress through `onEvent`.

// Where lobby progress and connection state are reported to the UI.
export type LobbyEvent =
  | { type: "connection"; status: "connecting" | "open" | "closed" }
  // We hold a seat in a room that hasn't started; `creator` may begin it.
  | { type: "seated"; code: string; seat: SeatId; creator: boolean }
  | { type: "roster"; roster: Roster }
  | { type: "started" } // the hand contract has been applied; play begins
  | { type: "error"; reason: ErrorReason };

export interface RelayTransport<A extends Action> {
  create(name: string): void;
  join(code: string, name: string): void;
  reconnect(session: Session): void;
  begin(): void;
  // The creator fills an empty seat with a computer player, or takes one out.
  addBot(name: string): void;
  removeBot(seat: SeatId): void;
  submit(action: A): void;
  destroy(): void;
}

// The reconnection credentials, kept in sessionStorage so a refresh silently
// rejoins the same seat. Cleared when the room is gone or the token is stale.
export interface Session {
  readonly code: string;
  readonly token: string;
  readonly seat: SeatId;
}

const sessionKey = (game: GameInfo) => `${game.id}-session`;

export function loadSession(game: GameInfo): Session | null {
  try {
    const raw = sessionStorage.getItem(sessionKey(game));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    return parsed.code && parsed.token && typeof parsed.seat === "string"
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function saveSession(game: GameInfo, session: Session): void {
  try {
    sessionStorage.setItem(sessionKey(game), JSON.stringify(session));
  } catch {
    // A private-mode storage failure just means no auto-reconnect; play on.
  }
}

export function clearSession(game: GameInfo): void {
  try {
    sessionStorage.removeItem(sessionKey(game));
  } catch {
    // ignore
  }
}

export function defaultRelayUrl(): string {
  return import.meta.env.VITE_WS_URL ?? "ws://localhost:8787";
}

// API Gateway drops a WebSocket after ~10 idle minutes; a mid-game player
// thinking about a discard is not idle, so ping well inside that.
export const PING_INTERVAL_MS = 5 * 60 * 1000;

const randomUint32 = () => Math.floor(Math.random() * 0x100000000) >>> 0;

export function createRelayTransport<A extends Action>(options: {
  game: GameInfo;
  target: ContractTarget<A>;
  onEvent: (event: LobbyEvent) => void;
  url?: string;
}): RelayTransport<A> {
  const { game, target, onEvent } = options;
  const socket = new WebSocket(options.url ?? defaultRelayUrl());

  let mySeat: SeatId | null = null;
  let expectedSeq = 1;
  let contractApplied = false;
  let pinger: ReturnType<typeof setInterval> | null = null;
  const outbox: WireMessage[] = [];

  const send = (message: WireMessage) => {
    if (socket.readyState === WebSocket.OPEN)
      socket.send(JSON.stringify(message));
    else outbox.push(message);
  };

  const stopPinging = () => {
    if (pinger !== null) clearInterval(pinger);
    pinger = null;
  };

  const applyContract = (contract: Contract) => {
    target.start(contractOf(contract), mySeat ?? contract.seats[0].id);
    expectedSeq = 1;
    contractApplied = true;
    onEvent({ type: "started" });
  };

  const inbox = (stamped: Stamped) => {
    // A stamp outrunning the bootstrap is a gap by another name: ask for the
    // full picture rather than applying into a store with no game.
    if (!contractApplied) {
      send({ kind: "resyncRequest" });
      return;
    }
    if (stamped.seq < expectedSeq) return; // an echo we already applied
    if (stamped.seq > expectedSeq) {
      send({ kind: "resyncRequest" });
      return;
    }
    target.apply(stamped.action as A);
    expectedSeq = stamped.seq + 1;
  };

  const seated = (code: string, token: string, seat: SeatId, creator: boolean) => {
    mySeat = seat;
    saveSession(game, { code, token, seat });
    onEvent({ type: "seated", code, seat, creator });
  };

  const onMessage = (event: MessageEvent) => {
    let message: WireMessage;
    try {
      message = JSON.parse(event.data as string) as WireMessage;
    } catch {
      return;
    }
    switch (message.kind) {
      case "created":
        seated(message.code, message.token, message.seat, true);
        break;
      case "joined":
        seated(message.code, message.token, message.seat, false);
        break;
      case "roster":
        onEvent({ type: "roster", roster: message });
        break;
      case "start":
        applyContract(message);
        break;
      case "action":
        inbox({ seq: message.seq, action: message.action });
        break;
      case "resync":
        applyContract(message);
        for (const stamped of message.log) inbox(stamped);
        break;
      case "error":
        if (message.reason === "badToken" || message.reason === "badCode")
          clearSession(game);
        onEvent({ type: "error", reason: message.reason });
        break;
    }
  };

  socket.addEventListener("message", onMessage);
  socket.addEventListener("open", () => {
    onEvent({ type: "connection", status: "open" });
    for (const message of outbox.splice(0))
      socket.send(JSON.stringify(message));
    stopPinging();
    pinger = setInterval(() => send({ kind: "ping" }), PING_INTERVAL_MS);
  });
  socket.addEventListener("close", () => {
    stopPinging();
    onEvent({ type: "connection", status: "closed" });
  });
  onEvent({ type: "connection", status: "connecting" });

  return {
    create(name) {
      send({
        kind: "create",
        game: game.id,
        name,
        rnd: randomUint32(),
        minSeats: game.minSeats,
        maxSeats: game.maxSeats
      });
    },
    join(code, name) {
      send({ kind: "join", code, game: game.id, name, rnd: randomUint32() });
    },
    reconnect(session) {
      mySeat = session.seat;
      send({ kind: "reconnect", code: session.code, token: session.token });
    },
    begin() {
      send({ kind: "begin" });
    },
    addBot(name) {
      send({ kind: "addBot", name, rnd: randomUint32() });
    },
    removeBot(seat) {
      send({ kind: "removeBot", seat });
    },
    submit(action) {
      // Clients never apply their own actions: the server stamps and echoes.
      send({ kind: "submit", action });
    },
    destroy() {
      stopPinging();
      socket.removeEventListener("message", onMessage);
      socket.close();
    }
  };
}
