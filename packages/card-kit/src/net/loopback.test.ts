import { expect, test } from "vitest";
import type { Action } from "@peteshepley/game-relay/protocol";
import { createLoopbackTransport } from "./loopback.ts";
import { TEST_GAME, recordingTarget } from "./testTarget.ts";

// Channel hops chain (request -> reply -> apply), so drain several
// scheduler rounds rather than betting on one.
const flush = async () => {
  for (let round = 0; round < 5; round++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

let channelCount = 0;
const freshChannel = () => `kit-loopback-test-${++channelCount}`;

test("the joiner bootstraps from the creator and both stores stay identical", async () => {
  const channelName = freshChannel();
  const creatorStore = recordingTarget();
  const creator = createLoopbackTransport({
    role: "creator",
    game: TEST_GAME,
    target: creatorStore,
    seed: 42,
    channelName
  });
  const joinerStore = recordingTarget();
  const joiner = createLoopbackTransport({
    role: "joiner",
    game: TEST_GAME,
    target: joinerStore,
    channelName
  });
  await flush();

  expect(creatorStore.recorded.viewerSeat).toBe("a");
  expect(joinerStore.recorded.viewerSeat).toBe("b");
  expect(joinerStore.recorded.contract?.dealer).toBe("a");

  creator.submit({ type: "startHand" });
  await flush();
  expect(creatorStore.recorded.actions).toEqual([{ type: "startHand" }]);
  expect(joinerStore.recorded).toEqual({
    ...creatorStore.recorded,
    viewerSeat: "b"
  });

  joiner.submit({ type: "passUpcard", seat: "b" });
  await flush();
  expect(creatorStore.recorded.actions).toHaveLength(2);
  expect(joinerStore.recorded).toEqual({
    ...creatorStore.recorded,
    viewerSeat: "b"
  });

  creator.destroy();
  joiner.destroy();
});

test("a joiner arriving mid-game rebuilds from a full resync", async () => {
  const channelName = freshChannel();
  const creatorStore = recordingTarget();
  const creator = createLoopbackTransport({
    role: "creator",
    game: TEST_GAME,
    target: creatorStore,
    seed: 42,
    channelName
  });
  creator.submit({ type: "startHand" });
  await flush();

  const joinerStore = recordingTarget();
  const joiner = createLoopbackTransport({
    role: "joiner",
    game: TEST_GAME,
    target: joinerStore,
    channelName
  });
  await flush();
  expect(joinerStore.recorded).toEqual({
    ...creatorStore.recorded,
    viewerSeat: "b"
  });

  creator.destroy();
  joiner.destroy();
});

test("a joiner that opened first still bootstraps when the creator arrives", async () => {
  const channelName = freshChannel();
  const joinerStore = recordingTarget();
  const joiner = createLoopbackTransport({
    role: "joiner",
    game: TEST_GAME,
    target: joinerStore,
    channelName
  });
  await flush();
  expect(joinerStore.recorded.contract).toBeNull();

  const creatorStore = recordingTarget();
  const creator = createLoopbackTransport({
    role: "creator",
    game: TEST_GAME,
    target: creatorStore,
    seed: 42,
    channelName
  });
  await flush();
  expect(joinerStore.recorded.viewerSeat).toBe("b");
  expect(joinerStore.recorded).toEqual({
    ...creatorStore.recorded,
    viewerSeat: "b"
  });

  creator.destroy();
  joiner.destroy();
});

// A raw channel plays sequencer against a lone joiner, so the gap
// behaviour is observable as MESSAGES, not just as state equality: the
// gap must produce a resyncRequest on the wire, and the resync reply
// must rebuild the client exactly.
test("a stamp outrunning the bootstrap asks for resync instead of throwing", async () => {
  const channelName = freshChannel();
  const sequencer = new BroadcastChannel(channelName);
  let resyncRequests = 0;
  sequencer.addEventListener("message", (event) => {
    if ((event as MessageEvent).data?.kind === "resyncRequest")
      resyncRequests += 1;
  });
  const joinerStore = recordingTarget();
  const joiner = createLoopbackTransport({
    role: "joiner",
    game: TEST_GAME,
    target: joinerStore,
    channelName
  });
  await flush();
  expect(resyncRequests).toBe(1);

  sequencer.postMessage({
    kind: "action",
    seq: 1,
    action: { type: "startHand" }
  });
  await flush();
  expect(resyncRequests).toBe(2);
  expect(joinerStore.recorded.contract).toBeNull();

  sequencer.close();
  joiner.destroy();
});

test("a gap makes the client request resync by message, then rebuild from the log", async () => {
  const channelName = freshChannel();
  const sequencer = new BroadcastChannel(channelName);
  let resyncRequests = 0;
  sequencer.addEventListener("message", (event) => {
    if ((event as MessageEvent).data?.kind === "resyncRequest")
      resyncRequests += 1;
  });

  const joinerStore = recordingTarget();
  const joiner = createLoopbackTransport({
    role: "joiner",
    game: TEST_GAME,
    target: joinerStore,
    channelName
  });
  await flush();
  expect(resyncRequests).toBe(1);

  const contract = {
    game: "test-game",
    seed: 42,
    dealer: "a",
    seats: [
      { id: "a", name: "Seat A" },
      { id: "b", name: "Seat B" }
    ]
  };
  sequencer.postMessage({ kind: "start", ...contract });
  await flush();
  expect(joinerStore.recorded.contract).toEqual(contract);

  const log: { seq: number; action: Action }[] = [
    { seq: 1, action: { type: "startHand" } },
    { seq: 2, action: { type: "passUpcard", seat: "b" } },
    { seq: 3, action: { type: "passUpcard", seat: "a" } }
  ];
  sequencer.postMessage({ kind: "action", ...log[0] });
  await flush();
  sequencer.postMessage({ kind: "action", ...log[2] });
  await flush();
  expect(resyncRequests).toBe(2);

  sequencer.postMessage({ kind: "resync", ...contract, log });
  await flush();

  const replayed = log.map((stamped) => stamped.action);
  expect(joinerStore.recorded.actions).toEqual(replayed);

  // A late duplicate of an applied stamp is ignored.
  sequencer.postMessage({ kind: "action", ...log[0] });
  await flush();
  expect(joinerStore.recorded.actions).toEqual(replayed);

  sequencer.close();
  joiner.destroy();
});
