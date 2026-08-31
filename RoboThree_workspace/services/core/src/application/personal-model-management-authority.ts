import { JsonObjectSchema, Sha256DigestSchema } from "@robothree/contracts";
import { z } from "zod";

import type { PersonalModelOwnerAuthority } from
  "../ports/personal-model-owner-authority.js";
import type { PersonalModelPersistence } from
  "../ports/personal-model-persistence.js";
import { sha256CanonicalJson } from "../persistence/digest.js";
import {
  deriveLocalDesktopSubjectAuthority,
  type LocalDesktopSubjectAuthorityV1,
} from "./local-desktop-subject-authority.js";

const MANAGEMENT_AUTHORITY_DOMAIN =
  "robothree.personal-model-management-authority.v2\n" as const;
const LOCAL_MANAGEMENT_POLICY_REVISION = Sha256DigestSchema.parse(
  sha256CanonicalJson(JsonObjectSchema.parse({
    schemaVersion: "v2",
    policy: "local_personal_model_management",
    permissions: ["configure", "use", "reveal", "delete"],
  })),
);

const PermissionsSchema = z.object({
  configure: z.boolean(),
  use: z.boolean(),
  reveal: z.boolean(),
  delete: z.boolean(),
}).strict();

const CommonSchema = z.object({
  schemaVersion: z.literal("v2"),
  ownerScopeNamespaceRevision: z.number().int().positive(),
  ownerScopeDigest: Sha256DigestSchema,
  policyRevision: Sha256DigestSchema,
  permissions: PermissionsSchema,
  productionLocalAuthorityReady: z.boolean(),
  productionEnterpriseIdentityReady: z.boolean(),
  testIdentityUsed: z.boolean(),
  authorityRevision: Sha256DigestSchema,
}).strict();

export const PersonalModelManagementAuthorityV2Schema = z.discriminatedUnion(
  "authorityKind",
  [
    CommonSchema.extend({
      authorityKind: z.literal("standalone_local_owner"),
      policy: z.literal("local_personal_model_management"),
    }).strict().superRefine((value, context) => {
      if (!value.productionLocalAuthorityReady
        || value.productionEnterpriseIdentityReady
        || value.testIdentityUsed
        || Object.values(value.permissions).some((permission) => !permission)) {
        context.addIssue({
          code: "custom",
          message: "standalone local management authority flags are invalid",
        });
      }
    }),
    CommonSchema.extend({
      authorityKind: z.literal("runtime_active_enterprise_identity"),
      policy: z.literal("personal_model.configure"),
    }).strict().superRefine((value, context) => {
      if (value.productionLocalAuthorityReady
        || !value.productionEnterpriseIdentityReady
        || value.testIdentityUsed) {
        context.addIssue({
          code: "custom",
          message: "enterprise management authority flags are invalid",
        });
      }
    }),
  ],
);

export type PersonalModelManagementAuthorityV2 = z.infer<
  typeof PersonalModelManagementAuthorityV2Schema
>;
type PersonalModelManagementAuthorityMaterial =
  PersonalModelManagementAuthorityV2 extends infer Authority
    ? Authority extends unknown
      ? Omit<Authority, "authorityRevision">
      : never
    : never;

export type PersonalModelManagementDeploymentMode =
  | "standalone_local"
  | "enterprise_managed";

export interface PersonalModelManagementAuthoritySource {
  readonly deploymentMode: PersonalModelManagementDeploymentMode;
  resolve(): Promise<PersonalModelManagementAuthorityV2 | undefined>;
}

export class ProductionPersonalModelManagementAuthoritySource
implements PersonalModelManagementAuthoritySource {
  public constructor(
    private readonly input: Readonly<{
      persistence: PersonalModelPersistence;
      deploymentMode: PersonalModelManagementDeploymentMode;
      enterpriseAuthority?: () => Promise<PersonalModelOwnerAuthority | undefined>;
    }>,
  ) {}

  public get deploymentMode(): PersonalModelManagementDeploymentMode {
    return this.input.deploymentMode;
  }

  public async resolve(): Promise<PersonalModelManagementAuthorityV2 | undefined> {
    if (this.input.deploymentMode === "enterprise_managed") {
      const authority = await this.input.enterpriseAuthority?.();
      return authority === undefined ? undefined : enterpriseAuthority(authority);
    }
    const namespace = await this.input.persistence.loadActiveOwnerNamespace();
    if (namespace === undefined) return undefined;
    try {
      return standaloneAuthority(deriveLocalDesktopSubjectAuthority(namespace));
    } finally {
      namespace.namespaceKey.fill(0);
    }
  }
}

function standaloneAuthority(
  subject: LocalDesktopSubjectAuthorityV1,
): PersonalModelManagementAuthorityV2 {
  const material = {
    schemaVersion: "v2" as const,
    authorityKind: "standalone_local_owner" as const,
    ownerScopeNamespaceRevision: subject.ownerScopeNamespaceRevision,
    ownerScopeDigest: subject.ownerScopeDigest,
    policy: "local_personal_model_management" as const,
    policyRevision: LOCAL_MANAGEMENT_POLICY_REVISION,
    permissions: { configure: true, use: true, reveal: true, delete: true },
    productionLocalAuthorityReady: true,
    productionEnterpriseIdentityReady: false,
    testIdentityUsed: false,
  };
  return freezeAuthority(material);
}

function enterpriseAuthority(
  authority: PersonalModelOwnerAuthority,
): PersonalModelManagementAuthorityV2 {
  const material = {
    schemaVersion: "v2" as const,
    authorityKind: "runtime_active_enterprise_identity" as const,
    ownerScopeNamespaceRevision: authority.ownerIdentity.ownerScopeNamespaceRevision,
    ownerScopeDigest: authority.ownerIdentity.ownerScopeDigest,
    policy: authority.entitlement,
    policyRevision: Sha256DigestSchema.parse(authority.entitlementRevision),
    permissions: { configure: true, use: true, reveal: true, delete: true },
    productionLocalAuthorityReady: false,
    productionEnterpriseIdentityReady: true,
    testIdentityUsed: false,
  };
  return freezeAuthority(material);
}

function freezeAuthority(
  material: PersonalModelManagementAuthorityMaterial,
): PersonalModelManagementAuthorityV2 {
  const authorityRevision = Sha256DigestSchema.parse(
    sha256CanonicalJson(JsonObjectSchema.parse({
      domain: MANAGEMENT_AUTHORITY_DOMAIN,
      material,
    })),
  );
  return Object.freeze(PersonalModelManagementAuthorityV2Schema.parse({
    ...material,
    authorityRevision,
  }));
}
