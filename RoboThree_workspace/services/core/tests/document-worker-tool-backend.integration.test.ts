import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { CONTRACT_VERSION } from "@robothree/contracts";
import type { TaskCommand, TaskInitialization, ToolAuthorizationContext } from "@robothree/contracts";
import { describe, expect, it } from "vitest";

import {
  AuthorizationEvaluator,
  CapabilityResolver,
  DOCUMENT_TOOL_CAPABILITY_IDS,
  DOCUMENT_TOOL_REGISTRY_RECORDS,
  DocumentWorkerBackendError,
  DocumentWorkerToolBackend,
  DurableTaskRuntime,
  EffectCoordinator,
  FakeClock,
  FakeIdGenerator,
  FakeScheduler,
  InMemoryTaskPersistence,
  RegistryBuilder,
  registerDocumentToolRecords,
  RuntimeAdapterHandles,
  RuntimeAdmissionController,
  TaskCapabilityLockService,
  TaskRecoveryCoordinator,
  ToolEffectExecutor,
  ToolExecutionService,
  UserConfirmationCoordinator,
  resolveTrustedDocumentWorkerEntry,
} from "../src/index.js";
import type { TaskPersistence } from "../src/index.js";
import { makePdfFixture } from "../../document-worker/tests/fixtures/pdf-fixtures.js";
import { makeXlsxFixture } from "../../document-worker/tests/fixtures/xlsx-fixtures.js";
import { makeDocxSpikeFixture } from "../../document-worker/tests/fixtures/docx-fixtures.js";

const entityId = (value: number) => `019f7447-a784-77b2-a716-${String(value).padStart(12, "0")}`;
const ids = {
  task: entityId(5101),
  agent: entityId(5102),
  run: entityId(5103),
  step: entityId(5104),
  action: entityId(5105),
  plan: entityId(5106),
  planRevision: entityId(5107),
  startRun: entityId(5108),
  startStep: entityId(5109),
};
const at = "2026-08-04T03:30:00.000Z";
type DocumentCapability = (typeof DOCUMENT_TOOL_CAPABILITY_IDS)[number];

describe("Document Worker Tool Backend", () => {
  it("runs the real Document Worker child for PDF, XLSX and DOCX read-only capabilities", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "robothree-dtp2-docs-"));
    const harness = await createHarness();
    try {
      await writeFile(join(workspace, "sample.pdf"), makePdfFixture([{ text: "DTP two PDF" }]));
      await writeFile(join(workspace, "tables.pdf"), makePdfFixture([{
        textRuns: tableRuns([
          ["Name", "Q1", "Q2"],
          ["Alpha", "10", "20"],
          ["Beta", "30", "40"],
        ]),
      }]));
      await writeFile(join(workspace, "sample.xlsx"), makeXlsxFixture());
      await writeFile(join(workspace, "sample.docx"), makeDocxSpikeFixture({ includeSectionBreak: true }));

      const expectations: Array<{
        capabilityId: DocumentCapability;
        relativePath: string;
        match: Record<string, unknown>;
      }> = [
        {
          capabilityId: "tool.document.pdf.extract_text",
          relativePath: "sample.pdf",
          match: { result: { format: "pdf", pages: [{ text: "DTP two PDF" }] } },
        },
        {
          capabilityId: "tool.document.pdf.extract_tables",
          relativePath: "tables.pdf",
          match: {
            result: {
              format: "pdf",
              extraction: "tables",
              tables: [expect.objectContaining({
                rowCount: 3,
                columnCount: 3,
                rows: expect.arrayContaining([
                  expect.objectContaining({
                    cells: expect.arrayContaining([
                      expect.objectContaining({ text: "Name" }),
                      expect.objectContaining({ text: "Q1" }),
                      expect.objectContaining({ text: "Q2" }),
                    ]),
                  }),
                ]),
              })],
            },
          },
        },
        {
          capabilityId: "tool.document.xlsx.read",
          relativePath: "sample.xlsx",
          match: { result: { format: "xlsx" } },
        },
        {
          capabilityId: "tool.document.docx.read",
          relativePath: "sample.docx",
          match: { result: { format: "docx", metadata: { sectionCount: 2 } } },
        },
      ];

      for (const [index, item] of expectations.entries()) {
        const lock = await harness.lockService.resolveAndLock({
          taskId: ids.task,
          registryRevision: harness.snapshot.registryRevision,
          capabilityId: item.capabilityId,
        });
        const observation = await harness.backend.execute({
          lock: lock.lock,
          action: documentAction(item.capabilityId, workspace, item.relativePath, 5200 + index),
          effectAttemptId: entityId(5300 + index),
          idempotencyKey: `document-worker:direct:${index}`,
          requestedAt: at,
          deadlineAt: futureDeadline(),
        }, new AbortController().signal);
        if (observation.outcome !== "succeeded") {
          throw new Error(JSON.stringify(observation, null, 2));
        }
        expect(observation).toMatchObject({
          outcome: "succeeded",
          output: {
            status: "succeeded",
            metadata: { truncated: false },
            ...item.match,
          },
        });
      }
      expect(harness.backend.transmissions()).toHaveLength(4);
    } finally {
      await harness.stop();
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("creates a new XLSX through the real Document Worker without exposing workspaceRoot in Observation", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "robothree-dwe2-xlsx-write-"));
    const harness = await createHarness();
    try {
      await mkdir(join(workspace, "created"));
      const lock = await harness.lockService.resolveAndLock({
        taskId: ids.task,
        registryRevision: harness.snapshot.registryRevision,
        capabilityId: "tool.document.xlsx.write",
      });
      const observation = await harness.backend.execute({
        lock: lock.lock,
        action: xlsxWriteAction(workspace, "created/report.xlsx", 5260),
        effectAttemptId: entityId(5360),
        idempotencyKey: "document-worker:xlsx-write",
        requestedAt: at,
        deadlineAt: futureDeadline(),
      }, new AbortController().signal);

      if (observation.outcome !== "succeeded") {
        throw new Error(JSON.stringify(observation, null, 2));
      }
      expect((await stat(join(workspace, "created", "report.xlsx"))).size).toBeGreaterThan(0);
      expect(observation).toMatchObject({
        outcome: "succeeded",
        output: {
          status: "succeeded",
          result: {
            format: "xlsx",
            relativePath: "created/report.xlsx",
            sheetCount: 1,
            cellCount: 3,
            mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          },
        },
      });
      expect(JSON.stringify(observation)).not.toContain(workspace);
      expect(harness.backend.transmissions().at(-1)).toMatchObject({
        capabilityId: "tool.document.xlsx.write",
        protocolVersion: "v1alpha2",
        requestDigest: expect.stringMatching(/^[a-f0-9]{64}$/u),
      });
    } finally {
      await harness.stop();
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("creates a new PPTX through the real Document Worker with private digest material", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "robothree-ptx2-pptx-write-"));
    const harness = await createHarness();
    try {
      await mkdir(join(workspace, "created"));
      const lock = await harness.lockService.resolveAndLock({
        taskId: ids.task,
        registryRevision: harness.snapshot.registryRevision,
        capabilityId: "tool.document.pptx.write",
      });
      const observation = await harness.backend.execute({
        lock: lock.lock,
        action: pptxWriteAction(workspace, "created/deck.pptx", 5262),
        effectAttemptId: entityId(5362),
        idempotencyKey: "document-worker:pptx-write",
        requestedAt: at,
        deadlineAt: futureDeadline(),
      }, new AbortController().signal);

      if (observation.outcome !== "succeeded") {
        throw new Error(JSON.stringify(observation, null, 2));
      }
      expect((await stat(join(workspace, "created", "deck.pptx"))).size).toBeGreaterThan(0);
      expect(observation).toMatchObject({
        outcome: "succeeded",
        output: {
          status: "succeeded",
          result: {
            format: "pptx",
            relativePath: "created/deck.pptx",
            slideCount: 1,
            mediaType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            presentationDigest: expect.stringMatching(/^[a-f0-9]{64}$/u),
          },
        },
      });
      expect(JSON.stringify(observation)).not.toContain(workspace);
      expect(JSON.stringify(observation)).not.toContain("Executive plan");
      expect(harness.backend.transmissions().at(-1)).toMatchObject({
        capabilityId: "tool.document.pptx.write",
        protocolVersion: "v1alpha2",
        requestDigest: expect.stringMatching(/^[a-f0-9]{64}$/u),
      });
    } finally {
      await harness.stop();
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("maps XLSX write target_exists to a typed detailCode before Worker dispatch", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "robothree-dwe2-xlsx-exists-"));
    const harness = await createHarness();
    try {
      await writeFile(join(workspace, "already.xlsx"), Buffer.from("existing"));
      const lock = await harness.lockService.resolveAndLock({
        taskId: ids.task,
        registryRevision: harness.snapshot.registryRevision,
        capabilityId: "tool.document.xlsx.write",
      });
      await expect(harness.backend.execute({
        lock: lock.lock,
        action: xlsxWriteAction(workspace, "already.xlsx", 5261),
        effectAttemptId: entityId(5361),
        idempotencyKey: "document-worker:xlsx-exists",
        requestedAt: at,
        deadlineAt: futureDeadline(),
      }, new AbortController().signal)).resolves.toMatchObject({
        outcome: "failed",
        error: {
          code: "document_worker.invalid_format",
          category: "validation",
          retryable: false,
          details: { detailCode: "target_exists" },
        },
      });
      expect(harness.backend.transmissions()).toEqual([]);
    } finally {
      await harness.stop();
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("maps PPTX write target_exists to a typed detailCode before Worker dispatch", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "robothree-ptx2-pptx-exists-"));
    const harness = await createHarness();
    try {
      await writeFile(join(workspace, "already.pptx"), Buffer.from("existing"));
      const lock = await harness.lockService.resolveAndLock({
        taskId: ids.task,
        registryRevision: harness.snapshot.registryRevision,
        capabilityId: "tool.document.pptx.write",
      });
      await expect(harness.backend.execute({
        lock: lock.lock,
        action: pptxWriteAction(workspace, "already.pptx", 5263),
        effectAttemptId: entityId(5363),
        idempotencyKey: "document-worker:pptx-exists",
        requestedAt: at,
        deadlineAt: futureDeadline(),
      }, new AbortController().signal)).resolves.toMatchObject({
        outcome: "failed",
        error: {
          code: "document_worker.invalid_format",
          category: "validation",
          retryable: false,
          details: { detailCode: "target_exists" },
        },
      });
      expect(harness.backend.transmissions()).toEqual([]);
    } finally {
      await harness.stop();
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("requires destructive confirmation before dispatching an XLSX overwrite", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "robothree-dwo2-xlsx-overwrite-"));
    const harness = await createHarness();
    try {
      const relativePath = "overwrite/report.xlsx";
      await mkdir(join(workspace, "overwrite"));
      const oldBytes = Buffer.from(makeXlsxFixture());
      const targetPath = join(workspace, "overwrite", "report.xlsx");
      await writeFile(targetPath, oldBytes);
      const confirmedOldSha256 = sha256(oldBytes);
      const action = xlsxWriteAction(workspace, relativePath, ids.action, {
        mode: "overwrite_existing",
        overwrite: { confirmedOldSha256 },
      });
      const execution = {
        taskId: ids.task,
        runId: ids.run,
        stepId: ids.step,
        registryRevision: harness.snapshot.registryRevision,
        capabilityId: "tool.document.xlsx.write",
        action,
        idempotencyKey: "document-worker:xlsx-overwrite-confirmed",
        authorization: { context: workspaceAuthorizationContext(workspace, relativePath, "modify") },
        riskFactKinds: ["destructive_file"] as const,
        deadlineAt: futureDeadline(),
      };

      const waiting = await harness.service.execute(execution);
      if (!("status" in waiting) || waiting.status !== "waiting_user_confirmation") {
        throw new Error(JSON.stringify(waiting, null, 2));
      }
      expect(waiting.request.scope.type).toBe("single_action");
      expect(JSON.stringify(waiting.request.scope)).not.toContain(workspace);
      expect(harness.backend.transmissions()).toEqual([]);
      expect(await readFile(targetPath)).toEqual(oldBytes);

      const confirmed = await harness.service.submitDecision({
        execution,
        confirmationId: waiting.request.confirmationId,
        decision: "confirmed",
        decidedByUserId: entityId(5197),
        decidedAt: at,
      });
      if ("status" in confirmed) {
        throw new Error(JSON.stringify(confirmed, null, 2));
      }
      const nextBytes = await readFile(targetPath);
      expect(nextBytes.equals(oldBytes)).toBe(false);
      expect(harness.backend.transmissions()).toHaveLength(1);
      expect(harness.backend.transmissions()[0]).toMatchObject({
        capabilityId: "tool.document.xlsx.write",
        protocolVersion: "v1alpha2",
        requestDigest: expect.stringMatching(/^[a-f0-9]{64}$/u),
      });
      expect(JSON.stringify(await harness.runtime.snapshot(ids.task))).not.toContain(workspace);
    } finally {
      await harness.stop();
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("fails closed on protocol mismatch before accepting work", async () => {
    const harness = await createHarness(fakeWorkerOptions("protocol_mismatch"));
    try {
      await expect(harness.backend.start()).rejects.toMatchObject({
        name: "DocumentWorkerBackendError",
        code: "document_worker.protocol_error",
      });
      await expect(harness.backend.health()).resolves.toMatchObject({ status: "unavailable" });
      expect(harness.backend.transmissions()).toEqual([]);
    } finally {
      await harness.stop();
    }
  });

  it("maps a Document Worker typed error to a failed Observation", async () => {
    const harness = await createHarness(fakeWorkerOptions("typed_error"));
    try {
      const lock = await harness.lockService.resolveAndLock({
        taskId: ids.task,
        registryRevision: harness.snapshot.registryRevision,
        capabilityId: "tool.document.pdf.extract_text",
      });
      await expect(harness.backend.execute({
        lock: lock.lock,
        action: documentAction("tool.document.pdf.extract_text", "/tmp", "missing.pdf", 5210),
        effectAttemptId: entityId(5310),
        idempotencyKey: "document-worker:typed-error",
        requestedAt: at,
        deadlineAt: futureDeadline(),
      }, new AbortController().signal)).resolves.toMatchObject({
        outcome: "failed",
        error: {
          code: "document_worker.limit_exceeded",
          category: "validation",
          retryable: false,
          details: { detailCode: "input_too_large" },
        },
      });
    } finally {
      await harness.stop();
    }
  });

  it("cancels an in-flight worker request and terminates the child", async () => {
    const harness = await createHarness(fakeWorkerOptions("hang_after_request"));
    try {
      const lock = await harness.lockService.resolveAndLock({
        taskId: ids.task,
        registryRevision: harness.snapshot.registryRevision,
        capabilityId: "tool.document.pdf.extract_text",
      });
      const controller = new AbortController();
      const result = harness.backend.execute({
        lock: lock.lock,
        action: documentAction("tool.document.pdf.extract_text", "/tmp", "slow.pdf", 5220),
        effectAttemptId: entityId(5320),
        idempotencyKey: "document-worker:cancel",
        requestedAt: at,
        deadlineAt: futureDeadline(),
      }, controller.signal);
      await waitUntil(() => harness.backend.transmissions().length === 1);
      controller.abort();
      await expect(result).resolves.toMatchObject({
        outcome: "cancelled",
        error: { category: "cancelled" },
      });
      await expect(harness.backend.health()).resolves.toMatchObject({ status: "unavailable" });
    } finally {
      await harness.stop();
    }
  });

  it("rejects direct concurrent calls instead of building an Adapter queue", async () => {
    const harness = await createHarness(fakeWorkerOptions("hang_after_request"));
    try {
      const lock = await harness.lockService.resolveAndLock({
        taskId: ids.task,
        registryRevision: harness.snapshot.registryRevision,
        capabilityId: "tool.document.pdf.extract_text",
      });
      const controller = new AbortController();
      const first = harness.backend.execute({
        lock: lock.lock,
        action: documentAction("tool.document.pdf.extract_text", "/tmp", "first.pdf", 5230),
        effectAttemptId: entityId(5330),
        idempotencyKey: "document-worker:first",
        requestedAt: at,
        deadlineAt: futureDeadline(),
      }, controller.signal);
      await waitUntil(() => harness.backend.transmissions().length === 1);
      await expect(harness.backend.execute({
        lock: lock.lock,
        action: documentAction("tool.document.pdf.extract_text", "/tmp", "second.pdf", 5231),
        effectAttemptId: entityId(5331),
        idempotencyKey: "document-worker:second",
        requestedAt: at,
        deadlineAt: futureDeadline(),
      }, new AbortController().signal)).rejects.toMatchObject({
        code: "document_worker.concurrent_execution",
        deliveryMayHaveOccurred: false,
      });
      controller.abort();
      await expect(first).resolves.toMatchObject({ outcome: "cancelled" });
    } finally {
      await harness.stop();
    }
  });

  it("keeps crash-after-request Effect dispatched for recovery", async () => {
    const harness = await createHarness(fakeWorkerOptions("crash_after_request"));
    try {
      await expect(harness.service.execute({
        taskId: ids.task,
        runId: ids.run,
        stepId: ids.step,
        registryRevision: harness.snapshot.registryRevision,
        capabilityId: "tool.document.pdf.extract_text",
        action: documentAction("tool.document.pdf.extract_text", "/tmp", "recover.pdf", ids.action),
        idempotencyKey: "document-worker:recover",
        deadlineAt: futureDeadline(),
      })).rejects.toBeInstanceOf(DocumentWorkerBackendError);
      expect(await harness.persistence.findEffectAttemptByIdempotencyKey("document-worker:recover"))
        .toMatchObject({ status: "dispatched" });
      const recoveryDecisions = await harness.recovery.recoverEffects();
      expect(recoveryDecisions).toMatchObject([
        { action: "recover_dispatched" },
      ]);
      const transmissions = harness.backend.transmissions();
      expect(transmissions).toHaveLength(2);
      expect(new Set(transmissions.map((item) => item.effectAttemptId)).size).toBe(1);
      expect(new Set(transmissions.map((item) => item.idempotencyKey))).toEqual(new Set(["document-worker:recover"]));
    } finally {
      await harness.stop();
    }
  });

  it("fails closed on invalid descriptor, payload and missing deadline", async () => {
    const harness = await createHarness(fakeWorkerOptions("normal"));
    try {
      const lock = await harness.lockService.resolveAndLock({
        taskId: ids.task,
        registryRevision: harness.snapshot.registryRevision,
        capabilityId: "tool.document.pdf.extract_text",
      });
      await expect(harness.backend.execute({
        lock: {
          ...lock.lock,
          adapterDescriptorSnapshot: {
            ...lock.lock.adapterDescriptorSnapshot,
            protocol: { name: "wrong", version: "v1alpha1" },
          },
        },
        action: documentAction("tool.document.pdf.extract_text", "/tmp", "a.pdf", 5250),
        effectAttemptId: entityId(5350),
        idempotencyKey: "document-worker:bad-descriptor",
        requestedAt: at,
        deadlineAt: futureDeadline(),
      }, new AbortController().signal)).rejects.toMatchObject({ code: "document_worker.invalid_request" });
      await expect(harness.backend.execute({
        lock: lock.lock,
        action: { actionId: entityId(5251), kind: "tool.document.pdf.extract_text", payload: { workspaceRoot: "/tmp" } },
        effectAttemptId: entityId(5351),
        idempotencyKey: "document-worker:bad-payload",
        requestedAt: at,
        deadlineAt: futureDeadline(),
      }, new AbortController().signal)).rejects.toMatchObject({ code: "document_worker.invalid_request" });
      await expect(harness.backend.execute({
        lock: lock.lock,
        action: documentAction("tool.document.pdf.extract_text", "/tmp", "a.pdf", 5252),
        effectAttemptId: entityId(5352),
        idempotencyKey: "document-worker:missing-deadline",
        requestedAt: at,
      }, new AbortController().signal)).rejects.toMatchObject({ code: "document_worker.invalid_request" });
    } finally {
      await harness.stop();
    }
  });

  it("fails closed before spawn when the trusted worker entry is not a JavaScript module", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "robothree-dtp4-worker-entry-"));
    try {
      const entry = join(workspace, "worker.txt");
      await writeFile(entry, "not executable JavaScript\n");

      expect(() => new DocumentWorkerToolBackend({
        adapterDescriptorId: DOCUMENT_TOOL_REGISTRY_RECORDS.descriptor.adapterDescriptorId,
        adapterDescriptorRevision: DOCUMENT_TOOL_REGISTRY_RECORDS.descriptor.revision,
        clock: new FakeClock(at),
        workerEntry: entry,
      })).toThrow("JavaScript module");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("resolves a trusted worker entry to its real file before spawning", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "robothree-dtp4-worker-realpath-"));
    try {
      const directory = join(workspace, "real");
      await mkdir(directory);
      const entry = join(directory, "worker.mjs");
      await writeFile(entry, "process.stdout.write('{\"type\":\"ready\",\"protocolVersion\":\"robothree.document-worker.v1\"}\\n');\n");

      await expect(realpath(entry)).resolves.toBe(resolveTrustedDocumentWorkerEntry(entry));
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});

async function createHarness(
  backendOptions: Partial<ConstructorParameters<typeof DocumentWorkerToolBackend>[0]> = {},
) {
  const clock = new FakeClock(at);
  const persistence = new InMemoryTaskPersistence(clock);
  await persistence.start();
  const harness = await createHarnessWithPersistence(persistence, backendOptions);
  return {
    ...harness,
    async stop() {
      await harness.backend.stop();
      await persistence.stop();
    },
  };
}

async function createHarnessWithPersistence(
  persistence: TaskPersistence,
  backendOptions: Partial<ConstructorParameters<typeof DocumentWorkerToolBackend>[0]> = {},
) {
  const clock = new FakeClock(at);
  const idGenerator = new FakeIdGenerator(Array.from({ length: 160 }, (_, index) => entityId(5400 + index)));
  const runtime = new DurableTaskRuntime({ persistence, idGenerator });
  const created = await runtime.createTask(initialization());
  if (!created.ok) {
    throw new Error(created.error.code);
  }
  await requireAccepted(runtime.dispatch(startRun()));
  await requireAccepted(runtime.dispatch(startStep()));
  const { records, snapshot } = documentCapabilityRegistry();
  const backend = new DocumentWorkerToolBackend({
    adapterDescriptorId: records.descriptor.adapterDescriptorId,
    adapterDescriptorRevision: records.descriptor.revision,
    clock,
    ...backendOptions,
  });
  const handles = new RuntimeAdapterHandles([backend]);
  const executor = new ToolEffectExecutor({
    adapterDescriptorId: records.descriptor.adapterDescriptorId,
    persistence,
    handles,
    clock,
  });
  const effects = new EffectCoordinator({
    runtime,
    persistence,
    clock,
    idGenerator,
    executors: [executor],
  });
  const lockService = new TaskCapabilityLockService({
    resolver: new CapabilityResolver(snapshot),
    persistence,
    clock,
    idGenerator,
  });
  return {
    persistence,
    runtime,
    records,
    snapshot,
    backend,
    lockService,
    service: new ToolExecutionService({
      lockService,
      effects,
      authorization: new AuthorizationEvaluator(),
      confirmations: new UserConfirmationCoordinator({ runtime, persistence, clock, idGenerator }),
      persistence,
      clock,
      idGenerator,
      admission: new RuntimeAdmissionController({ clock, scheduler: new FakeScheduler() }),
      defaultAuthorization: { context: trustedAuthorizationContext() },
    }),
    recovery: new TaskRecoveryCoordinator({ persistence, effects }),
  };
}

function documentCapabilityRegistry() {
  const builder = registerDocumentToolRecords(new RegistryBuilder({
    trustedSources: [DOCUMENT_TOOL_REGISTRY_RECORDS.descriptor.source],
  }));
  const snapshot = builder.finalize();
  return { records: DOCUMENT_TOOL_REGISTRY_RECORDS, snapshot };
}

function tableRuns(
  rows: readonly (readonly string[])[],
  startY = 720,
): { text: string; x: number; y: number }[] {
  const xs = [72, 180, 300, 420];
  const runs: { text: string; x: number; y: number }[] = [];
  rows.forEach((row, rowIndex) => {
    row.forEach((cell, columnIndex) => {
      const x = xs[columnIndex];
      if (x === undefined) {
        throw new Error("Fixture supports up to four columns");
      }
      runs.push({ text: cell, x, y: startY - (rowIndex * 22) });
    });
  });
  return runs;
}

function initialization(): TaskInitialization {
  return {
    taskId: ids.task,
    agentDefinition: { agentDefinitionId: ids.agent, version: "1.0.0" },
    goal: "Verify the trusted Document Worker execution boundary",
    createdAt: at,
  };
}

function startRun(): TaskCommand {
  return {
    commandId: ids.startRun,
    taskId: ids.task,
    type: "start_run",
    issuedAt: at,
    runId: ids.run,
  };
}

function startStep(): TaskCommand {
  return {
    commandId: ids.startStep,
    taskId: ids.task,
    type: "start_step",
    issuedAt: at,
    runId: ids.run,
    stepId: ids.step,
    planRevision: { executionPlanId: ids.plan, planRevisionId: ids.planRevision, revision: 1 },
    action: documentAction("tool.document.pdf.extract_text", "/tmp", "sample.pdf", ids.action),
  };
}

function trustedAuthorizationContext(): ToolAuthorizationContext {
  return {
    schemaVersion: CONTRACT_VERSION,
    subject: {
      schemaVersion: CONTRACT_VERSION,
      userId: entityId(5197),
      activeConfigRevision: "test-config-v1",
      canUseTools: true,
      assignedToolCapabilityIds: [...DOCUMENT_TOOL_CAPABILITY_IDS],
      grants: [],
    },
    resourceAccesses: [],
    availability: { enabled: true, healthy: true, credentialAvailable: true, revision: "test-health-v1" },
  };
}

function documentAction(
  capabilityId: DocumentCapability,
  workspaceRoot: string,
  relativePath: string,
  actionIdSeed: number | string,
) {
  return {
    actionId: typeof actionIdSeed === "number" ? entityId(actionIdSeed) : actionIdSeed,
    kind: capabilityId,
    payload: {
      workspaceRoot,
      relativePath,
      options: {},
      limits: defaultLimits(),
    },
  };
}

function xlsxWriteAction(
  workspaceRoot: string,
  relativePath: string,
  actionIdSeed: number | string,
  overwrite?: {
    mode: "overwrite_existing";
    overwrite: { confirmedOldSha256: string };
  },
) {
  return {
    actionId: typeof actionIdSeed === "number" ? entityId(actionIdSeed) : actionIdSeed,
    kind: "tool.document.xlsx.write",
    payload: {
      workspaceRoot,
      relativePath,
      ...(overwrite === undefined ? {} : overwrite),
      workbook: {
        sheets: [{
          name: "Report",
          rows: [
            {
              rowNumber: 1,
              cells: [
                { column: "A", type: "string", value: "Name" },
                { column: "B", type: "string", value: "=literal text" },
              ],
            },
            {
              rowNumber: 2,
              cells: [
                { column: "A", type: "number", value: 42 },
              ],
            },
          ],
        }],
      },
      options: {},
      limits: defaultLimits(),
    },
  };
}

function pptxWriteAction(
  workspaceRoot: string,
  relativePath: string,
  actionIdSeed: number | string,
) {
  return {
    actionId: typeof actionIdSeed === "number" ? entityId(actionIdSeed) : actionIdSeed,
    kind: "tool.document.pptx.write",
    payload: {
      workspaceRoot,
      relativePath,
      mode: "create_new",
      presentation: {
        title: "Executive plan",
        layout: "wide",
        templateRef: "robothree.default",
        slides: [{
          title: "Overview",
          elements: [{
            type: "text",
            text: "Executive plan",
            x: 0.8,
            y: 1.1,
            w: 5,
            h: 0.8,
            style: { fontSize: 20, bold: true, color: "111827", align: "left" },
          }],
        }],
      },
      options: {},
      limits: {
        ...defaultLimits(),
        maxOutputBytes: 8 * 1024 * 1024,
      },
    },
  };
}

function workspaceAuthorizationContext(
  workspaceRoot: string,
  relativePath: string,
  operation: "create" | "modify",
): ToolAuthorizationContext {
  const grantId = entityId(5198);
  return {
    schemaVersion: CONTRACT_VERSION,
    subject: {
      schemaVersion: CONTRACT_VERSION,
      userId: entityId(5197),
      activeConfigRevision: "test-config-dwo2",
      canUseTools: true,
      assignedToolCapabilityIds: ["tool.document.xlsx.write"],
      grants: [{
        schemaVersion: CONTRACT_VERSION,
        grantId,
        kind: "workspace",
        rootRealPath: workspaceRoot,
        operations: [operation],
      }],
    },
    resourceAccesses: [{
      grantId,
      targetRealPath: join(workspaceRoot, relativePath),
      operation,
      protectedResource: false,
    }],
    availability: { enabled: true, healthy: true, credentialAvailable: true, revision: "test-health-dwo2" },
  };
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function defaultLimits() {
  return {
    maxFileBytes: 4 * 1024 * 1024,
    maxOutputBytes: 256 * 1024,
    maxPageCount: 50,
    maxDecompressionRatio: 200,
  };
}

function fakeWorkerOptions(scenario: string) {
  const fixture = fileURLToPath(new URL("./fixtures/document-worker-harness-child.mjs", import.meta.url));
  return {
    workerEntry: fixture,
    workerArgs: [`--scenario=${scenario}`],
  };
}

function futureDeadline(): string {
  return new Date(Date.now() + 30_000).toISOString();
}

async function requireAccepted(resultPromise: ReturnType<DurableTaskRuntime["dispatch"]>): Promise<void> {
  const result = await resultPromise;
  if (!result.accepted) {
    throw new Error(result.error.code);
  }
}

async function waitUntil(predicate: () => boolean, timeoutMs = 1_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error("condition was not met before timeout");
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 5));
  }
}
