import { describe, expect, it } from "vitest";

import {
  ActionSchema,
  ObservationSchema,
  TaskCommandSchema,
  TaskRunStateSchema,
} from "../src/index.js";

const ids = {
  task: "019f7447-a784-77b2-a716-000000000001",
  run: "019f7447-a784-77b2-a716-000000000002",
  step: "019f7447-a784-77b2-a716-000000000003",
  action: "019f7447-a784-77b2-a716-000000000004",
  observation: "019f7447-a784-77b2-a716-000000000005",
  command: "019f7447-a784-77b2-a716-000000000006",
  agent: "019f7447-a784-77b2-a716-000000000007",
  plan: "019f7447-a784-77b2-a716-000000000008",
  planRevision: "019f7447-a784-77b2-a716-000000000009",
};

const timestamp = "2026-07-20T12:00:00.000Z";

describe("runtime contracts", () => {
  it("accepts JSON-compatible actions and rejects executable payload values", () => {
    expect(
      ActionSchema.parse({
        actionId: ids.action,
        kind: "model.generate",
        payload: { prompt: "hello", options: { temperature: 0 }, tags: ["qa"] },
      }),
    ).toBeDefined();

    expect(() =>
      ActionSchema.parse({ actionId: ids.action, kind: "invalid", payload: { execute: () => undefined } }),
    ).toThrow();
  });

  it("requires cancellation and timeout observations to carry matching error categories", () => {
    expect(() =>
      ObservationSchema.parse({
        observationId: ids.observation,
        actionId: ids.action,
        observedAt: timestamp,
        outcome: "timed_out",
        error: {
          code: "provider.failed",
          category: "provider",
          message: "wrong category",
          retryable: true,
        },
      }),
    ).toThrow("timed_out observation requires a timeout error");
  });

  it("validates versioned start-step commands", () => {
    expect(
      TaskCommandSchema.parse({
        commandId: ids.command,
        taskId: ids.task,
        issuedAt: timestamp,
        type: "start_step",
        runId: ids.run,
        stepId: ids.step,
        planRevision: {
          executionPlanId: ids.plan,
          planRevisionId: ids.planRevision,
          revision: 1,
        },
        action: { actionId: ids.action, kind: "model.generate", payload: {} },
      }),
    ).toBeDefined();
  });

  it("rejects structurally inconsistent waiting state", () => {
    expect(() =>
      TaskRunStateSchema.parse({
        taskId: ids.task,
        agentDefinition: { agentDefinitionId: ids.agent, version: "1.0.0" },
        goal: "test",
        status: "waiting",
        revision: 2,
        activeRunId: ids.run,
        createdAt: timestamp,
        updatedAt: timestamp,
        runs: [
          {
            runId: ids.run,
            attempt: 1,
            status: "waiting",
            activeStepId: ids.step,
            startedAt: timestamp,
            updatedAt: timestamp,
            steps: [
              {
                stepId: ids.step,
                sequence: 1,
                status: "waiting",
                planRevision: {
                  executionPlanId: ids.plan,
                  planRevisionId: ids.planRevision,
                  revision: 1,
                },
                action: { actionId: ids.action, kind: "model.generate", payload: {} },
                startedAt: timestamp,
                updatedAt: timestamp,
              },
            ],
          },
        ],
      }),
    ).toThrow("only a waiting step can contain wait state");
  });

  it("requires every later Run to retry the immediately previous Run", () => {
    const terminalError = {
      code: "provider.failed",
      category: "provider",
      message: "failed",
      retryable: true,
    } as const;
    expect(() =>
      TaskRunStateSchema.parse({
        taskId: ids.task,
        agentDefinition: { agentDefinitionId: ids.agent, version: "1.0.0" },
        goal: "test retry chain",
        status: "running",
        revision: 2,
        activeRunId: "019f7447-a784-77b2-a716-000000000010",
        createdAt: timestamp,
        updatedAt: timestamp,
        runs: [
          {
            runId: ids.run,
            attempt: 1,
            status: "failed",
            steps: [],
            terminalError,
            startedAt: timestamp,
            updatedAt: timestamp,
            endedAt: timestamp,
          },
          {
            runId: "019f7447-a784-77b2-a716-000000000010",
            attempt: 2,
            status: "running",
            steps: [],
            startedAt: timestamp,
            updatedAt: timestamp,
          },
        ],
      }),
    ).toThrow("every later run must retry the immediately previous run");
  });
});
