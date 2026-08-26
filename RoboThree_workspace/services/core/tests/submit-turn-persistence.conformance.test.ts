import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  PersistedSubmitTurnReceiptSchema,
  SubmitTurnRecordSchema,
  SubmitTurnRecordV1Alpha2Schema,
} from "@robothree/contracts";
import { describe, expect, it } from "vitest";

import {
  FakeClock,
  InMemorySubmitTurnPersistence,
  SqliteSubmitTurnPersistence,
} from "../src/index.js";
import type { SubmitTurnPersistence } from "../src/index.js";

const at = {
  created: "2026-07-26T16:00:00.000Z",
  changed: "2026-07-26T16:01:00.000Z",
} as const;
const id = (suffix: string) =>
  `019f9100-0000-7000-8000-${suffix.padStart(12, "0")}`;
const digest = (marker: string) => `sha256:${marker.repeat(64)}`;

type Harness = {
  persistence: SubmitTurnPersistence;
  cleanup(): Promise<void>;
};

const variants: readonly {
  name: string;
  create(deliveryRetentionLimit?: number): Promise<Harness>;
}[] = [
  {
    name: "InMemorySubmitTurnPersistence",
    async create(deliveryRetentionLimit) {
      const persistence = new InMemorySubmitTurnPersistence({
        clock: new FakeClock(at.created),
        deliveryRetentionLimit,
      });
      await persistence.start();
      return {
        persistence,
        cleanup: () => persistence.stop(),
      };
    },
  },
  {
    name: "SqliteSubmitTurnPersistence",
    async create(deliveryRetentionLimit) {
      const directory = await mkdtemp(join(tmpdir(), "robothree-submit-turn-"));
      const persistence = new SqliteSubmitTurnPersistence({
        databasePath: join(directory, "robothree.sqlite"),
        clock: new FakeClock(at.created),
        deliveryRetentionLimit,
      });
      await persistence.start();
      return {
        persistence,
        async cleanup() {
          await persistence.stop();
          await rm(directory, { recursive: true, force: true });
        },
      };
    },
  },
];

for (const variant of variants) {
  describe(`DCF-1.1C ${variant.name} conformance`, () => {
    it("persists deterministic stages, terminal receipt and ordered delivery", async () => {
      const harness = await variant.create();
      try {
        const accepted = record();
        expect(await harness.persistence.prepareAccepted(accepted))
          .toMatchObject({ ok: true, replayed: false });
        expect(await harness.persistence.prepareAccepted(accepted))
          .toMatchObject({ ok: true, replayed: true });
        expect(await harness.persistence.prepareAccepted(SubmitTurnRecordSchema.parse({
          ...accepted,
          submitTurnCommandId: id("20"),
        }))).toMatchObject({
          ok: false,
          error: { code: "submit_turn.idempotency_conflict" },
        });

        const messageAppended = SubmitTurnRecordSchema.parse({
          ...accepted,
          status: "message_appended",
          updatedAt: at.changed,
        });
        expect(await harness.persistence.transition(
          messageAppended,
          "accepted",
        )).toMatchObject({ ok: true, replayed: false });
        const taskCommitted = SubmitTurnRecordSchema.parse({
          ...messageAppended,
          status: "task_committed",
        });
        expect(await harness.persistence.transition(
          taskCommitted,
          "message_appended",
        )).toMatchObject({ ok: true, replayed: false });

        const completed = SubmitTurnRecordSchema.parse({
          ...taskCommitted,
          status: "completed",
        });
        const receipt = acceptedReceipt();
        const terminal = {
          record: completed,
          expectedStatus: "task_committed" as const,
          receipt,
          delivery: {
            schemaVersion: "v1alpha1" as const,
            deliveryId: id("8"),
            submitTurnCommandId: accepted.submitTurnCommandId,
            type: "turn.accepted" as const,
            sessionId: accepted.desktopSessionId,
            userMessageId: receipt.userMessageId,
            taskId: receipt.taskId,
            createdAt: at.changed,
          },
        };
        expect(await harness.persistence.complete(terminal))
          .toMatchObject({ ok: true, replayed: false });
        expect(await harness.persistence.complete(terminal))
          .toMatchObject({ ok: true, replayed: true });
        expect(await harness.persistence.listDeliveriesAfter(0, 10))
          .toMatchObject([{
            sequence: 1,
            type: "turn.accepted",
          }]);
        const messageDelivery = {
          schemaVersion: "v1alpha1" as const,
          deliveryId: id("9"),
          submitTurnCommandId: accepted.submitTurnCommandId,
          type: "message.committed" as const,
          sessionId: accepted.desktopSessionId,
          taskId: receipt.taskId,
          messageId: `message:${id("9")}`,
          messageRevision: 2,
          messageStatus: "completed" as const,
          createdAt: at.changed,
        };
        expect(await harness.persistence.appendDelivery(messageDelivery))
          .toMatchObject({ ok: true, replayed: false, value: { sequence: 2 } });
        expect(await harness.persistence.appendDelivery(messageDelivery))
          .toMatchObject({ ok: true, replayed: true, value: { sequence: 2 } });
        expect(await harness.persistence.deliveryBounds()).toEqual({
          oldestSequence: 1,
          latestSequence: 2,
        });
        expect(await harness.persistence.listDeliveriesAfter(1, 10))
          .toMatchObject([{
            sequence: 2,
            type: "message.committed",
            messageId: `message:${id("9")}`,
          }]);
        expect(await harness.persistence.listRecoverable(10)).toHaveLength(1);
        expect(await harness.persistence.markLoopStarted(
          accepted.submitTurnCommandId,
          at.changed,
        )).toMatchObject({ ok: true, replayed: false });
        expect(await harness.persistence.listRecoverable(10)).toEqual([]);
      } finally {
        await harness.cleanup();
      }
    });

    it("retains a bounded cursor window without reusing delivery sequences", async () => {
      const harness = await variant.create(2);
      try {
        const accepted = record();
        await harness.persistence.prepareAccepted(accepted);
        const messageAppended = SubmitTurnRecordSchema.parse({
          ...accepted,
          status: "message_appended",
          updatedAt: at.changed,
        });
        await harness.persistence.transition(messageAppended, "accepted");
        const taskCommitted = SubmitTurnRecordSchema.parse({
          ...messageAppended,
          status: "task_committed",
        });
        await harness.persistence.transition(taskCommitted, "message_appended");
        await harness.persistence.complete({
          record: SubmitTurnRecordSchema.parse({
            ...taskCommitted,
            status: "completed",
          }),
          expectedStatus: "task_committed",
          receipt: acceptedReceipt(),
          delivery: {
            schemaVersion: "v1alpha1",
            deliveryId: id("8"),
            submitTurnCommandId: accepted.submitTurnCommandId,
            type: "turn.accepted",
            sessionId: accepted.desktopSessionId,
            userMessageId: acceptedReceipt().userMessageId,
            taskId: acceptedReceipt().taskId,
            createdAt: at.changed,
          },
        });
        for (const suffix of ["9", "10", "11"]) {
          await harness.persistence.appendDelivery({
            schemaVersion: "v1alpha1",
            deliveryId: id(suffix),
            submitTurnCommandId: accepted.submitTurnCommandId,
            type: "message.committed",
            sessionId: accepted.desktopSessionId,
            taskId: acceptedReceipt().taskId,
            messageId: `message:${id(suffix)}`,
            messageRevision: Number(suffix),
            messageStatus: "completed",
            createdAt: at.changed,
          });
        }
        expect(await harness.persistence.deliveryBounds()).toEqual({
          oldestSequence: 3,
          latestSequence: 4,
        });
        expect(await harness.persistence.listDeliveriesAfter(0, 10))
          .toMatchObject([{ sequence: 3 }, { sequence: 4 }]);
      } finally {
        await harness.cleanup();
      }
    });

    it("normalizes a recoverable legacy record with exact CAS identity", async () => {
      const harness = await variant.create();
      try {
        const legacy = record();
        await harness.persistence.prepareAccepted(legacy);
        const replacement = normalizedRecord(legacy);
        expect(await harness.persistence.normalizeLegacyRecoverableRecord(
          legacy,
          replacement,
        )).toMatchObject({
          ok: true,
          replayed: false,
          value: {
            schemaVersion: "v1alpha2",
            transportContractVersion: "v1alpha1",
          },
        });
        expect(await harness.persistence.normalizeLegacyRecoverableRecord(
          legacy,
          replacement,
        )).toMatchObject({ ok: true, replayed: true });
        expect(await harness.persistence.normalizeLegacyRecoverableRecord(
          legacy,
          SubmitTurnRecordV1Alpha2Schema.parse({
            ...replacement,
            plannedSelectionDigest: digest("9"),
          }),
        )).toMatchObject({
          ok: false,
          error: { code: "submit_turn.invalid_normalization" },
        });
        expect(await harness.persistence.loadRecord(legacy.submitTurnCommandId))
          .toEqual(replacement);
      } finally {
        await harness.cleanup();
      }
    });
  });
}

function normalizedRecord(legacy: ReturnType<typeof record>) {
  return SubmitTurnRecordV1Alpha2Schema.parse({
    ...legacy,
    schemaVersion: "v1alpha2",
    transportContractVersion: "v1alpha1",
    selectionRequest: {
      ...legacy.selectionRequest,
      authorizationPreference: {
        schemaVersion: "v1alpha1",
        requestedMode: "smart_confirm",
      },
    },
    authorizationPlan: {
      requestedMode: "smart_confirm",
      resolvedMode: "smart_confirm",
      policyRevision: digest("7"),
      source: "legacy_default",
      authorizationSelectionDigest: digest("8"),
      executionSelectionDigest: digest("9"),
    },
  });
}

function record() {
  return SubmitTurnRecordSchema.parse({
    schemaVersion: "v1alpha1",
    submitTurnCommandId: id("1"),
    clientTurnId: "client-turn-0001",
    desktopSessionId: `session:${id("2")}`,
    internalSessionId: id("2"),
    requestDigest: digest("1"),
    selectionRequest: {
      agentId: "agent.general",
      selectedSkillIds: [],
      selectedKnowledgeIds: [],
    },
    lockedAgent: {
      agentDefinitionId: "agent.general",
      revision: digest("2"),
      digest: digest("2"),
    },
    registryRevision: digest("3"),
    platformPromptRevision: digest("4"),
    plannedSelectionDigest: digest("5"),
    capabilityLockIds: [id("3")],
    internalUserMessageId: id("4"),
    internalTaskId: id("5"),
    internalRuntimeSelectionId: id("6"),
    initialCheckpointId: id("7"),
    status: "accepted",
    createdAt: at.created,
    updatedAt: at.created,
  });
}

function acceptedReceipt() {
  return PersistedSubmitTurnReceiptSchema.parse({
    submitTurnCommandId: id("1"),
    clientTurnId: "client-turn-0001",
    userMessageId: `message:${id("4")}`,
    taskId: `task:${id("5")}`,
    runtimeSelectionId: `runtime-selection:${id("6")}`,
    status: "accepted",
    runtimeSelectionSummary: {
      runtimeSelectionId: `runtime-selection:${id("6")}`,
      digest: digest("5"),
      agent: { id: "agent.general", revision: digest("2") },
      defaultModelId: "model.default",
      resolvedModel: { id: "model.default", revision: digest("6") },
      activeSkills: [],
      allowedTools: [],
      knowledge: [],
    },
    acceptedAt: at.created,
    requestDigest: digest("1"),
    completedAt: at.changed,
  });
}
