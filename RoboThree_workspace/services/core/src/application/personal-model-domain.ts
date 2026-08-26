import { createHash, createHmac, randomBytes } from "node:crypto";

import {
  JsonValueSchema,
  ModelCapabilitySchema,
  NamespacedResourceIdSchema,
  PersonalModelProtocolSchema,
  PersonalModelProviderSchema,
  PersonalModelStatusSchema,
  Sha256DigestSchema,
  TimestampSchema,
  canonicalJsonStringify,
  type JsonValue,
  type PersonalModelProtocol,
  type PersonalModelProvider,
  type Sha256Digest,
} from "@robothree/contracts";
import { z } from "zod";

const PERSONAL_MODEL_SCHEMA_VERSION = "v1alpha1" as const;
const NAMESPACE_KEY_CHECK_DOMAIN =
  "robothree.personal-model.owner-namespace-key-check.v1";

const CredentialRefSchema = z.string()
  .min(32)
  .max(160)
  .regex(/^pmcr1\.[A-Za-z0-9_-]+$/u);

const SafeCodeSchema = z.string()
  .min(3)
  .max(120)
  .regex(/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/u);

const BoundedModelTextSchema = z.string()
  .min(1)
  .max(160)
  .refine((value) => !containsControlCharacter(value));

export const PersonalModelOwnerIdentitySchema = z.object({
  ownerScopeNamespaceRevision: z.number().int().positive(),
  ownerScopeDigest: Sha256DigestSchema,
}).strict();

export const PersonalModelDefinitionSchema = z.object({
  schemaVersion: z.literal(PERSONAL_MODEL_SCHEMA_VERSION),
  ownerScopeNamespaceRevision: z.number().int().positive(),
  ownerScopeDigest: Sha256DigestSchema,
  personalModelId: NamespacedResourceIdSchema,
  configurationRevision: Sha256DigestSchema,
  executionDefinitionDigest: Sha256DigestSchema,
  providerKind: PersonalModelProviderSchema,
  providerProfileRevision: Sha256DigestSchema,
  protocol: PersonalModelProtocolSchema,
  canonicalEndpoint: z.string().min(8).max(2048),
  endpointIdentityDigest: Sha256DigestSchema,
  providerModelId: BoundedModelTextSchema,
  displayName: BoundedModelTextSchema,
  capabilities: z.array(ModelCapabilitySchema).max(16),
  credentialRef: CredentialRefSchema,
  credentialRevision: z.number().int().positive(),
  credentialBindingDigest: Sha256DigestSchema,
  createdAt: TimestampSchema,
  recordDigest: Sha256DigestSchema,
}).strict();

export const PersonalModelHeadSchema = z.object({
  ownerScopeNamespaceRevision: z.number().int().positive(),
  ownerScopeDigest: Sha256DigestSchema,
  personalModelId: NamespacedResourceIdSchema,
  currentConfigurationRevision: Sha256DigestSchema,
  currentExecutionDefinitionDigest: Sha256DigestSchema,
  headRevision: z.number().int().positive(),
  selectionState: z.enum(["active", "delete_pending", "tombstoned"]),
  updatedAt: TimestampSchema,
  recordDigest: Sha256DigestSchema,
}).strict();

export const PersonalModelStatusOriginSchema = z.enum([
  "initialized",
  "carry_forward",
  "provider_observation",
]);

export const PersonalModelStatusFactSchema = z.object({
  ownerScopeNamespaceRevision: z.number().int().positive(),
  ownerScopeDigest: Sha256DigestSchema,
  personalModelId: NamespacedResourceIdSchema,
  configurationRevision: Sha256DigestSchema,
  executionDefinitionDigest: Sha256DigestSchema,
  statusRevision: z.number().int().positive(),
  status: PersonalModelStatusSchema,
  detailCode: SafeCodeSchema.optional(),
  detailDigest: Sha256DigestSchema.optional(),
  statusOrigin: PersonalModelStatusOriginSchema,
  carriedFromConfigurationRevision: Sha256DigestSchema.optional(),
  carriedFromStatusRevision: z.number().int().positive().optional(),
  carriedFromStatusRecordDigest: Sha256DigestSchema.optional(),
  updatedAt: TimestampSchema,
  recordDigest: Sha256DigestSchema,
}).strict().superRefine((value, context) => {
  const provenance = [
    value.carriedFromConfigurationRevision,
    value.carriedFromStatusRevision,
    value.carriedFromStatusRecordDigest,
  ];
  const present = provenance.filter((item) => item !== undefined).length;
  if (value.statusOrigin === "carry_forward" ? present !== 3 : present !== 0) {
    context.addIssue({
      code: "custom",
      message: "carry-forward status requires exact immutable provenance",
    });
  }
});

export const PersonalModelPreferenceSchema = z.object({
  ownerScopeNamespaceRevision: z.number().int().positive(),
  ownerScopeDigest: Sha256DigestSchema,
  modelSource: z.enum(["enterprise", "personal"]).optional(),
  modelId: z.string().min(1).max(160).optional(),
  configurationRevision: Sha256DigestSchema.optional(),
  preferenceRevision: z.number().int().positive(),
  updatedAt: TimestampSchema,
  recordDigest: Sha256DigestSchema,
}).strict().superRefine((value, context) => {
  if (value.modelSource === undefined) {
    if (value.modelId !== undefined || value.configurationRevision !== undefined) {
      context.addIssue({ code: "custom", message: "cleared preference cannot retain model identity" });
    }
    return;
  }
  if (value.modelId === undefined) {
    context.addIssue({ code: "custom", path: ["modelId"], message: "model preference requires modelId" });
  }
  if (value.modelSource === "personal" && value.configurationRevision === undefined) {
    context.addIssue({
      code: "custom",
      path: ["configurationRevision"],
      message: "personal preference requires exact configuration revision",
    });
  }
  if (value.modelSource === "enterprise" && value.configurationRevision !== undefined) {
    context.addIssue({
      code: "custom",
      path: ["configurationRevision"],
      message: "enterprise preference does not use Personal Model revision",
    });
  }
});

export const PersonalCredentialObservationSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("absent"), credentialRef: CredentialRefSchema }).strict(),
  z.object({
    state: z.literal("unavailable"),
    credentialRef: CredentialRefSchema,
    errorCode: z.enum([
      "credential_store_unavailable",
      "credential_store_locked",
      "credential_store_access_denied",
      "credential_store_corrupted",
      "credential_store_cancelled",
      "credential_store_internal",
    ]),
  }).strict(),
  z.object({
    state: z.literal("present"),
    credentialRef: CredentialRefSchema,
    createdByOperationId: z.string().uuid(),
    credentialRevision: z.number().int().positive(),
    credentialBindingDigest: Sha256DigestSchema,
  }).strict(),
]);

export type PersonalModelOwnerIdentity = z.infer<typeof PersonalModelOwnerIdentitySchema>;
export type PersonalModelDefinition = z.infer<typeof PersonalModelDefinitionSchema>;
export type PersonalModelHead = z.infer<typeof PersonalModelHeadSchema>;
export type PersonalModelStatusFact = z.infer<typeof PersonalModelStatusFactSchema>;
export type PersonalModelPreference = z.infer<typeof PersonalModelPreferenceSchema>;
export type PersonalCredentialObservation = z.infer<typeof PersonalCredentialObservationSchema>;

export type PersonalModelOwnerNamespace = Readonly<{
  namespaceRevision: number;
  namespaceKey: Uint8Array;
  namespaceKeyCheckDigest: Sha256Digest;
  status: "active" | "retired";
  createdAt: string;
  recordDigest: Sha256Digest;
}>;

export type PersonalModelDefinitionInput = Readonly<{
  ownerIdentity: PersonalModelOwnerIdentity;
  personalModelId: string;
  providerKind: PersonalModelProvider;
  providerProfileRevision: Sha256Digest;
  protocol: PersonalModelProtocol;
  endpoint: string;
  providerModelId: string;
  displayName: string;
  capabilities: readonly z.infer<typeof ModelCapabilitySchema>[];
  credentialRef: string;
  credentialRevision: number;
  credentialBindingDigest: Sha256Digest;
  createdAt: string;
}>;

export function createPersonalModelDefinition(
  input: PersonalModelDefinitionInput,
): PersonalModelDefinition {
  const owner = PersonalModelOwnerIdentitySchema.parse(input.ownerIdentity);
  const endpoint = canonicalizePersonalModelEndpoint(input.endpoint);
  const capabilities = canonicalCapabilities(input.capabilities);
  const base = {
    schemaVersion: PERSONAL_MODEL_SCHEMA_VERSION,
    ownerScopeNamespaceRevision: owner.ownerScopeNamespaceRevision,
    ownerScopeDigest: owner.ownerScopeDigest,
    personalModelId: NamespacedResourceIdSchema.parse(input.personalModelId),
    providerKind: PersonalModelProviderSchema.parse(input.providerKind),
    providerProfileRevision: Sha256DigestSchema.parse(input.providerProfileRevision),
    protocol: PersonalModelProtocolSchema.parse(input.protocol),
    canonicalEndpoint: endpoint.canonicalEndpoint,
    endpointIdentityDigest: endpoint.endpointIdentityDigest,
    providerModelId: BoundedModelTextSchema.parse(input.providerModelId.normalize("NFC")),
    displayName: BoundedModelTextSchema.parse(input.displayName.normalize("NFC")),
    capabilities,
    credentialRef: CredentialRefSchema.parse(input.credentialRef),
    credentialRevision: z.number().int().positive().parse(input.credentialRevision),
    credentialBindingDigest: Sha256DigestSchema.parse(input.credentialBindingDigest),
    createdAt: TimestampSchema.parse(input.createdAt),
  } as const;
  const configurationRevision = digest("robothree.personal-model.configuration.v1", {
    ...base,
    createdAt: undefined,
  });
  const executionDefinitionDigest = digest(
    "robothree.personal-model.execution-definition.v1",
    {
      schemaVersion: base.schemaVersion,
      ownerScopeNamespaceRevision: base.ownerScopeNamespaceRevision,
      ownerScopeDigest: base.ownerScopeDigest,
      personalModelId: base.personalModelId,
      providerKind: base.providerKind,
      providerProfileRevision: base.providerProfileRevision,
      protocol: base.protocol,
      canonicalEndpoint: base.canonicalEndpoint,
      endpointIdentityDigest: base.endpointIdentityDigest,
      providerModelId: base.providerModelId,
      capabilities: base.capabilities,
      credentialRef: base.credentialRef,
      credentialRevision: base.credentialRevision,
      credentialBindingDigest: base.credentialBindingDigest,
    },
  );
  const material = { ...base, configurationRevision, executionDefinitionDigest };
  return PersonalModelDefinitionSchema.parse({
    ...material,
    recordDigest: digest("robothree.personal-model.definition-record.v1", material),
  });
}

export function validatePersonalModelDefinition(
  value: PersonalModelDefinition,
): PersonalModelDefinition {
  const parsed = PersonalModelDefinitionSchema.parse(value);
  const recreated = createPersonalModelDefinition({
    ownerIdentity: ownerOf(parsed),
    personalModelId: parsed.personalModelId,
    providerKind: parsed.providerKind,
    providerProfileRevision: parsed.providerProfileRevision,
    protocol: parsed.protocol,
    endpoint: parsed.canonicalEndpoint,
    providerModelId: parsed.providerModelId,
    displayName: parsed.displayName,
    capabilities: parsed.capabilities,
    credentialRef: parsed.credentialRef,
    credentialRevision: parsed.credentialRevision,
    credentialBindingDigest: parsed.credentialBindingDigest,
    createdAt: parsed.createdAt,
  });
  if (canonicalJsonStringify(JsonValueSchema.parse(parsed))
    !== canonicalJsonStringify(JsonValueSchema.parse(recreated))) {
    throw new PersonalModelIntegrityError("personal_model.definition_integrity_invalid");
  }
  return parsed;
}

export function createPersonalModelHead(
  input: Omit<PersonalModelHead, "recordDigest">,
): PersonalModelHead {
  const material = PersonalModelHeadSchema.omit({ recordDigest: true }).parse(input);
  return PersonalModelHeadSchema.parse({
    ...material,
    recordDigest: digest("robothree.personal-model.head-record.v1", material),
  });
}

export function validatePersonalModelHead(value: PersonalModelHead): PersonalModelHead {
  const parsed = PersonalModelHeadSchema.parse(value);
  const { recordDigest, ...material } = parsed;
  if (recordDigest !== digest("robothree.personal-model.head-record.v1", material)) {
    throw new PersonalModelIntegrityError("personal_model.head_integrity_invalid");
  }
  return parsed;
}

export function createPersonalModelStatusFact(
  input: Omit<PersonalModelStatusFact, "recordDigest">,
): PersonalModelStatusFact {
  const provisional = PersonalModelStatusFactSchema.parse({
    ...input,
    recordDigest: `sha256:${"0".repeat(64)}`,
  });
  const { recordDigest: _placeholder, ...material } = provisional;
  return PersonalModelStatusFactSchema.parse({
    ...material,
    recordDigest: digest("robothree.personal-model.status-record.v1", material),
  });
}

export function validatePersonalModelStatusFact(
  value: PersonalModelStatusFact,
): PersonalModelStatusFact {
  const parsed = PersonalModelStatusFactSchema.parse(value);
  const { recordDigest, ...material } = parsed;
  if (recordDigest !== digest("robothree.personal-model.status-record.v1", material)) {
    throw new PersonalModelIntegrityError("personal_model.status_integrity_invalid");
  }
  return parsed;
}

export function createPersonalModelPreference(
  input: Omit<PersonalModelPreference, "recordDigest">,
): PersonalModelPreference {
  const provisional = PersonalModelPreferenceSchema.parse({
    ...input,
    recordDigest: `sha256:${"0".repeat(64)}`,
  });
  const { recordDigest: _placeholder, ...material } = provisional;
  return PersonalModelPreferenceSchema.parse({
    ...material,
    recordDigest: digest("robothree.personal-model.preference-record.v1", material),
  });
}

export function validatePersonalModelPreference(
  value: PersonalModelPreference,
): PersonalModelPreference {
  const parsed = PersonalModelPreferenceSchema.parse(value);
  const { recordDigest, ...material } = parsed;
  if (recordDigest !== digest("robothree.personal-model.preference-record.v1", material)) {
    throw new PersonalModelIntegrityError("personal_model.preference_integrity_invalid");
  }
  return parsed;
}

export function createPersonalModelOwnerNamespace(
  input: Readonly<{ namespaceRevision: number; namespaceKey?: Uint8Array; createdAt: string }>,
): PersonalModelOwnerNamespace {
  const namespaceKey = input.namespaceKey === undefined
    ? randomBytes(32)
    : Uint8Array.from(input.namespaceKey);
  if (namespaceKey.byteLength < 32 || namespaceKey.byteLength > 64) {
    throw new PersonalModelIntegrityError("personal_model.owner_namespace_key_invalid");
  }
  const namespaceKeyCheckDigest = calculateNamespaceKeyCheckDigest(namespaceKey);
  const material = {
    namespaceRevision: z.number().int().positive().parse(input.namespaceRevision),
    namespaceKeyCheckDigest,
    status: "active" as const,
    createdAt: TimestampSchema.parse(input.createdAt),
  };
  return {
    ...material,
    namespaceKey,
    recordDigest: digest("robothree.personal-model.owner-namespace-record.v1", material),
  };
}

export function validatePersonalModelOwnerNamespace(
  namespace: PersonalModelOwnerNamespace,
): PersonalModelOwnerNamespace {
  if (namespace.namespaceKey.byteLength < 32 || namespace.namespaceKey.byteLength > 64) {
    throw new PersonalModelIntegrityError("personal_model.owner_namespace_key_invalid");
  }
  if (namespace.namespaceKeyCheckDigest
    !== calculateNamespaceKeyCheckDigest(namespace.namespaceKey)) {
    throw new PersonalModelIntegrityError("personal_model.owner_namespace_key_check_invalid");
  }
  const material = {
    namespaceRevision: namespace.namespaceRevision,
    namespaceKeyCheckDigest: namespace.namespaceKeyCheckDigest,
    status: namespace.status,
    createdAt: namespace.createdAt,
  };
  if (namespace.recordDigest
    !== digest("robothree.personal-model.owner-namespace-record.v1", material)) {
    throw new PersonalModelIntegrityError("personal_model.owner_namespace_record_invalid");
  }
  if (namespace.status !== "active") {
    throw new PersonalModelIntegrityError("personal_model.owner_namespace_unavailable");
  }
  return {
    ...namespace,
    namespaceKey: Uint8Array.from(namespace.namespaceKey),
  };
}

export function calculateNamespaceKeyCheckDigest(key: Uint8Array): Sha256Digest {
  const hex = createHmac("sha256", key).update(NAMESPACE_KEY_CHECK_DOMAIN, "utf8").digest("hex");
  return Sha256DigestSchema.parse(`sha256:${hex}`);
}

export function derivePersonalModelOwnerIdentity(
  namespace: PersonalModelOwnerNamespace,
  input: Readonly<{ enterpriseId: string; userId: string; deviceId: string }>,
): PersonalModelOwnerIdentity {
  const validated = validatePersonalModelOwnerNamespace(namespace);
  const material = canonicalJsonStringify(JsonValueSchema.parse({
    schemaVersion: PERSONAL_MODEL_SCHEMA_VERSION,
    enterpriseId: input.enterpriseId.normalize("NFC"),
    userId: input.userId.normalize("NFC"),
    deviceId: input.deviceId.normalize("NFC"),
  }));
  const hex = createHmac("sha256", validated.namespaceKey)
    .update(material, "utf8")
    .digest("hex");
  return PersonalModelOwnerIdentitySchema.parse({
    ownerScopeNamespaceRevision: validated.namespaceRevision,
    ownerScopeDigest: `sha256:${hex}`,
  });
}

export function allocatePersonalCredentialReference(bytes = randomBytes(32)): string {
  if (bytes.byteLength < 32) {
    throw new PersonalModelIntegrityError("personal_model.credential_reference_entropy_invalid");
  }
  return CredentialRefSchema.parse(`pmcr1.${Buffer.from(bytes).toString("base64url")}`);
}

export function calculateCredentialBindingDigest(
  input: Readonly<{
    credentialRef: string;
    createdByOperationId: string;
    credentialRevision: number;
  }>,
): Sha256Digest {
  return digest("robothree.personal-model.credential-binding.v1", {
    credentialRef: CredentialRefSchema.parse(input.credentialRef),
    createdByOperationId: z.string().uuid().parse(input.createdByOperationId),
    credentialRevision: z.number().int().positive().parse(input.credentialRevision),
  });
}

export function calculateCredentialObservationDigest(
  observation: PersonalCredentialObservation,
): Sha256Digest {
  return digest(
    "robothree.personal-model.credential-observation.v1",
    PersonalCredentialObservationSchema.parse(observation),
  );
}

export function calculatePersonalModelRecordDigest(
  recordKind: "operation" | "receipt",
  material: unknown,
): Sha256Digest {
  return digest(`robothree.personal-model.${recordKind}-record.v1`, material);
}

export function calculatePersonalModelAuxiliaryDigest(
  kind: "active-head-query",
  material: unknown,
): Sha256Digest {
  return digest(`robothree.personal-model.${kind}.v1`, material);
}

export type CanonicalPersonalModelEndpoint = Readonly<{
  canonicalEndpoint: string;
  endpointDisplayHost: string;
  endpointIdentityDigest: Sha256Digest;
}>;

export function canonicalizePersonalModelEndpoint(raw: string): CanonicalPersonalModelEndpoint {
  if (raw !== raw.trim()
    || containsControlCharacter(raw)
    || /[\\@?#]/u.test(raw)
    || /%(?:00|2f|5c)/iu.test(raw)) {
    throw new PersonalModelEndpointError("personal_model.endpoint_invalid");
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new PersonalModelEndpointError("personal_model.endpoint_invalid");
  }
  if (parsed.protocol !== "https:"
    || parsed.username !== ""
    || parsed.password !== ""
    || parsed.search !== ""
    || parsed.hash !== ""
    || parsed.hostname.endsWith(".")) {
    throw new PersonalModelEndpointError("personal_model.endpoint_invalid");
  }
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === "" || containsControlCharacter(hostname)) {
    throw new PersonalModelEndpointError("personal_model.endpoint_invalid");
  }
  const path = canonicalizePath(parsed.pathname);
  if (containsControlCharacter(path)) {
    throw new PersonalModelEndpointError("personal_model.endpoint_invalid");
  }
  const port = parsed.port === "" || parsed.port === "443" ? "" : `:${parsed.port}`;
  const canonicalEndpoint = `https://${hostname}${port}${path}`;
  if (canonicalEndpoint.length > 2048) {
    throw new PersonalModelEndpointError("personal_model.endpoint_invalid");
  }
  return {
    canonicalEndpoint,
    endpointDisplayHost: `${hostname}${port}`,
    endpointIdentityDigest: digest("robothree.personal-model.endpoint.v1", {
      canonicalEndpoint,
    }),
  };
}

function canonicalizePath(pathname: string): string {
  const path = pathname === "" ? "/" : pathname;
  return path.split("/").map((segment) => {
    let decoded: string;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      throw new PersonalModelEndpointError("personal_model.endpoint_invalid");
    }
    if (containsControlCharacter(decoded) || /[/\\]/u.test(decoded)) {
      throw new PersonalModelEndpointError("personal_model.endpoint_invalid");
    }
    return encodeURIComponent(decoded.normalize("NFC"))
      .replace(/[!'()*]/gu, (character) =>
        `%${character.codePointAt(0)!.toString(16).toUpperCase()}`);
  }).join("/");
}

function containsControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.codePointAt(0)!;
    return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
  });
}

function canonicalCapabilities(
  values: readonly z.infer<typeof ModelCapabilitySchema>[],
): z.infer<typeof ModelCapabilitySchema>[] {
  const order = ["text", "streaming", "tool_calling", "vision"] as const;
  const unique = new Set(z.array(ModelCapabilitySchema).max(16).parse(values));
  return order.filter((capability) => unique.has(capability));
}

function digest(domain: string, material: unknown): Sha256Digest {
  const canonical = canonicalJsonStringify(JsonValueSchema.parse(normalizeJson({
    domain,
    material: stripUndefined(material),
  })));
  return Sha256DigestSchema.parse(
    `sha256:${createHash("sha256").update(canonical, "utf8").digest("hex")}`,
  );
}

function stripUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, stripUndefined(item)]));
  }
  return value;
}

function normalizeJson(value: unknown): JsonValue {
  if (typeof value === "string") return value.normalize("NFC");
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return JsonValueSchema.parse(value);
  }
  if (Array.isArray(value)) return value.map(normalizeJson);
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .map(([key, item]) => [key, normalizeJson(item)]));
  }
  throw new PersonalModelIntegrityError("personal_model.canonical_material_invalid");
}

function ownerOf(value: PersonalModelDefinition): PersonalModelOwnerIdentity {
  return {
    ownerScopeNamespaceRevision: value.ownerScopeNamespaceRevision,
    ownerScopeDigest: value.ownerScopeDigest,
  };
}

export class PersonalModelIntegrityError extends Error {
  public constructor(public readonly code: string) {
    super(code);
    this.name = "PersonalModelIntegrityError";
  }
}

export class PersonalModelEndpointError extends Error {
  public constructor(public readonly code: "personal_model.endpoint_invalid") {
    super(code);
    this.name = "PersonalModelEndpointError";
  }
}

export const PersonalModelDomainConstants = Object.freeze({
  schemaVersion: PERSONAL_MODEL_SCHEMA_VERSION,
  namespaceKeyCheckDomain: NAMESPACE_KEY_CHECK_DOMAIN,
});
