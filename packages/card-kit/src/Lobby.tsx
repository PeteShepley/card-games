import { useState } from "react";
import type { CSSProperties } from "react";
import type {
  ErrorReason,
  Roster,
  SeatId
} from "@peteshepley/game-relay/protocol";
import type { GameInfo } from "./net/types.ts";

// The pre-game menu for networked play. Create a room (get a shareable code)
// or join one with a code; both take a display name shown on the seats. While
// waiting, the room code is displayed to share, along with who has joined.
// For games that can start short-handed, the creator gets a Start button
// once enough players are in. The creator can also fill empty seats with
// computer players, and anyone can skip the relay entirely and play the
// computer from the menu. Plain React/DOM over the game's table.

export type LobbyUiState =
  | { phase: "menu"; error?: ErrorReason }
  | { phase: "connecting" }
  | { phase: "waiting"; code: string; creator: boolean; roster: Roster | null };

const errorText: Record<ErrorReason, string> = {
  badCode: "No game found for that code. Check it and try again.",
  roomFull: "That game is already full.",
  alreadyStarted: "That game has already started.",
  wrongGame: "That code is for a different game.",
  badToken: "Your seat is no longer available.",
  badRequest: "Something went wrong creating the game. Try again.",
  notCreator: "Only the player who created the game can start it.",
  notEnoughPlayers: "Not enough players have joined yet."
};

interface LobbyProps {
  game: GameInfo;
  state: LobbyUiState;
  onCreate: (name: string) => void;
  onJoin: (code: string, name: string) => void;
  onBegin: () => void;
  onAddBot: () => void;
  // Fill every open seat with a computer, then start (fixed-size games,
  // which can't start until every seat is taken).
  onFillAndStart: () => void;
  onRemoveBot: (seat: SeatId) => void;
  // A problem worth telling the creator (the server can't add computers).
  notice?: string | null;
  // Absent, the menu offers no computer game.
  onPlayComputer?: (name: string, seats: number) => void;
}

export function Lobby({
  game,
  state,
  onCreate,
  onJoin,
  onBegin,
  onAddBot,
  onFillAndStart,
  onRemoveBot,
  onPlayComputer,
  notice
}: LobbyProps) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  // A computer game's table size, for games that take a range.
  const [players, setPlayers] = useState(Math.min(4, game.maxSeats));

  const trimmedName = name.trim();
  const displayName = trimmedName || "Player";

  if (state.phase === "connecting") {
    return (
      <div style={backdrop}>
        <div style={card}>
          <p style={{ margin: 0 }}>Connecting…</p>
        </div>
      </div>
    );
  }

  if (state.phase === "waiting") {
    const share = () => {
      void navigator.clipboard?.writeText(state.code).then(
        () => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        },
        () => setCopied(false)
      );
    };
    const seats = state.roster?.seats ?? [];
    const open = Math.max(0, game.maxSeats - seats.length);
    const fixedSize = game.minSeats === game.maxSeats;
    const hasBots = seats.some((seat) => seat.bot);
    // A fixed-size room starts itself when the last human joins; with
    // computers in it, or short-handed where the game allows, the creator
    // starts it.
    const canBegin =
      state.creator && (!fixedSize || hasBots) && seats.length >= game.minSeats;
    return (
      <div style={backdrop}>
        <div style={card}>
          <h1 style={title}>
            {game.maxSeats === 2
              ? "Waiting for your opponent"
              : "Waiting for players"}
          </h1>
          <p style={{ margin: 0 }}>Share this code so friends can join:</p>
          <div style={codeDisplay}>{state.code}</div>
          <button type="button" style={button} onClick={share}>
            {copied ? "Copied!" : "Copy code"}
          </button>
          {notice && <p style={errorStyle}>{notice}</p>}
          {/* Every seat: who's in it, or open - for a friend with the code
              or, the creator's choice, a computer. */}
          <ul style={seatList}>
            {seats.map((seat) => (
              <li key={seat.id} style={seatRow}>
                <span style={{ opacity: seat.connected || seat.bot ? 1 : 0.5 }}>
                  {seat.name}
                  <span style={seatTag}>
                    {seat.bot ? "computer" : seat.connected ? "" : "away"}
                  </span>
                </span>
                {seat.bot && state.creator && (
                  <button
                    type="button"
                    style={linkButton}
                    onClick={() => onRemoveBot(seat.id)}
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
            {Array.from({ length: open }, (_, index) => (
              <li key={`open-${index}`} style={seatRow}>
                <span style={{ opacity: 0.6 }}>
                  Open seat
                  {!fixedSize && seats.length + index >= game.minSeats
                    ? " (optional)"
                    : ""}
                </span>
                {state.creator && seats.length > 0 && (
                  <button type="button" style={linkButton} onClick={onAddBot}>
                    Add computer
                  </button>
                )}
              </li>
            ))}
          </ul>
          {state.creator && fixedSize && open > 0 && seats.length > 0 && (
            <button type="button" style={button} onClick={onFillAndStart}>
              {open === 1
                ? "Fill the open seat with a computer and start"
                : `Fill the ${open} open seats with computers and start`}
            </button>
          )}
          {canBegin && (
            <button type="button" style={primaryButton} onClick={onBegin}>
              Start with {seats.length} players
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={backdrop}>
      <div style={card}>
        <h1 style={title}>{game.title}</h1>
        {state.error && <p style={errorStyle}>{errorText[state.error]}</p>}

        <label style={label}>
          Display name
          <input
            style={input}
            value={name}
            maxLength={20}
            placeholder="Player"
            onChange={(event) => setName(event.target.value)}
          />
        </label>

        <button
          type="button"
          style={primaryButton}
          onClick={() => onCreate(displayName)}
        >
          Create a new game
        </button>

        {onPlayComputer && (
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              style={{ ...button, flex: 1 }}
              onClick={() =>
                onPlayComputer(
                  displayName,
                  game.minSeats === game.maxSeats ? game.maxSeats : players
                )
              }
            >
              Play the computer
            </button>
            {game.minSeats < game.maxSeats && (
              <select
                style={input}
                value={players}
                aria-label="Players"
                onChange={(event) => setPlayers(Number(event.target.value))}
              >
                {Array.from(
                  { length: game.maxSeats - game.minSeats + 1 },
                  (_, index) => game.minSeats + index
                ).map((count) => (
                  <option key={count} value={count}>
                    {count} players
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        <div style={divider}>or join with a code</div>

        <div style={{ display: "flex", gap: "0.5rem" }}>
          <input
            style={{ ...input, textTransform: "uppercase", flex: 1 }}
            value={code}
            maxLength={6}
            placeholder="ABC123"
            onChange={(event) => setCode(event.target.value.toUpperCase())}
          />
          <button
            type="button"
            style={button}
            disabled={code.trim().length === 0}
            onClick={() => onJoin(code.trim(), displayName)}
          >
            Join
          </button>
        </div>
      </div>
    </div>
  );
}

const backdrop: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(0, 0, 0, 0.45)"
};

const card: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.85rem",
  minWidth: "min(280px, 100%)",
  maxWidth: "90vw",
  padding: "1.5rem",
  background: "rgba(20, 20, 20, 0.92)",
  color: "#fff",
  borderRadius: "12px",
  boxShadow: "0 12px 40px rgba(0, 0, 0, 0.4)",
  fontFamily: "system-ui, sans-serif"
};

const title: CSSProperties = {
  margin: 0,
  fontSize: "1.4rem",
  textAlign: "center"
};

const label: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.3rem",
  fontSize: "0.85rem"
};

const input: CSSProperties = {
  padding: "0.5rem 0.6rem",
  borderRadius: "6px",
  border: "1px solid #555",
  background: "#111",
  color: "#fff",
  fontSize: "1rem"
};

const button: CSSProperties = {
  padding: "0.5rem 0.9rem",
  borderRadius: "6px",
  border: "1px solid #666",
  background: "#2a2a2a",
  color: "#fff",
  fontSize: "0.95rem",
  cursor: "pointer"
};

const primaryButton: CSSProperties = {
  ...button,
  background: "#1d7a3a",
  border: "1px solid #1d7a3a",
  fontWeight: 600
};

const seatList: CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: "none",
  display: "flex",
  flexDirection: "column",
  gap: "0.3rem"
};

const seatRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.75rem",
  padding: "0.35rem 0.6rem",
  borderRadius: "6px",
  background: "rgba(255, 255, 255, 0.06)"
};

const seatTag: CSSProperties = {
  marginLeft: "0.5rem",
  opacity: 0.6,
  fontSize: "0.8rem"
};

const linkButton: CSSProperties = {
  padding: 0,
  border: 0,
  background: "none",
  color: "#7fd1ff",
  font: "inherit",
  fontSize: "0.85rem",
  textDecoration: "underline",
  cursor: "pointer"
};

const divider: CSSProperties = {
  textAlign: "center",
  opacity: 0.6,
  fontSize: "0.8rem"
};

const codeDisplay: CSSProperties = {
  fontSize: "2rem",
  fontWeight: 700,
  letterSpacing: "0.3rem",
  textAlign: "center",
  padding: "0.5rem",
  background: "#111",
  borderRadius: "8px",
  userSelect: "all"
};

const errorStyle: CSSProperties = {
  margin: 0,
  padding: "0.5rem 0.6rem",
  borderRadius: "6px",
  background: "rgba(150, 40, 40, 0.5)",
  fontSize: "0.85rem"
};
