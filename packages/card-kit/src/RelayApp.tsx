import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { Action, Roster, SeatId } from "@peteshepley/game-relay/protocol";
import { botSeatsFor, computerName } from "./bots/seats.ts";
import type { BotRosterSeat, BotSeats } from "./bots/seats.ts";
import { Lobby } from "./Lobby.tsx";
import type { LobbyUiState } from "./Lobby.tsx";
import { hudButton } from "./hudStyles.ts";
import { createRelayTransport, loadSession } from "./net/relayTransport.ts";
import type { LobbyEvent, RelayTransport } from "./net/relayTransport.ts";
import type { ContractTarget, GameInfo } from "./net/types.ts";

// How many times a dropped socket retries before it gives up and asks the
// player to do something about it.
const MAX_RETRIES = 4;

interface RelayAppProps<A extends Action> {
  game: GameInfo;
  target: ContractTarget<A>;
  // True once the game's store holds a game, i.e. the contract has landed.
  inGame: boolean;
  // The game's table. `banner` is the connection-trouble overlay to show;
  // `bots` says which seats are computer players and whether this client
  // plays them.
  renderGame: (submit: (action: A) => void, banner: ReactNode, bots: BotSeats) => ReactNode;
  // Offered in the lobby: play against the computer with no relay at all.
  // The game starts its own store with you and `seats - 1` computers.
  onPlayComputer?: (name: string, seats: number) => void;
}

// Networked play: owns the relay transport and the lobby state machine. The
// transport is created on a Create/Join click (or an auto-reconnect on load),
// never in a render, so React StrictMode's double effects can't open two
// sockets. Once the hand contract arrives the game's store has a game and
// the table takes over from the lobby.
export function RelayApp<A extends Action>({
  game,
  target,
  inGame,
  renderGame,
  onPlayComputer
}: RelayAppProps<A>) {
  const [lobbyState, setLobbyState] = useState<LobbyUiState>({ phase: "menu" });
  // Who is at the table, kept through the game (presence comes as roster
  // updates), and which seat is ours: together they say who plays the bots.
  const [roster, setRoster] = useState<Roster | null>(null);
  const [mySeat, setMySeat] = useState<SeatId | null>(null);
  const [link, setLink] = useState<"open" | "retrying" | "lost">("open");
  const transportRef = useRef<RelayTransport<A> | null>(null);
  const retryRef = useRef<{ attempts: number; timer: number | null }>({
    attempts: 0,
    timer: null
  });

  // The transport reports a dropped socket but never retries by itself, so
  // the retry lives here: a fresh transport replaying the stored session,
  // backing off, then handing the decision to the player.
  const reconnectSoon = () => {
    const session = loadSession(game);
    if (!session || retryRef.current.attempts >= MAX_RETRIES) {
      setLink(session ? "lost" : "open");
      return;
    }
    const attempt = retryRef.current.attempts++;
    setLink("retrying");
    retryRef.current.timer = window.setTimeout(
      () => {
        transportRef.current?.destroy();
        transportRef.current = null;
        ensureTransport().reconnect(session);
      },
      Math.min(8000, 1000 * 2 ** attempt)
    );
  };

  const handleEvent = (event: LobbyEvent) => {
    switch (event.type) {
      case "seated":
        setMySeat(event.seat);
        setLobbyState((prev) => ({
          phase: "waiting",
          code: event.code,
          creator: event.creator,
          roster: prev.phase === "waiting" ? prev.roster : null
        }));
        break;
      case "roster":
        setRoster(event.roster);
        setLobbyState((prev) =>
          prev.phase === "waiting" ? { ...prev, roster: event.roster } : prev
        );
        break;
      case "error":
        // A refused begin leaves the room intact; anything else ends it.
        if (event.reason === "notEnoughPlayers" || event.reason === "notCreator")
          break;
        transportRef.current?.destroy();
        transportRef.current = null;
        setLobbyState({ phase: "menu", error: event.reason });
        break;
      case "connection":
        if (event.status === "open") {
          retryRef.current.attempts = 0;
          setLink("open");
        } else if (event.status === "closed") {
          reconnectSoon();
        }
        break;
      case "started":
        // `started` shows up as `inGame` (the table renders).
        break;
    }
  };

  const ensureTransport = (): RelayTransport<A> => {
    if (!transportRef.current) {
      transportRef.current = createRelayTransport({
        game,
        target,
        onEvent: handleEvent
      });
    }
    return transportRef.current;
  };

  const retryNow = () => {
    retryRef.current.attempts = 0;
    reconnectSoon();
  };

  useEffect(() => {
    // The retry bookkeeping is mutated in place, never reassigned, so it is
    // safe to capture here for the cleanup to cancel a pending attempt.
    const retry = retryRef.current;
    const session = loadSession(game);
    if (session) {
      ensureTransport().reconnect(session);
      setLobbyState({ phase: "connecting" });
    }
    return () => {
      if (retry.timer !== null) window.clearTimeout(retry.timer);
      retry.timer = null;
      transportRef.current?.destroy();
      transportRef.current = null;
    };
    // Mount-only on purpose: a re-run would open a second socket into the
    // same room. `game` is fixed for the page's lifetime.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (inGame) {
    const banner = link !== "open" && (
      <div style={linkBanner}>
        {link === "retrying" ? (
          <span>Reconnecting…</span>
        ) : (
          <>
            <span>Disconnected</span>
            <button type="button" style={hudButton} onClick={retryNow}>
              Reconnect
            </button>
          </>
        )}
      </div>
    );
    // A mid-game reconnect isn't re-announced as a seat; the stored session
    // still knows it.
    const seat = mySeat ?? loadSession(game)?.seat ?? null;
    return renderGame((action) => transportRef.current?.submit(action), banner, botSeatsFor(roster, seat));
  }

  return (
    <Lobby
      game={game}
      state={lobbyState}
      onCreate={(name) => {
        ensureTransport().create(name);
        setLobbyState({ phase: "connecting" });
      }}
      onJoin={(code, name) => {
        ensureTransport().join(code, name);
        setLobbyState({ phase: "connecting" });
      }}
      onBegin={() => transportRef.current?.begin()}
      onAddBot={() => {
        const taken = ((roster?.seats ?? []) as readonly BotRosterSeat[]).map((seat) => seat.id);
        const next = Array.from({ length: game.maxSeats }, (_, index) => String.fromCharCode(97 + index)).find(
          (id) => !taken.includes(id)
        );
        transportRef.current?.addBot(computerName(next ?? "?", game.maxSeats));
      }}
      onRemoveBot={(seat) => transportRef.current?.removeBot(seat)}
      onPlayComputer={onPlayComputer}
    />
  );
}

const linkBanner: CSSProperties = {
  position: "absolute",
  top: "0.6rem",
  right: "0.6rem",
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  padding: "0.35rem 0.7rem",
  background: "rgba(120, 30, 30, 0.85)",
  color: "#fff",
  borderRadius: "8px",
  fontFamily: "system-ui, sans-serif",
  fontSize: "0.8rem"
};
