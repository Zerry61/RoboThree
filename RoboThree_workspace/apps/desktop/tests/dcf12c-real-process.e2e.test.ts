import { fileURLToPath } from "node:url";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { DesktopEventEnvelope } from "@robothree/contracts";
import { describe, expect, it } from "vitest";

import { CorePrivateSupervisor } from "../src/main/core-private-supervisor.js";

const id = (suffix: string) =>
  `019f9400-0000-7000-8000-${suffix.padStart(12, "0")}`;

describe("DCF-1.2C real Desktop Main/Core/SQLite process chain", () => {
  it("drops ephemeral deltas on disconnect and converges through Snapshot plus durable Message", async () => {
    const directory = await mkdtemp(join(tmpdir(), "robothree-dcf12c-e2e-"));
    const supervisor = new CorePrivateSupervisor({
      entryPath: fileURLToPath(new URL(
        "../../../services/core/dist/desktop-private-main.js",
        import.meta.url,
      )),
      databasePath: join(directory, "robothree.sqlite"),
      demoMode: "legacy_test",
      maxUnexpectedRestarts: 0,
    });
    try {
      await supervisor.start();
      const session = await supervisor.client.createSession({
        ...commandMetadata("1"),
        type: "create_session",
        title: "DCF-1.2C E2E",
      });
      expect(session.ok).toBe(true);
      if (!session.ok) return;

      const disconnected = new AbortController();
      const firstEvents: DesktopEventEnvelope[] = [];
      const firstStream = supervisor.client.subscribe({
        query: subscriptionQuery("2", "delivery:0", supervisor.clientInstanceId),
        signal: disconnected.signal,
        onEvent: (event) => {
          firstEvents.push(event);
          if (
            event.deliveryKind === "ephemeral"
            && event.payload.type === "assistant_token_delta"
          ) disconnected.abort();
        },
      }).catch((error: unknown) => {
        if (!disconnected.signal.aborted) throw error;
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      const receipt = await supervisor.client.submitTurn({
        ...commandMetadata("3", supervisor.clientInstanceId),
        type: "submit_turn",
        clientTurnId: "dcf12c-client-turn-0001",
        sessionId: session.value.sessionId,
        userInput: "验证断线恢复",
        selectionRequest: {
          agentId: "agent.fixture.desktop-scripted",
          selectedSkillIds: [],
          selectedKnowledgeIds: [],
        },
      });
      expect(receipt).toMatchObject({ ok: true, value: { status: "accepted" } });
      await firstStream;
      expect(firstEvents.some((event) =>
        event.deliveryKind === "ephemeral"
        && event.payload.type === "assistant_token_delta")).toBe(true);

      const snapshotBeforeReplay = await supervisor.client.loadConversationSnapshot({
        ...queryMetadata("4", supervisor.clientInstanceId),
        type: "conversation_snapshot",
        sessionId: session.value.sessionId,
        limit: 200,
      });
      expect(snapshotBeforeReplay).toMatchObject({
        ok: true,
        value: {
          messages: [
            { role: "user", status: "completed" },
            {
              role: "assistant",
              status: "completed",
              content: "RoboThree Desktop scripted response.",
            },
          ],
        },
      });

      const replayedEvents: DesktopEventEnvelope[] = [];
      const reconnected = new AbortController();
      await supervisor.client.subscribe({
        query: subscriptionQuery("5", "delivery:0", supervisor.clientInstanceId),
        signal: reconnected.signal,
        onEvent: (event) => {
          replayedEvents.push(event);
          if (
            event.deliveryKind === "durable"
            && event.payload.type === "message_committed"
          ) reconnected.abort();
        },
      }).catch((error: unknown) => {
        if (!reconnected.signal.aborted) throw error;
      });
      expect(replayedEvents).toEqual(expect.arrayContaining([
        expect.objectContaining({
          deliveryKind: "durable",
          durableCursor: "delivery:2",
          payload: expect.objectContaining({
            type: "message_committed",
            status: "completed",
          }),
        }),
      ]));
    } finally {
      await supervisor.stop();
      await rm(directory, { recursive: true, force: true });
    }
    expect(supervisor.snapshot()).toMatchObject({
      runtimeState: "stopped",
      coreReady: false,
    });
  });
});

function commandMetadata(suffix: string, clientInstanceId = id("99")) {
  return {
    contractVersion: "v1alpha1" as const,
    commandId: id(suffix),
    correlationId: id(`${suffix}1`),
    clientInstanceId,
  };
}

function queryMetadata(suffix: string, clientInstanceId: string) {
  return {
    contractVersion: "v1alpha1" as const,
    queryId: id(suffix),
    correlationId: id(`${suffix}1`),
    clientInstanceId,
  };
}

function subscriptionQuery(
  suffix: string,
  durableCursor: string,
  clientInstanceId: string,
) {
  return {
    ...queryMetadata(suffix, clientInstanceId),
    type: "desktop_event_subscription" as const,
    durableCursor,
  };
}
