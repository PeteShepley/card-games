import { useEffect, useRef } from "react";
import { createBotRunner } from "./runner.ts";
import type { BotRunner, Decide } from "./runner.ts";
import type { BotSeats } from "./seats.ts";

// Plays this table's computer seats from a component: hand it the game
// state on every render and it moves for whichever computer is up, if
// this client is the one that runs them.
export function useBots<S, A>(
  state: S | null,
  bots: BotSeats,
  decide: Decide<S, A>,
  submit: (action: A) => void,
  delayMs: (action: A) => number = () => 650 + Math.random() * 450
): void {
  const latest = useRef({ decide, submit, delayMs });
  // Declared before the update effect below, so it runs first each render.
  useEffect(() => {
    latest.current = { decide, submit, delayMs };
  });
  const runner = useRef<BotRunner<S> | null>(null);

  useEffect(() => {
    const created = createBotRunner<S, A>({
      decide: (s, seat) => latest.current.decide(s, seat),
      submit: (action) => latest.current.submit(action),
      delayMs: (action) => latest.current.delayMs(action)
    });
    runner.current = created;
    return () => {
      created.destroy();
      runner.current = null;
    };
  }, []);

  const seatsKey = bots.seats.join(",");
  useEffect(() => {
    runner.current?.update(state, bots.seats, bots.runner);
    // seatsKey stands in for the seats array, which is rebuilt each render.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [state, seatsKey, bots.runner]);
}
