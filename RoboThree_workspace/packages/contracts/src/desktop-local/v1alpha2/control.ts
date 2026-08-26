import { z } from "zod";

import {
  DesktopLocalContractVersionV1Alpha2Schema,
  DesktopLocalNegotiatedVersionSchema,
  DesktopResourceIdSchema,
} from "./common.js";
import {
  EnterpriseConfigurationActivationStateSchema,
} from "./enterprise-configuration.js";

export const DesktopFeatureV1Alpha2Schema = z.enum([
  "workspace",
  "session",
  "catalog",
  "submit_turn",
  "durable_event_stream",
  "enterprise_configuration_status",
  "task_workspace_browser",
  "task_workspace_reveal",
  "robot_tool_catalog",
]);

export const CompatibilityQueryV1Alpha2Schema = z.object({
  contractVersion: DesktopLocalContractVersionV1Alpha2Schema,
  queryId: z.string().uuid(),
  correlationId: z.string().uuid(),
  clientInstanceId: z.string().uuid(),
  supportedContractVersions: z.array(
    DesktopLocalNegotiatedVersionSchema,
  ).min(1).max(8),
}).strict();

const ActivationCompatibilityFields = {
  activationState: EnterpriseConfigurationActivationStateSchema,
  pendingRuntimeActivation: z.boolean(),
  enterpriseConfigurationStatusQueryRef: z.string().min(1).max(512),
};

function requireDerivedPendingRuntimeActivation(
  value: { activationState: z.infer<typeof EnterpriseConfigurationActivationStateSchema>;
    pendingRuntimeActivation: boolean },
  context: z.RefinementCtx,
): void {
  if (value.pendingRuntimeActivation
    !== (value.activationState === "pending_restart")) {
    context.addIssue({
      code: "custom",
      path: ["pendingRuntimeActivation"],
      message: "pendingRuntimeActivation must be derived from activationState",
    });
  }
}

export const CompatibilityProjectionV1Alpha2Schema = z.object({
  contractVersion: DesktopLocalContractVersionV1Alpha2Schema,
  coreVersion: z.string().min(1).max(64),
  supportedContractVersions: z.array(
    DesktopLocalNegotiatedVersionSchema,
  ).min(1).max(8),
  selectedContractVersion: DesktopLocalContractVersionV1Alpha2Schema,
  features: z.array(DesktopFeatureV1Alpha2Schema).max(32),
  runtimeInstanceId: DesktopResourceIdSchema,
  ...ActivationCompatibilityFields,
}).strict().superRefine((value, context) => {
  requireDerivedPendingRuntimeActivation(value, context);
  if (!value.features.includes("enterprise_configuration_status")) {
    context.addIssue({
      code: "custom",
      path: ["features"],
      message: "v1alpha2 requires enterprise_configuration_status feature",
    });
  }
});

export const RuntimeStatusProjectionV1Alpha2Schema = z.object({
  contractVersion: DesktopLocalContractVersionV1Alpha2Schema,
  status: z.enum(["starting", "ready", "stopping", "failed"]),
  runtimeInstanceId: DesktopResourceIdSchema,
  ...ActivationCompatibilityFields,
}).strict().superRefine(requireDerivedPendingRuntimeActivation);

export type CompatibilityProjectionV1Alpha2 = z.infer<
  typeof CompatibilityProjectionV1Alpha2Schema
>;
export type CompatibilityQueryV1Alpha2 = z.infer<
  typeof CompatibilityQueryV1Alpha2Schema
>;
export type RuntimeStatusProjectionV1Alpha2 = z.infer<
  typeof RuntimeStatusProjectionV1Alpha2Schema
>;
