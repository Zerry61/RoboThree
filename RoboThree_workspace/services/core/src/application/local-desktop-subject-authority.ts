import { createHmac } from "node:crypto";

import {
  JsonValueSchema,
  Sha256DigestSchema,
  canonicalJsonStringify,
  type Sha256Digest,
} from "@robothree/contracts";
import { z } from "zod";

import { sha256CanonicalJson } from "../persistence/digest.js";
import {
  validatePersonalModelOwnerNamespace,
  type PersonalModelOwnerNamespace,
} from "./personal-model-domain.js";

export const LOCAL_DESKTOP_OWNER_HMAC_DOMAIN =
  "robothree.local-desktop-owner.v1\n" as const;
export const LOCAL_DESKTOP_SUBJECT_AUTHORITY_DIGEST_DOMAIN =
  "robothree.local-desktop-subject-authority.v1\n" as const;
export const LOCAL_DESKTOP_SUBJECT_SCOPE =
  "local_personal_model_and_task_resource" as const;

const IdentityEvidenceSchema = z.object({
  productionLocalAuthorityReady: z.boolean(),
  productionEnterpriseIdentityReady: z.boolean(),
  testIdentityUsed: z.boolean(),
}).strict().superRefine((value, context) => {
  const readyCount = Number(value.productionLocalAuthorityReady)
    + Number(value.productionEnterpriseIdentityReady)
    + Number(value.testIdentityUsed);
  if (readyCount !== 1) {
    context.addIssue({
      code: "custom",
      message: "exactly one task-resource identity authority must be active",
    });
  }
});

const LocalDesktopSubjectAuthorityMaterialSchema = z.object({
  schemaVersion: z.literal("v1"),
  authorityKind: z.literal("local_desktop_owner"),
  ownerScopeNamespaceRevision: z.number().int().positive(),
  ownerScopeDigest: Sha256DigestSchema,
  identityEvidence: IdentityEvidenceSchema,
}).strict().superRefine((value, context) => {
  if (
    !value.identityEvidence.productionLocalAuthorityReady
    || value.identityEvidence.productionEnterpriseIdentityReady
    || value.identityEvidence.testIdentityUsed
  ) {
    context.addIssue({
      code: "custom",
      path: ["identityEvidence"],
      message: "local Desktop authority cannot impersonate enterprise or test identity",
    });
  }
});

export const LocalDesktopSubjectAuthorityV1Schema =
  LocalDesktopSubjectAuthorityMaterialSchema.extend({
    authorityRevision: Sha256DigestSchema,
  }).strict();

export const TaskResourceSubjectAuthorityV1Schema = z.discriminatedUnion(
  "authorityKind",
  [
    LocalDesktopSubjectAuthorityV1Schema,
    z.object({
      schemaVersion: z.literal("v1"),
      authorityKind: z.literal("runtime_active_enterprise_identity"),
      subjectBindingDigest: Sha256DigestSchema,
      authorityRevision: Sha256DigestSchema,
      identityEvidence: IdentityEvidenceSchema.refine(
        (value) => value.productionEnterpriseIdentityReady
          && !value.productionLocalAuthorityReady
          && !value.testIdentityUsed,
        "enterprise authority flags are inconsistent",
      ),
    }).strict(),
    z.object({
      schemaVersion: z.literal("v1"),
      authorityKind: z.literal("test_only"),
      subjectBindingDigest: Sha256DigestSchema,
      authorityRevision: Sha256DigestSchema,
      identityEvidence: IdentityEvidenceSchema.refine(
        (value) => value.testIdentityUsed
          && !value.productionLocalAuthorityReady
          && !value.productionEnterpriseIdentityReady,
        "test-only authority flags are inconsistent",
      ),
    }).strict(),
  ],
);

export type LocalDesktopSubjectAuthorityV1 = z.infer<
  typeof LocalDesktopSubjectAuthorityV1Schema
>;
export type TaskResourceSubjectAuthorityV1 = z.infer<
  typeof TaskResourceSubjectAuthorityV1Schema
>;

export function deriveLocalDesktopSubjectAuthority(
  namespace: PersonalModelOwnerNamespace,
): LocalDesktopSubjectAuthorityV1 {
  const validated = validatePersonalModelOwnerNamespace(namespace);
  const key = Uint8Array.from(validated.namespaceKey);
  validated.namespaceKey.fill(0);
  try {
    const bindingMaterial = canonicalJsonStringify(JsonValueSchema.parse({
      schemaVersion: "v1",
      scope: LOCAL_DESKTOP_SUBJECT_SCOPE,
    }));
    const ownerScopeDigest = Sha256DigestSchema.parse(
      `sha256:${createHmac("sha256", key)
        .update(LOCAL_DESKTOP_OWNER_HMAC_DOMAIN, "utf8")
        .update(bindingMaterial, "utf8")
        .digest("hex")}`,
    );
    const material = LocalDesktopSubjectAuthorityMaterialSchema.parse({
      schemaVersion: "v1",
      authorityKind: "local_desktop_owner",
      ownerScopeNamespaceRevision: validated.namespaceRevision,
      ownerScopeDigest,
      identityEvidence: {
        productionLocalAuthorityReady: true,
        productionEnterpriseIdentityReady: false,
        testIdentityUsed: false,
      },
    });
    return Object.freeze(LocalDesktopSubjectAuthorityV1Schema.parse({
      ...material,
      authorityRevision: calculateLocalDesktopAuthorityRevision(material),
    }));
  } finally {
    key.fill(0);
  }
}

export function validateLocalDesktopSubjectAuthority(
  namespace: PersonalModelOwnerNamespace,
  authority: LocalDesktopSubjectAuthorityV1,
): LocalDesktopSubjectAuthorityV1 {
  const parsed = LocalDesktopSubjectAuthorityV1Schema.parse(authority);
  const expected = deriveLocalDesktopSubjectAuthority(namespace);
  if (
    parsed.ownerScopeNamespaceRevision !== expected.ownerScopeNamespaceRevision
    || parsed.ownerScopeDigest !== expected.ownerScopeDigest
    || parsed.authorityRevision !== expected.authorityRevision
  ) {
    throw new LocalDesktopSubjectAuthorityError("local_authority.integrity_invalid");
  }
  return Object.freeze(parsed);
}

function calculateLocalDesktopAuthorityRevision(
  material: z.infer<typeof LocalDesktopSubjectAuthorityMaterialSchema>,
): Sha256Digest {
  return Sha256DigestSchema.parse(sha256CanonicalJson(JsonValueSchema.parse({
    domain: LOCAL_DESKTOP_SUBJECT_AUTHORITY_DIGEST_DOMAIN,
    material,
  })));
}

export class LocalDesktopSubjectAuthorityError extends Error {
  constructor(readonly code: "local_authority.integrity_invalid") {
    super(code);
    this.name = "LocalDesktopSubjectAuthorityError";
  }
}
