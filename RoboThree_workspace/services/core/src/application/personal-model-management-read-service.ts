import {
  PersonalModelManagementCompatibilityProjectionV1Alpha1Schema,
  PersonalModelPageV1Alpha1Schema,
  PersonalModelSafeProjectionV1Alpha1Schema,
  type PersonalModelManagementCompatibilityProjectionV1Alpha1,
  type PersonalModelPageV1Alpha1,
  type PersonalModelSafeProjectionV1Alpha1,
} from "@robothree/contracts/desktop-local/personal-model-management/v1alpha1";

import type { PersonalCredentialStore } from "../ports/personal-credential-store.js";
import type { PersonalModelPersistence } from "../ports/personal-model-persistence.js";
import { canonicalizePersonalModelEndpoint } from "./personal-model-domain.js";
import type {
  PersonalModelManagementAuthoritySource,
  PersonalModelManagementAuthorityV2,
} from "./personal-model-management-authority.js";

export type PersonalModelManagementReadErrorCode =
  | "personal_model.permission_denied"
  | "personal_model.not_found"
  | "personal_model.cursor_stale"
  | "personal_model.feature_unavailable"
  | "internal";

export type PersonalModelManagementReadResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; code: PersonalModelManagementReadErrorCode }>;

export class PersonalModelManagementReadService {
  public constructor(
    private readonly input: Readonly<{
      persistence: PersonalModelPersistence;
      credentials: PersonalCredentialStore;
      authority: PersonalModelManagementAuthoritySource;
      helperProductionReady: () => boolean;
      transportProductionReady?: () => boolean;
    }>,
  ) {}

  public async compatibility(runtimeInstanceId: string): Promise<
    PersonalModelManagementCompatibilityProjectionV1Alpha1
  > {
    const authority = await this.input.authority.resolve();
    const helperReady = this.input.helperProductionReady();
    const transportReady = this.input.transportProductionReady?.() ?? false;
    const standalone = this.input.authority.deploymentMode === "standalone_local";
    const catalogAvailable = standalone || authority !== undefined;
    return PersonalModelManagementCompatibilityProjectionV1Alpha1Schema.parse({
      contractVersion: "personal-model-management.v1alpha1",
      runtimeInstanceId,
      catalogAvailable,
      mutationAvailable: false,
      revealAvailable: false,
      authorityKind: authority === undefined
        ? (standalone ? "standalone_local_owner" : "unavailable")
        : authority.authorityKind,
      helperState: helperReady ? "production_verified" : "unavailable",
      transportState: transportReady ? "ready" : "unavailable",
      productionIdentityReady: authority !== undefined,
      testIdentityUsed: false,
      reasonCode: !catalogAvailable
        ? "personal_model.permission_denied"
        : authority === undefined
          ? "personal_model.feature_unavailable"
          : !helperReady
            ? "personal_model.credential_store_unavailable"
            : "personal_model.transport_unavailable",
    });
  }

  public async list(input: Readonly<{ cursor?: string; limit: number }>):
  Promise<PersonalModelManagementReadResult<PersonalModelPageV1Alpha1>> {
    const authority = await this.input.authority.resolve();
    if (authority === undefined) {
      if (this.input.authority.deploymentMode === "enterprise_managed") {
        return { ok: false, code: "personal_model.permission_denied" };
      }
      return {
        ok: true,
        value: PersonalModelPageV1Alpha1Schema.parse({
          contractVersion: "personal-model-management.v1alpha1",
          queryRevision: "personal-model-catalog.empty.v1",
          items: [],
        }),
      };
    }
    const page = await this.input.persistence.listActiveHeads(
      ownerIdentity(authority),
      input.cursor,
      input.limit,
    );
    if (!page.ok) {
      return {
        ok: false,
        code: page.error.code === "personal_model.stale_cursor"
          ? "personal_model.cursor_stale"
          : "internal",
      };
    }
    const preference = await this.input.persistence.loadPreference(ownerIdentity(authority));
    const items: PersonalModelSafeProjectionV1Alpha1[] = [];
    for (const head of page.value.heads) {
      const projected = await this.#project(authority, head.personalModelId, preference);
      if (!projected.ok) return { ok: false, code: projected.code };
      items.push(projected.value);
    }
    return {
      ok: true,
      value: PersonalModelPageV1Alpha1Schema.parse({
        contractVersion: "personal-model-management.v1alpha1",
        queryRevision: page.value.queryRevision,
        items,
        ...(page.value.nextCursor === undefined ? {} : { nextCursor: page.value.nextCursor }),
      }),
    };
  }

  public async get(personalModelId: string):
  Promise<PersonalModelManagementReadResult<PersonalModelSafeProjectionV1Alpha1>> {
    const authority = await this.input.authority.resolve();
    if (authority === undefined) {
      return {
        ok: false,
        code: this.input.authority.deploymentMode === "enterprise_managed"
          ? "personal_model.permission_denied"
          : "personal_model.not_found",
      };
    }
    const preference = await this.input.persistence.loadPreference(ownerIdentity(authority));
    return this.#project(authority, personalModelId, preference);
  }

  async #project(
    authority: PersonalModelManagementAuthorityV2,
    personalModelId: string,
    preference: Awaited<ReturnType<PersonalModelPersistence["loadPreference"]>>,
  ): Promise<PersonalModelManagementReadResult<PersonalModelSafeProjectionV1Alpha1>> {
    const owner = ownerIdentity(authority);
    const head = await this.input.persistence.loadHead(owner, personalModelId);
    if (head === undefined || head.selectionState !== "active") {
      return { ok: false, code: "personal_model.not_found" };
    }
    const definition = await this.input.persistence.loadDefinition(
      owner,
      personalModelId,
      head.currentConfigurationRevision,
    );
    const status = await this.input.persistence.loadStatus(
      owner,
      personalModelId,
      head.currentConfigurationRevision,
    );
    if (definition === undefined || status === undefined
      || definition.executionDefinitionDigest !== head.currentExecutionDefinitionDigest
      || status.executionDefinitionDigest !== head.currentExecutionDefinitionDigest) {
      return { ok: false, code: "internal" };
    }
    const observation = await this.input.credentials.inspect(definition.credentialRef);
    const credentialState = observation.state === "present"
      ? "present_masked" as const
      : observation.state === "absent"
        ? "absent" as const
        : "unavailable" as const;
    const unavailableReason = unavailableReasonFor(status.status, credentialState);
    const available = unavailableReason === undefined;
    const sensitiveReason = unavailableReason ?? "personal_model.transport_unavailable";
    const endpoint = canonicalizePersonalModelEndpoint(definition.canonicalEndpoint);
    return {
      ok: true,
      value: PersonalModelSafeProjectionV1Alpha1Schema.parse({
        contractVersion: "personal-model-management.v1alpha1",
        personalModelId,
        configurationRevision: definition.configurationRevision,
        displayName: definition.displayName,
        provider: definition.providerKind,
        protocol: definition.protocol,
        providerModelId: definition.providerModelId,
        endpointDisplayHost: endpoint.endpointDisplayHost,
        capabilities: definition.capabilities,
        status: status.status,
        available,
        ...(unavailableReason === undefined ? {} : { unavailableReason }),
        credentialState,
        preferenceSelected: preference?.modelSource === "personal"
          && preference.modelId === personalModelId
          && preference.configurationRevision === definition.configurationRevision,
        permissions: {
          canConfigure: false,
          canUse: available,
          canReveal: false,
          canDelete: false,
          safeReason: sensitiveReason,
        },
        createdAt: definition.createdAt,
        updatedAt: head.updatedAt,
      }),
    };
  }
}

function ownerIdentity(authority: PersonalModelManagementAuthorityV2) {
  return {
    ownerScopeNamespaceRevision: authority.ownerScopeNamespaceRevision,
    ownerScopeDigest: authority.ownerScopeDigest,
  };
}

function unavailableReasonFor(
  status: "unverified" | "available" | "authentication_failed" | "network_failed"
    | "protocol_incompatible" | "model_not_found" | "unavailable" | "permission_denied",
  credentialState: "absent" | "present_masked" | "unavailable" | "delete_uncertain",
) {
  if (credentialState === "absent" || credentialState === "unavailable") {
    return "credential_unavailable" as const;
  }
  if (credentialState === "delete_uncertain") return "delete_uncertain" as const;
  switch (status) {
    case "unverified":
    case "available":
    case "network_failed":
      return undefined;
    case "authentication_failed":
    case "protocol_incompatible":
    case "model_not_found":
    case "permission_denied":
      return status;
    case "unavailable":
      return "provider_unavailable" as const;
  }
}
