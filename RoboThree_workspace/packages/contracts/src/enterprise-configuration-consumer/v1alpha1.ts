import { z } from "zod";

import { TimestampSchema } from "../common/time.js";
import { JsonObjectSchema } from "../runtime/json.js";

export const ENTERPRISE_CONFIGURATION_CONTRACT_VERSION = "v1alpha1" as const;

export const EnterpriseRawSha256Schema = z.string()
  .regex(/^[a-f0-9]{64}$/u);

export const EnterpriseResourceIdSchema = z.string()
  .min(3)
  .max(160)
  .regex(/^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)+$/u);

const UniqueStringArraySchema = z.array(z.string().min(1).max(128))
  .max(256)
  .superRefine((value, context) => {
    if (new Set(value).size !== value.length) {
      context.addIssue({
        code: "custom",
        message: "array values must be unique",
      });
    }
  });

export const EnterpriseResourceDescriptorConsumerSchema = z.object({
  kind: z.enum(["model", "tool", "knowledge"]),
  id: EnterpriseResourceIdSchema,
  revision: EnterpriseRawSha256Schema,
  digest: EnterpriseRawSha256Schema,
  capabilities: UniqueStringArraySchema.max(64),
  gatewayEndpoint: z.string().min(1).max(512),
  credentialAvailable: z.boolean(),
  unavailableReason: z.string().max(4096).optional(),
  enabled: z.boolean(),
  fixedPermissions: UniqueStringArraySchema
    .refine((permissions) => permissions.every(
      (permission) => permission.length >= 3,
    ), "permission values must contain at least three characters")
    .pipe(z.array(z.string()).max(64)),
}).strict();

export const EnterprisePackageReferenceConsumerSchema = z.object({
  packageId: EnterpriseResourceIdSchema,
  kind: z.enum(["agent", "skill"]),
  revision: EnterpriseRawSha256Schema,
  digest: EnterpriseRawSha256Schema,
}).strict();

export const EnterpriseConfigurationSnapshotConsumerSchema = z.object({
  contractVersion: z.literal(ENTERPRISE_CONFIGURATION_CONTRACT_VERSION),
  snapshotId: EnterpriseResourceIdSchema,
  revision: EnterpriseRawSha256Schema,
  schemaVersion: z.literal(ENTERPRISE_CONFIGURATION_CONTRACT_VERSION),
  digest: EnterpriseRawSha256Schema,
  minimumDesktopVersion: z.string().min(1).max(64),
  minimumCoreVersion: z.string().min(1).max(64),
  models: z.array(EnterpriseResourceDescriptorConsumerSchema).max(128),
  tools: z.array(EnterpriseResourceDescriptorConsumerSchema).max(256),
  agents: z.array(EnterprisePackageReferenceConsumerSchema).max(128),
  skills: z.array(EnterprisePackageReferenceConsumerSchema).max(256),
  knowledge: z.array(EnterpriseResourceDescriptorConsumerSchema).max(64),
  fixedPermissions: UniqueStringArraySchema,
  gatewayEndpoints: z.object({
    configuration: z.string().min(1).max(512),
    model: z.string().min(1).max(512).optional(),
    tool: z.string().min(1).max(512).optional(),
  }).strict(),
  generatedAt: TimestampSchema,
}).strict();

export const EnterprisePackageFileConsumerSchema = z.object({
  relativePath: z.string()
    .min(1)
    .max(512)
    .regex(/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\/\/)[^\\]+$/u)
    .refine((path) => !path.includes(String.fromCharCode(0)), "path contains a null byte"),
  mediaType: z.enum([
    "application/json",
    "text/markdown",
    "text/plain",
  ]),
  utf8Content: z.string().max(524_288),
  contentDigest: EnterpriseRawSha256Schema,
}).strict();

export const EnterprisePackageDocumentConsumerSchema = z.object({
  packageId: EnterpriseResourceIdSchema,
  kind: z.enum(["agent", "skill"]),
  revision: EnterpriseRawSha256Schema,
  manifest: JsonObjectSchema.refine(
    (manifest) => Object.keys(manifest).length <= 128,
    "manifest exceeds 128 properties",
  ),
  files: z.array(EnterprisePackageFileConsumerSchema).max(256),
  packageDigest: EnterpriseRawSha256Schema,
  createdAt: TimestampSchema,
}).strict();

export const EnterpriseExactPackageReadConsumerSchema = z.object({
  contractVersion: z.literal(ENTERPRISE_CONFIGURATION_CONTRACT_VERSION),
  snapshotId: EnterpriseResourceIdSchema,
  snapshotRevision: EnterpriseRawSha256Schema,
  snapshotDigest: EnterpriseRawSha256Schema,
  packageId: EnterpriseResourceIdSchema,
  kind: z.enum(["agent", "skill"]),
  packageRevision: EnterpriseRawSha256Schema,
  packageDigest: EnterpriseRawSha256Schema,
}).strict();

export type EnterpriseResourceDescriptor = z.infer<
  typeof EnterpriseResourceDescriptorConsumerSchema
>;
export type EnterprisePackageReference = z.infer<
  typeof EnterprisePackageReferenceConsumerSchema
>;
export type EnterpriseConfigurationSnapshot = z.infer<
  typeof EnterpriseConfigurationSnapshotConsumerSchema
>;
export type EnterprisePackageFile = z.infer<
  typeof EnterprisePackageFileConsumerSchema
>;
export type EnterprisePackageDocument = z.infer<
  typeof EnterprisePackageDocumentConsumerSchema
>;
export type EnterpriseExactPackageRead = z.infer<
  typeof EnterpriseExactPackageReadConsumerSchema
>;
