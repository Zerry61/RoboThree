import { describe, expect, it, vi } from "vitest";

import { TaskReasoningModeProjectionService } from
  "../src/application/task-reasoning-mode-projection-service.js";
import type { SubmitTurnPersistence } from "../src/ports/submit-turn-persistence.js";
import type { TaskPersistence } from "../src/ports/task-persistence.js";

const uuid = "019f7447-a784-47b2-a716-ce42b07e4818";
const query = {
  contractVersion: "task-reasoning.v1alpha1" as const,
  queryId: uuid,
  correlationId: uuid,
  clientInstanceId: uuid,
  type: "get_task_reasoning_mode" as const,
  taskId: `task:${uuid}`,
};

describe("DFI-5.4.3 Task reasoning projection", () => {
  it("returns not found without consulting current reasoning authorities", async () => {
    const loadBinding = vi.fn(async () => undefined);
    const service = createService({ loadBinding });
    await expect(service.get(query)).resolves.toEqual({
      ok: false,
      code: "task_reasoning.not_found",
    });
    expect(loadBinding).toHaveBeenCalledOnce();
  });

  it("projects historical records as legacy without inventing default", async () => {
    const loadRecord = vi.fn(async () => ({
      schemaVersion: "v1alpha4",
      internalTaskId: uuid,
    }));
    const service = createService({ loadRecord });
    await expect(service.get(query)).resolves.toEqual({
      ok: true,
      value: {
        state: "legacy",
        taskId: `task:${uuid}`,
        safeSummary: "该任务创建时未记录 Max 推理摘要",
      },
    });
    expect(loadRecord).toHaveBeenCalledOnce();
  });

  it("fails closed when a v1alpha5 record lacks its durable envelope", async () => {
    const loadEnvelope = vi.fn(async () => undefined);
    const loadReceipt = vi.fn(async () => undefined);
    const service = createService({
      loadRecord: vi.fn(async () => ({
        schemaVersion: "v1alpha5",
        internalTaskId: uuid,
      })),
      loadEnvelope,
      loadReceipt,
    });
    await expect(service.get(query)).resolves.toEqual({
      ok: false,
      code: "task_reasoning.integrity_invalid",
    });
    expect(loadEnvelope).toHaveBeenCalledOnce();
    expect(loadReceipt).toHaveBeenCalledOnce();
  });
});

function createService(overrides: Readonly<{
  loadBinding?: () => Promise<unknown>;
  loadRecord?: () => Promise<unknown>;
  loadEnvelope?: () => Promise<unknown>;
  loadReceipt?: () => Promise<unknown>;
}>): TaskReasoningModeProjectionService {
  const binding = {
    taskId: uuid,
    submitTurnCommandId: uuid,
    runtimeSelectionId: uuid,
  };
  const tasks = {
    loadSubmitTurnBindingByTaskId: overrides.loadBinding
      ?? vi.fn(async () => binding),
  } as unknown as TaskPersistence;
  const coordination = {
    loadRecord: overrides.loadRecord ?? vi.fn(async () => undefined),
    loadDfi541Envelope: overrides.loadEnvelope ?? vi.fn(async () => undefined),
    loadReceipt: overrides.loadReceipt ?? vi.fn(async () => undefined),
  } as unknown as SubmitTurnPersistence;
  return new TaskReasoningModeProjectionService({ tasks, coordination });
}
