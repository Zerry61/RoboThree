import { z } from "zod";

import { EntityIdSchema } from "../../common/identifiers.js";
import { TimestampSchema } from "../../common/time.js";
import { Sha256DigestSchema } from "../../persistence/common.js";

export const DESKTOP_LOCAL_CONTRACT_VERSION = "v1alpha1" as const;
export const DesktopLocalContractVersionSchema = z.literal(
  DESKTOP_LOCAL_CONTRACT_VERSION,
);

export const DesktopResourceIdSchema = z.string()
  .min(3)
  .max(160)
  .regex(/^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)+$/u);

export const DesktopDisplayTextSchema = z.string().min(1).max(512);
export const DesktopSafeSummarySchema = z.string().max(4096);

export const DesktopCommandMetadataSchema = z.object({
  contractVersion: DesktopLocalContractVersionSchema,
  commandId: EntityIdSchema,
  correlationId: EntityIdSchema,
  clientInstanceId: EntityIdSchema,
}).strict();

export const DesktopQueryMetadataSchema = z.object({
  contractVersion: DesktopLocalContractVersionSchema,
  queryId: EntityIdSchema,
  correlationId: EntityIdSchema,
  clientInstanceId: EntityIdSchema,
}).strict();

export const DesktopRevisionRefSchema = z.object({
  id: DesktopResourceIdSchema,
  revision: Sha256DigestSchema,
}).strict();

export {
  EntityIdSchema,
  Sha256DigestSchema,
  TimestampSchema,
};

export type DesktopCommandMetadata = z.infer<
  typeof DesktopCommandMetadataSchema
>;
export type DesktopQueryMetadata = z.infer<typeof DesktopQueryMetadataSchema>;
export type DesktopRevisionRef = z.infer<typeof DesktopRevisionRefSchema>;
