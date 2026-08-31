import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { JsonValueSchema, type TaskInitialization } from "@robothree/contracts";
import { afterEach, describe, expect, it } from "vitest";

import { FakeClock } from "../src/adapters/fake/fake-clock.js";
import { FakeIdGenerator } from "../src/adapters/fake/fake-id-generator.js";
import { InMemoryModelInvocationLinkPersistence } from
  "../src/adapters/memory/in-memory-model-invocation-link-persistence.js";
import { SqliteModelInvocationLinkPersistence } from
  "../src/adapters/sqlite/sqlite-model-invocation-link-persistence.js";
import { SqliteTaskPersistence } from
  "../src/adapters/sqlite/sqlite-task-persistence.js";
import { calculateDynamicRequestFactsDigest } from
  "../src/application/dynamic-request-facts.js";
import { DurableTaskRuntime } from
  "../src/application/durable-task-runtime.js";
import {
  calculateModelInvocationLinkDigest,
  samePreparedModelInvocationLink,
} from "../src/application/model-invocation-link-digest.js";
import { sha256CanonicalJson } from "../src/persistence/digest.js";
import {
  LegacyModelInvocationLinkSchema,
  ModelInvocationLinkV2Schema,
  type PrepareModelInvocationLinkInput,
  validateModelInvocationLink,
} from "../src/ports/model-invocation-link-persistence.js";

const directories: string[] = [];
const createdAt = "2026-08-30T00:00:00.000Z";
const deadlineAt = "2026-08-30T00:05:00.000Z";

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })));
});

describe("VS2.3 repair.2 invocation deadline authority", () => {
  it("keeps strict legacy and v2 historical reads additive and includes deadline in record digest", () => {
    const historicalV2 = prepareInput();
    const parsedV2 = ModelInvocationLinkV2Schema.parse(withRecordDigest(historicalV2));
    expect(parsedV2.providerRequestDeadlineAt).toBeUndefined();
    expect(() => ModelInvocationLinkV2Schema.parse({
      ...withRecordDigest(historicalV2),
      unknownDeadlineAuthority: true,
    })).toThrow();
    const historicalLegacy = prepareLegacyInput();
    const parsedLegacy = LegacyModelInvocationLinkSchema.parse(
      withRecordDigest(historicalLegacy),
    );
    expect(parsedLegacy.providerRequestDeadlineAt).toBeUndefined();
    expect(() => LegacyModelInvocationLinkSchema.parse({
      ...withRecordDigest(historicalLegacy),
      unknownDeadlineAuthority: true,
    })).toThrow();

    expect(withRecordDigest(prepareInput(deadlineAt)).recordDigest)
      .not.toBe(withRecordDigest(historicalV2).recordDigest);
    expect(withRecordDigest(prepareLegacyInput(deadlineAt)).recordDigest)
      .not.toBe(withRecordDigest(historicalLegacy).recordDigest);
  });

  it.each(["legacy", "v2"] as const)(
    "compares absent, present, one-sided, and drifting %s deadline facts exactly",
    (version) => {
      const prepare = version === "legacy" ? prepareLegacyInput : prepareInput;
      const historical = prepare();
      const current = prepare(deadlineAt);
      expect(samePreparedModelInvocationLink(withRecordDigest(historical), historical)).toBe(true);
      expect(samePreparedModelInvocationLink(withRecordDigest(current), current)).toBe(true);
      expect(samePreparedModelInvocationLink(withRecordDigest(historical), current)).toBe(false);
      expect(samePreparedModelInvocationLink(withRecordDigest(current), historical)).toBe(false);
      expect(samePreparedModelInvocationLink(
        withRecordDigest(current),
        prepare("2026-08-30T00:05:00.001Z"),
      )).toBe(false);
    },
  );

  it("round-trips the exact legacy deadline through the in-memory adapter", async () => {
    const persistence = new InMemoryModelInvocationLinkPersistence();
    await persistence.start();
    const prepared = await persistence.prepare(prepareLegacyInput(deadlineAt));
    expect(prepared.ok && prepared.value.providerRequestDeadlineAt).toBe(deadlineAt);
    expect((await persistence.loadRound(id(1), id(2), 2))?.providerRequestDeadlineAt)
      .toBe(deadlineAt);
  });

  it("round-trips the exact deadline through the in-memory adapter", async () => {
    const persistence = new InMemoryModelInvocationLinkPersistence();
    await persistence.start();
    const prepared = await persistence.prepare(prepareInput(deadlineAt));
    expect(prepared.ok && prepared.value.providerRequestDeadlineAt).toBe(deadlineAt);
    expect((await persistence.loadRound(id(1), id(2), 2))?.providerRequestDeadlineAt)
      .toBe(deadlineAt);
  });

  it("round-trips the exact deadline through SQLite record_json without migration", async () => {
    const directory = await mkdtemp(join(tmpdir(), "robothree-vs23-deadline-"));
    directories.push(directory);
    const databasePath = join(directory, "core.sqlite");
    await createTask(databasePath);
    let persistence = new SqliteModelInvocationLinkPersistence({
      databasePath,
      clock: new FakeClock(createdAt),
    });
    await persistence.start();
    expect((await persistence.prepare(prepareLegacyInput(deadlineAt))).ok).toBe(true);
    await persistence.stop();

    persistence = new SqliteModelInvocationLinkPersistence({
      databasePath,
      clock: new FakeClock(createdAt),
    });
    await persistence.start();
    expect((await persistence.loadRound(id(1), id(2), 2))?.providerRequestDeadlineAt)
      .toBe(deadlineAt);
    await persistence.stop();
  });
});

function prepareInput(
  providerRequestDeadlineAt?: string,
): PrepareModelInvocationLinkInput {
  const factsMaterial = {
    schemaVersion: "v1" as const,
    invocationKind: "main" as const,
    invocationSubjectId: id(10),
    currentTime: createdAt,
    locale: "zh-CN",
    timezone: "Asia/Shanghai",
    sourceRevision: digest({ source: 1 }),
  };
  return {
    schemaVersion: "v2",
    taskId: id(1),
    runId: id(2),
    stepId: id(3),
    actionId: id(4),
    round: 2,
    runtimeSelectionDigest: digest({ selection: 1 }),
    assistantMessageId: id(5),
    modelRequestId: id(6),
    modelRequestDigest: digest({ request: 1 }),
    confirmationId: id(7),
    scopeDigest: digest({ scope: 1 }),
    dataScopeDigest: digest({ dataScope: 1 }),
    clientRequestId: id(8),
    centralAcceptRequestDigest: digest({ accept: 1 }),
    ...(providerRequestDeadlineAt === undefined ? {} : { providerRequestDeadlineAt }),
    dynamicRequestFacts: {
      ...factsMaterial,
      factsDigest: calculateDynamicRequestFactsDigest(factsMaterial),
    },
    contextAssemblyReceiptDigest: digest({ receipt: 1 }),
    createdAt,
  };
}

function prepareLegacyInput(
  providerRequestDeadlineAt?: string,
): PrepareModelInvocationLinkInput {
  const {
    schemaVersion: _schemaVersion,
    dynamicRequestFacts: _dynamicRequestFacts,
    contextAssemblyReceiptDigest: _contextAssemblyReceiptDigest,
    ...legacy
  } = prepareInput(providerRequestDeadlineAt);
  return legacy;
}

function withRecordDigest(input: PrepareModelInvocationLinkInput) {
  const material = { ...input, updatedAt: input.createdAt };
  return validateModelInvocationLink({
    ...material,
    recordDigest: calculateModelInvocationLinkDigest(material),
  });
}

async function createTask(databasePath: string): Promise<void> {
  const persistence = new SqliteTaskPersistence({
    databasePath,
    clock: new FakeClock(createdAt),
  });
  await persistence.start();
  const runtime = new DurableTaskRuntime({
    persistence,
    idGenerator: new FakeIdGenerator([id(20)]),
  });
  const initialization: TaskInitialization = {
    taskId: id(1),
    agentDefinition: { agentDefinitionId: id(21), version: "1.0.0" },
    goal: "VS2.3 deadline authority round-trip",
    createdAt,
  };
  const created = await runtime.createTask(initialization);
  if (!created.ok) throw new Error(created.error.code);
  await persistence.stop();
}

function id(value: number): string {
  return `019f7d10-0000-7000-8000-${value.toString().padStart(12, "0")}`;
}

function digest(value: unknown): string {
  return sha256CanonicalJson(JsonValueSchema.parse(value));
}
