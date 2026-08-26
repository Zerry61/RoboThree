import { z } from "zod";

import {
  DesktopResourceIdSchema,
  DesktopTypedErrorCodeSchema,
  DesktopLocalContractVersionV1Alpha2Schema,
  EnterpriseConfigurationRevisionSchema,
  EntityIdSchema,
  TimestampSchema,
} from "./common.js";

export const EnterpriseConfigurationSyncStateSchema = z.enum([
  "idle",
  "syncing",
  "failed",
]);

export const EnterpriseConfigurationActivationStateSchema = z.enum([
  "uninitialized",
  "current",
  "pending_restart",
  "activation_failed",
]);

export const EnterpriseConfigurationStatusQuerySchema = z.object({
  contractVersion: DesktopLocalContractVersionV1Alpha2Schema,
  queryId: EntityIdSchema,
  correlationId: EntityIdSchema,
  clientInstanceId: EntityIdSchema,
  type: z.literal("enterprise_configuration_status_query"),
}).strict();

export const EnterpriseConfigurationStatusProjectionSchema = z.object({
  contractVersion: DesktopLocalContractVersionV1Alpha2Schema,
  syncState: EnterpriseConfigurationSyncStateSchema,
  activationState: EnterpriseConfigurationActivationStateSchema,
  storageActiveRevision: EnterpriseConfigurationRevisionSchema.optional(),
  runtimeActiveRevision: EnterpriseConfigurationRevisionSchema.optional(),
  lastSuccessfulSyncAt: TimestampSchema.optional(),
  lastErrorCode: DesktopTypedErrorCodeSchema.optional(),
}).strict().superRefine((value, context) => {
  if (value.activationState === "uninitialized"
    && (value.storageActiveRevision !== undefined
      || value.runtimeActiveRevision !== undefined)) {
    context.addIssue({
      code: "custom",
      message: "uninitialized configuration cannot expose active revisions",
    });
  }
  if (value.activationState === "current"
    && (value.storageActiveRevision === undefined
      || value.runtimeActiveRevision === undefined
      || value.storageActiveRevision !== value.runtimeActiveRevision)) {
    context.addIssue({
      code: "custom",
      message: "current configuration requires matching storage/runtime revisions",
    });
  }
  if ((value.activationState === "pending_restart"
      || value.activationState === "activation_failed")
    && value.storageActiveRevision === undefined) {
    context.addIssue({
      code: "custom",
      message: "pending or failed activation requires a storage-active revision",
    });
  }
});

export const EnterpriseConfigurationStatusChangedPayloadSchema = z.object({
  type: z.literal("enterprise_configuration.status_changed"),
  syncState: EnterpriseConfigurationSyncStateSchema,
  activationState: EnterpriseConfigurationActivationStateSchema,
  storageActiveRevision: EnterpriseConfigurationRevisionSchema.optional(),
  runtimeActiveRevision: EnterpriseConfigurationRevisionSchema.optional(),
  lastErrorCode: DesktopTypedErrorCodeSchema.optional(),
  statusQueryRef: z.string().min(1).max(512),
}).strict();

export const EnterpriseConfigurationStatusEventEnvelopeSchema = z.object({
  contractVersion: DesktopLocalContractVersionV1Alpha2Schema,
  eventId: z.string().uuid(),
  deliveryKind: z.literal("durable"),
  durableCursor: z.string().min(1).max(512),
  runtimeInstanceId: DesktopResourceIdSchema,
  emittedAt: TimestampSchema,
  payload: EnterpriseConfigurationStatusChangedPayloadSchema,
}).strict();

export type EnterpriseConfigurationStatusQuery = z.infer<
  typeof EnterpriseConfigurationStatusQuerySchema
>;
export type EnterpriseConfigurationStatusProjection = z.infer<
  typeof EnterpriseConfigurationStatusProjectionSchema
>;
export type EnterpriseConfigurationStatusEventEnvelope = z.infer<
  typeof EnterpriseConfigurationStatusEventEnvelopeSchema
>;
