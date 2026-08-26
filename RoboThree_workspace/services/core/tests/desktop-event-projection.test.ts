import {
  DesktopDeliveryRecordSchema,
  type DesktopDeliveryRecord,
} from "@robothree/contracts";
import { describe, expect, it, vi } from "vitest";

import {
  DesktopApplicationFacade,
  DesktopEphemeralEventBus,
  FakeClock,
  FakeIdGenerator,
} from "../src/index.js";

const id = (suffix: string) =>
  `019f9200-0000-7000-8000-${suffix.padStart(12, "0")}`;
const runtimeInstanceId = `runtime.instance-${id("1")}`;

describe("DCF-1.2C Desktop event projection", () => {
  it("publishes bounded process-local deltas and stops after unsubscribe", () => {
    const bus = new DesktopEphemeralEventBus({
      clock: new FakeClock("2026-07-26T20:00:00.000Z"),
      ids: new FakeIdGenerator([id("2"), id("3")]),
      runtimeInstanceId,
    });
    const listener = vi.fn();
    const unsubscribe = bus.subscribe(listener);
    const first = bus.publish({
      type: "assistant_token_delta",
      sessionId: `session:${id("4")}`,
      messageId: `message:${id("5")}`,
      deltaSequence: 0,
      delta: "RoboThree ",
    });
    unsubscribe();
    bus.publish({
      type: "assistant_token_delta",
      sessionId: `session:${id("4")}`,
      messageId: `message:${id("5")}`,
      deltaSequence: 1,
      delta: "Desktop",
    });
    expect(first).toMatchObject({
      deliveryKind: "ephemeral",
      runtimeInstanceId,
      payload: { deltaSequence: 0, delta: "RoboThree " },
    });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("maps committed Message delivery and fails closed to Snapshot reset", async () => {
    const delivery = DesktopDeliveryRecordSchema.parse({
      schemaVersion: "v1alpha1",
      deliveryId: id("6"),
      sequence: 6,
      submitTurnCommandId: id("7"),
      type: "message.committed",
      sessionId: `session:${id("8")}`,
      taskId: `task:${id("9")}`,
      messageId: `message:${id("6")}`,
      messageRevision: 2,
      messageStatus: "completed",
      createdAt: "2026-07-26T20:00:00.000Z",
    });
    const facade = createFacade({
      deliveries: [delivery],
      oldestSequence: 5,
      latestSequence: 6,
    });
    await expect(facade.listDurableEvents("delivery:5")).resolves.toMatchObject({
      durableCursor: "delivery:6",
      events: [{
        deliveryKind: "durable",
        payload: {
          type: "message_committed",
          messageId: `message:${id("6")}`,
          status: "completed",
        },
      }],
    });
    await expect(facade.listDurableEvents("delivery:1")).resolves.toMatchObject({
      reset: {
        type: "replay_reset_required",
        reason: "retention_window_exceeded",
        replacementCursor: "delivery:6",
      },
    });
    await expect(facade.listDurableEvents("delivery:99")).resolves.toMatchObject({
      reset: {
        reason: "unknown_cursor",
        replacementCursor: "delivery:6",
      },
    });
  });
});

function createFacade(input: {
  deliveries: readonly DesktopDeliveryRecord[];
  oldestSequence: number;
  latestSequence: number;
}): DesktopApplicationFacade {
  return new DesktopApplicationFacade({
    clock: new FakeClock("2026-07-26T20:00:00.000Z"),
    runtimeInstanceId,
    coreVersion: "0.0.0-dcf.1.2c",
    runtimeStatus: () => "ready",
    workspaceSelections: {} as never,
    workspaces: {} as never,
    sessions: {} as never,
    conversations: {} as never,
    catalog: {} as never,
    selectionContexts: {} as never,
    submitTurns: {} as never,
    coordination: {
      deliveryBounds: async () => ({
        oldestSequence: input.oldestSequence,
        latestSequence: input.latestSequence,
      }),
      listDeliveriesAfter: async (sequence: number, limit: number) =>
        input.deliveries.filter((item) => item.sequence > sequence).slice(0, limit),
    } as never,
  });
}
