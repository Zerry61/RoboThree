import { z } from "zod";

import { EntityIdSchema } from "../../../common/identifiers.js";
import { DesktopResourceIdSchema, TimestampSchema } from "../../v1alpha1/common.js";

export const TASK_REASONING_CONTRACT_VERSION_V1ALPHA1 =
  "task-reasoning.v1alpha1" as const;

export const GetTaskReasoningModeQueryV1Alpha1Schema = z.object({
  contractVersion: z.literal(TASK_REASONING_CONTRACT_VERSION_V1ALPHA1),
  queryId: EntityIdSchema,
  correlationId: EntityIdSchema,
  clientInstanceId: EntityIdSchema,
  type: z.literal("get_task_reasoning_mode"),
  taskId: DesktopResourceIdSchema,
}).strict();

export const TaskReasoningModeProjectionV1Alpha1Schema = z.discriminatedUnion(
  "state",
  [
    z.object({
      state: z.literal("available"),
      taskId: DesktopResourceIdSchema,
      requestedMode: z.enum(["default", "max"]),
      resolvedMode: z.enum(["model_default", "max"]),
      resolutionReason: z.enum([
        "requested_default",
        "applied",
        "unsupported",
        "capability_unknown",
        "support_changed_default",
        "mapping_unavailable_default",
      ]),
      acceptedAt: TimestampSchema,
    }).strict(),
    z.object({
      state: z.literal("legacy"),
      taskId: DesktopResourceIdSchema,
      safeSummary: z.literal("该任务创建时未记录 Max 推理摘要"),
    }).strict(),
  ],
);

export const TaskReasoningErrorEnvelopeV1Alpha1Schema = z.object({
  contractVersion: z.literal(TASK_REASONING_CONTRACT_VERSION_V1ALPHA1),
  code: z.enum([
    "contract.invalid",
    "contract.feature_unavailable",
    "reasoning.runtime_changed",
    "reasoning.client_mismatch",
    "task_reasoning.not_found",
    "task_reasoning.integrity_invalid",
    "internal",
  ]),
  category: z.enum([
    "validation",
    "availability",
    "compatibility",
    "conflict",
    "internal",
  ]),
  safeSummary: z.string().min(1).max(512),
  retryable: z.boolean(),
  correlationId: EntityIdSchema,
}).strict();

export type GetTaskReasoningModeQueryV1Alpha1 = z.infer<
  typeof GetTaskReasoningModeQueryV1Alpha1Schema
>;
export type TaskReasoningModeProjectionV1Alpha1 = z.infer<
  typeof TaskReasoningModeProjectionV1Alpha1Schema
>;
export type TaskReasoningErrorEnvelopeV1Alpha1 = z.infer<
  typeof TaskReasoningErrorEnvelopeV1Alpha1Schema
>;
