import type { PreviewReasoningModeQuery } from "@robothree/contracts";
import { ReasoningProfileSubjectSchema } from
  "@robothree/contracts/reasoning-mode/v1alpha1";

import type {
  DesktopReasoningModeOwnerAuthorityProvider,
  EffectiveReasoningModelResolver,
} from "../ports/desktop-reasoning-mode.js";
import type { PersonalModelPersistence } from
  "../ports/personal-model-persistence.js";
import {
  deriveLocalDesktopSubjectAuthority,
  validateLocalDesktopSubjectAuthority,
} from "./local-desktop-subject-authority.js";
import {
  validatePersonalModelDefinition,
  validatePersonalModelHead,
  validatePersonalModelStatusFact,
} from "./personal-model-domain.js";
import { materializePersonalModelRegistryFacts } from
  "./personal-model-task-lock.js";

export class LocalDesktopReasoningModeOwnerAuthorityProvider
implements DesktopReasoningModeOwnerAuthorityProvider {
  public constructor(private readonly dependencies: Readonly<{
    personal: PersonalModelPersistence;
    clientInstanceId: string;
    testIdentityUsed?: boolean;
  }>) {}

  public async resolve() {
    const namespace = await this.dependencies.personal.loadActiveOwnerNamespace();
    if (namespace === undefined) {
      return Object.freeze({
        state: "unavailable" as const,
        testIdentityUsed: false as const,
        productionIdentityReady: false as const,
      });
    }
    const authority = validateLocalDesktopSubjectAuthority(
      namespace,
      deriveLocalDesktopSubjectAuthority(namespace),
    );
    const testIdentityUsed = this.dependencies.testIdentityUsed === true;
    return Object.freeze({
      state: "available" as const,
      enterpriseId: "local-desktop",
      userId: authority.ownerScopeDigest,
      deviceId: authority.authorityRevision,
      currentClientInstanceId: this.dependencies.clientInstanceId,
      authoritySource: testIdentityUsed ? "test_only" as const : "local_desktop_owner" as const,
      testIdentityUsed,
      productionIdentityReady: !testIdentityUsed,
    });
  }
}

export class LocalPersonalEffectiveReasoningModelResolver
implements EffectiveReasoningModelResolver<PreviewReasoningModeQuery> {
  public constructor(private readonly personal: PersonalModelPersistence) {}

  public async resolve(query: PreviewReasoningModeQuery) {
    const modelId = query.requestedModelId;
    if (modelId === undefined) {
      throw new Error("reasoning.runtime_dependencies_unavailable");
    }
    const namespace = await this.personal.loadActiveOwnerNamespace();
    if (namespace === undefined) {
      throw new Error("reasoning.runtime_dependencies_unavailable");
    }
    const authority = validateLocalDesktopSubjectAuthority(
      namespace,
      deriveLocalDesktopSubjectAuthority(namespace),
    );
    const ownerIdentity = {
      ownerScopeNamespaceRevision: authority.ownerScopeNamespaceRevision,
      ownerScopeDigest: authority.ownerScopeDigest,
    };
    const headRecord = await this.personal.loadHead(ownerIdentity, modelId);
    if (headRecord === undefined) {
      throw new Error("reasoning.runtime_dependencies_unavailable");
    }
    const head = validatePersonalModelHead(headRecord);
    if (head.selectionState !== "active") {
      throw new Error("reasoning.runtime_dependencies_unavailable");
    }
    const definitionRecord = await this.personal.loadDefinition(
      ownerIdentity,
      modelId,
      head.currentConfigurationRevision,
    );
    const statusRecord = await this.personal.loadStatus(
      ownerIdentity,
      modelId,
      head.currentConfigurationRevision,
    );
    if (definitionRecord === undefined || statusRecord === undefined) {
      throw new Error("reasoning.runtime_dependencies_unavailable");
    }
    const definition = validatePersonalModelDefinition(definitionRecord);
    const status = validatePersonalModelStatusFact(statusRecord);
    if (definition.executionDefinitionDigest !== head.currentExecutionDefinitionDigest
      || status.executionDefinitionDigest !== definition.executionDefinitionDigest
      || !isSelectableStatus(status.status)
      || !definition.capabilities.includes("text")) {
      throw new Error("reasoning.runtime_dependencies_unavailable");
    }
    const facts = materializePersonalModelRegistryFacts(definition);
    const subject = ReasoningProfileSubjectSchema.parse({
      authority: "local_personal",
      modelCapabilityId: facts.capability.capabilityId,
      modelCapabilityRevision: facts.capability.revision,
      adapterDescriptorId: facts.descriptor.adapterDescriptorId,
      adapterDescriptorRevision: facts.descriptor.revision,
      personalExecutionDefinitionDigest: definition.executionDefinitionDigest,
    });
    return Object.freeze({
      modelId: facts.capability.capabilityId,
      modelRevision: facts.capability.revision,
      subject,
    });
  }
}

function isSelectableStatus(status: string): boolean {
  return status === "unverified" || status === "available" || status === "network_failed";
}
