import type { SeatId } from "@peteshepley/game-relay/protocol";

// Plays the computer seats. Given each new game state it asks the game's
// bot what each computer seat would do now, and submits the first answer
// after a short, human-looking pause. A new state cancels a pending move
// (the game moved on), so a bot never acts on stale state; and a state it
// already submitted from is never acted on twice while the stamped echo is
// on its way back from the relay.

export type Decide<S, A> = (state: S, seat: SeatId) => A | null;

export interface BotRunner<S> {
  update(state: S | null, seats: readonly SeatId[], active: boolean): void;
  destroy(): void;
}

export function createBotRunner<S, A>(options: {
  decide: Decide<S, A>;
  submit: (action: A) => void;
  // How long the bot "thinks" before this action.
  delayMs: (action: A) => number;
}): BotRunner<S> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let submittedFrom: S | null = null;

  const cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  return {
    update(state, seats, active) {
      cancel();
      if (!state || !active || state === submittedFrom) return;
      for (const seat of seats) {
        const action = options.decide(state, seat);
        if (action === null) continue;
        timer = setTimeout(() => {
          timer = null;
          submittedFrom = state;
          options.submit(action);
        }, options.delayMs(action));
        return;
      }
    },
    destroy: cancel
  };
}
