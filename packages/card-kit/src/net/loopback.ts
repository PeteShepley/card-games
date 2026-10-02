import type {
  Action,
  Contract,
  Stamped,
  WireMessage
} from "@peteshepley/game-relay/protocol";
import { contractOf } from "./types.ts";
import type { ContractTarget, GameInfo } from "./types.ts";

// Dev-mode networking over a BroadcastChannel: two tabs, each fixed to one
// seat, speaking the relay's game messages verbatim. The creating tab is the
// sequencer (the "shim"); clients apply only stamped actions, in order,
// including the echoes of their own. Two seats only — it exists to exercise
// the protocol early, not to host a full table.

export interface LoopbackTransport<A extends Action> {
  submit(action: A): void;
  destroy(): void;
}

export function createLoopbackTransport<A extends Action>(options: {
  game: GameInfo;
  role: "creator" | "joiner";
  target: ContractTarget<A>;
  seed?: number;
  channelName?: string;
}): LoopbackTransport<A> {
  const { game, role, target } = options;
  const channel = new BroadcastChannel(
    options.channelName ?? `${game.id}-dev`
  );
  const mySeat = role === "creator" ? "a" : "b";

  let expectedSeq = 1;
  let contractApplied = false;

  const applyContract = (contract: Contract) => {
    target.start(contractOf(contract), mySeat);
    expectedSeq = 1;
    contractApplied = true;
  };

  const inbox = (stamped: Stamped) => {
    // A stamp outrunning the bootstrap is a gap by another name: ask for
    // the full picture rather than applying into a store with no game.
    if (!contractApplied) {
      channel.postMessage({ kind: "resyncRequest" } satisfies WireMessage);
      return;
    }
    if (stamped.seq < expectedSeq) return;
    if (stamped.seq > expectedSeq) {
      channel.postMessage({ kind: "resyncRequest" } satisfies WireMessage);
      return;
    }
    target.apply(stamped.action as A);
    expectedSeq = stamped.seq + 1;
  };

  let sequencer: {
    contract: Contract;
    log: Stamped[];
    nextSeq: number;
  } | null = null;

  const stamp = (action: Action) => {
    const shim = sequencer;
    if (!shim) return; // narrowing only - callers guard visibly
    const stamped: Stamped = { seq: shim.nextSeq, action };
    shim.nextSeq += 1;
    shim.log.push(stamped);
    channel.postMessage({ kind: "action", ...stamped } satisfies WireMessage);
    // BroadcastChannel never echoes to the posting tab, so the shim hands
    // its own client the stamp directly - the same echo discipline.
    inbox(stamped);
  };

  if (role === "creator") {
    // Dev mode has no name entry; the seats get static labels.
    const contract: Contract = {
      game: game.id,
      seed: options.seed ?? 1,
      dealer: "a",
      seats: [
        { id: "a", name: "Seat A" },
        { id: "b", name: "Seat B" }
      ]
    };
    sequencer = { contract, log: [], nextSeq: 1 };
    applyContract(contract);
    // A joiner may already be waiting (it opened first): announce the
    // contract so it bootstraps without having to ask again.
    channel.postMessage({ kind: "start", ...contract } satisfies WireMessage);
  }

  const onMessage = (event: MessageEvent) => {
    const message = event.data as WireMessage;
    switch (message.kind) {
      case "submit":
        // Only the sequencer stamps; a joiner ignores peer submits. (A
        // submit with no sequencer alive anywhere - the creating tab
        // closed - goes unanswered and the submitter sees no change.)
        if (sequencer) stamp(message.action);
        break;
      case "action":
        inbox({ seq: message.seq, action: message.action });
        break;
      case "start":
        if (role === "joiner") applyContract(message);
        break;
      case "resync":
        if (role === "joiner") {
          applyContract(message);
          for (const stamped of message.log) inbox(stamped);
        }
        break;
      case "resyncRequest":
        if (sequencer) {
          const reply: WireMessage =
            sequencer.log.length === 0
              ? { kind: "start", ...sequencer.contract }
              : { kind: "resync", ...sequencer.contract, log: sequencer.log };
          channel.postMessage(reply);
        }
        break;
    }
  };
  channel.addEventListener("message", onMessage);

  if (role === "joiner") {
    channel.postMessage({ kind: "resyncRequest" } satisfies WireMessage);
  }

  return {
    submit(action) {
      if (sequencer) stamp(action);
      else
        channel.postMessage({ kind: "submit", action } satisfies WireMessage);
    },
    destroy() {
      channel.removeEventListener("message", onMessage);
      channel.close();
    }
  };
}
