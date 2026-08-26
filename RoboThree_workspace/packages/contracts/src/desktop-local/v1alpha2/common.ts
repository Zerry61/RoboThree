import { z } from "zod";

import { EntityIdSchema } from "../../common/identifiers.js";

export {
  DesktopResourceIdSchema,
  DesktopSafeSummarySchema,
  EntityIdSchema,
  TimestampSchema,
} from "../v1alpha1/common.js";

export const DESKTOP_LOCAL_CONTRACT_VERSION_V1ALPHA2 = "v1alpha2" as const;
export const DesktopLocalContractVersionV1Alpha2Schema = z.literal(
  DESKTOP_LOCAL_CONTRACT_VERSION_V1ALPHA2,
);

export const DesktopLocalNegotiatedVersionSchema = z.enum([
  "v1alpha1",
  "v1alpha2",
]);

export const EnterpriseConfigurationRevisionSchema = z.string()
  .regex(/^[a-f0-9]{64}$/u);

export const DesktopTypedErrorCodeSchema = z.string()
  .min(3)
  .max(128)
  .regex(/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/u);

export const DesktopQueryMetadataV1Alpha2Schema = z.object({
  contractVersion: DesktopLocalContractVersionV1Alpha2Schema,
  queryId: EntityIdSchema,
  correlationId: EntityIdSchema,
  clientInstanceId: EntityIdSchema,
}).strict();

export const DesktopCommandMetadataV1Alpha2Schema = z.object({
  contractVersion: DesktopLocalContractVersionV1Alpha2Schema,
  commandId: EntityIdSchema,
  correlationId: EntityIdSchema,
  clientInstanceId: EntityIdSchema,
}).strict();

export type DesktopQueryMetadataV1Alpha2 = z.infer<
  typeof DesktopQueryMetadataV1Alpha2Schema
>;
export type DesktopCommandMetadataV1Alpha2 = z.infer<
  typeof DesktopCommandMetadataV1Alpha2Schema
>;
