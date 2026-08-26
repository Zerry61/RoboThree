import { describe, expect, it } from "vitest";

import {
  FakeToolCatalogProvider,
  FakeToolExecutionBackend,
  RuntimeAdapterHandleError,
  RuntimeAdapterHandles,
} from "../src/index.js";
import type { ToolExecutionBackend } from "../src/index.js";
import { capabilityLock, capabilityRecords } from "./capability.fixtures.js";

const action = {
  actionId: "019f7447-a784-77b2-a716-000000003211",
  kind: "tool.echo",
  payload: { value: "hello" },
};
const requestedAt = "2026-07-21T01:10:00.000Z";

describe("ToolCatalogProvider conformance", () => {
  it("returns a deterministic schema-valid catalog copy", async () => {
    const records = capabilityRecords();
    const provider = new FakeToolCatalogProvider({
      adapterDescriptorId: "adapter.tool.catalog.fake",
      adapterDescriptorRevision: `sha256:${"c".repeat(64)}`,
      definitions: [records.definition],
    });
    const first = await provider.list();
    const second = await provider.list();
    expect(second).toEqual(first);
    expect(first).not.toBe(second);
    expect(first).toMatchObject([{ capabilityId: "tool.echo", kind: "tool" }]);
  });
});

describe("ToolExecutionBackend conformance", () => {
  const variants = [
    "adapter.tool.fake.primary",
    "adapter.tool.fake.secondary",
  ] as const;

  it.each(variants)("executes a locked Action as a typed Observation: %s", async (adapterId) => {
    const lock = capabilityLock({}, adapterId);
    const backend = new FakeToolExecutionBackend({
      adapterDescriptorId: adapterId,
      adapterDescriptorRevision: lock.adapterDescriptorSnapshot.revision,
    });
    await expect(execute(backend, lock)).resolves.toMatchObject({
      actionId: action.actionId,
      outcome: "succeeded",
      output: action.payload,
    });
    expect(backend.calls).toHaveLength(1);
  });

  it("maps cancellation and an expired deadline to typed terminal observations", async () => {
    const lock = capabilityLock();
    const backend = new FakeToolExecutionBackend({
      adapterDescriptorId: lock.adapterDescriptorSnapshot.adapterDescriptorId,
      adapterDescriptorRevision: lock.adapterDescriptorSnapshot.revision,
    });
    const cancelled = new AbortController();
    cancelled.abort();
    await expect(backend.execute({
      lock,
      action,
      effectAttemptId: "019f7447-a784-77b2-a716-000000003213",
      idempotencyKey: "tool:test:cancel",
      requestedAt,
    }, cancelled.signal)).resolves.toMatchObject({ outcome: "cancelled" });
    await expect(backend.execute({
      lock,
      action,
      effectAttemptId: "019f7447-a784-77b2-a716-000000003214",
      idempotencyKey: "tool:test:timeout",
      requestedAt,
      deadlineAt: requestedAt,
    }, new AbortController().signal)).resolves.toMatchObject({ outcome: "timed_out" });
    expect(backend.calls).toHaveLength(0);
  });

  it("preserves a backend failure as a typed failed Observation", async () => {
    const lock = capabilityLock();
    const backend = new FakeToolExecutionBackend({
      adapterDescriptorId: lock.adapterDescriptorSnapshot.adapterDescriptorId,
      adapterDescriptorRevision: lock.adapterDescriptorSnapshot.revision,
      handler: (request) => ({
        observationId: "019f7447-a784-77b2-a716-000000003212",
        actionId: request.action.actionId,
        observedAt: request.requestedAt,
        outcome: "failed",
        error: {
          code: "tool.fake_failure",
          category: "provider",
          message: "Fake backend rejected the Action",
          retryable: false,
        },
      }),
    });
    await expect(execute(backend, lock)).resolves.toMatchObject({
      outcome: "failed",
      error: { code: "tool.fake_failure" },
    });
  });

  it("rejects a Runtime Handle whose exact descriptor revision drifted", () => {
    const lock = capabilityLock();
    const backend = new FakeToolExecutionBackend({
      adapterDescriptorId: lock.adapterDescriptorSnapshot.adapterDescriptorId,
      adapterDescriptorRevision: `sha256:${"f".repeat(64)}`,
    });
    const handles = new RuntimeAdapterHandles([backend]);
    expect(() => handles.toolExecutionBackend(
      lock.adapterDescriptorSnapshot.adapterDescriptorId,
      lock.adapterDescriptorSnapshot.revision,
    )).toThrow(RuntimeAdapterHandleError);
  });
});

async function execute(backend: ToolExecutionBackend, lock: ReturnType<typeof capabilityLock>) {
  return backend.execute({
    lock,
    action,
    effectAttemptId: "019f7447-a784-77b2-a716-000000003215",
    idempotencyKey: `tool:test:${backend.adapterDescriptorId}`,
    requestedAt,
  }, new AbortController().signal);
}
