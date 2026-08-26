import {
  AuthorizationDecisionSchema,
  CONTRACT_VERSION,
  ConfirmationScopeSchema,
  JsonValueSchema,
  PersistedUserConfirmationSchema,
  TaskCapabilityLockSchema,
  ToolAuthorizationContextSchema,
  ToolRiskFactsSchema,
  UserConfirmationRequestSchema,
  userConfirmationDisplaySummary,
} from "@robothree/contracts";
import type {
  Action,
  AuthorizationDecision,
  ConfirmationScope,
  PersistedUserConfirmation,
  TaskCapabilityLock,
  ToolAuthorizationContext,
  ToolRiskDeclaration,
  ToolRiskFactKind,
  ToolRiskFacts,
  UserConfirmationRequest,
} from "@robothree/contracts";

import { sha256CanonicalJson } from "../persistence/digest.js";

export type AuthorizationEvaluationInput = {
  taskId: string;
  runId: string;
  stepId: string;
  action: Action;
  lock: TaskCapabilityLock;
  riskFacts: ToolRiskFacts;
  context: ToolAuthorizationContext;
  confirmationRequest?: UserConfirmationRequest;
  persistedConfirmation?: PersistedUserConfirmation;
};

export class AuthorizationEvaluator {
  public evaluate(input: AuthorizationEvaluationInput): AuthorizationDecision {
    const lock = TaskCapabilityLockSchema.parse(input.lock);
    const riskFacts = ToolRiskFactsSchema.parse(input.riskFacts);
    const context = ToolAuthorizationContextSchema.parse(input.context);
    const denied = this.#fixedDenial(input, lock, riskFacts, context);
    if (denied !== undefined) {
      return createAuthorizationDecision({ outcome: "denied", reasonCode: denied });
    }

    const scope = requiredConfirmationScope(input, lock, riskFacts, context);
    if (scope === undefined) {
      return createAuthorizationDecision({ outcome: "allowed" });
    }

    const scopeDigest = digestScope(scope);
    const persisted = input.persistedConfirmation === undefined
      ? undefined
      : PersistedUserConfirmationSchema.parse(input.persistedConfirmation);
    if (persisted !== undefined && persisted.request.scopeDigest === scopeDigest) {
      if (persisted.decision?.decision === "confirmed") {
        return createAuthorizationDecision({ outcome: "allowed" });
      }
      if (persisted.decision?.decision === "rejected") {
        return createAuthorizationDecision({ outcome: "denied", reasonCode: "authorization.user_rejected" });
      }
    }

    const request = UserConfirmationRequestSchema.parse(input.confirmationRequest);
    if (request.scopeDigest !== scopeDigest || digestScope(request.scope) !== scopeDigest) {
      return createAuthorizationDecision({ outcome: "denied", reasonCode: "authorization.confirmation_scope_mismatch" });
    }
    return createAuthorizationDecision({ outcome: "user_confirmation_required", request });
  }

  #fixedDenial(
    input: AuthorizationEvaluationInput,
    lock: TaskCapabilityLock,
    riskFacts: ToolRiskFacts,
    context: ToolAuthorizationContext,
  ): string | undefined {
    const definition = lock.definitionSnapshot;
    if (definition.kind !== "tool" || definition.capabilityId !== input.action.kind) {
      return "authorization.tool_lock_mismatch";
    }
    if (lock.taskId !== input.taskId) {
      return "authorization.task_lock_mismatch";
    }
    if (!context.subject.canUseTools) {
      return "authorization.tool_permission_missing";
    }
    if (!context.subject.assignedToolCapabilityIds.includes(definition.capabilityId)) {
      return "authorization.tool_not_assigned";
    }
    if (!context.availability.enabled || !context.availability.healthy || !context.availability.credentialAvailable) {
      return "authorization.capability_unavailable";
    }
    if (definition.tool.risk.sourceRevision !== riskFacts.sourceRevision) {
      return "authorization.risk_revision_mismatch";
    }
    if (!hasValidRiskDigest(riskFacts)) {
      return "authorization.risk_digest_mismatch";
    }
    const declared = new Set(definition.tool.risk.staticFacts);
    if (riskFacts.facts.some((fact) => !declared.has(fact))) {
      return "authorization.risk_facts_not_declared";
    }
    if (riskFacts.facts.includes("unknown")) {
      return "authorization.unknown_risk";
    }

    const accessDenial = validateResourceAccesses(context);
    if (accessDenial !== undefined) {
      return accessDenial;
    }
    const accesses = context.resourceAccesses;
    if (accesses.length > 0 && !riskFacts.facts.some((fact) => (
      fact === "routine_file" || fact === "destructive_file" || fact === "protected_resource"
    ))) {
      return "authorization.file_risk_not_declared";
    }
    if (accesses.some((access) => access.operation === "delete" || access.operation === "bulk_overwrite")
      && !riskFacts.facts.includes("destructive_file")) {
      return "authorization.destructive_risk_not_declared";
    }
    if (accesses.some((access) => access.protectedResource) && !riskFacts.facts.includes("protected_resource")) {
      return "authorization.protected_risk_not_declared";
    }
    if (context.externalDataScope !== undefined && !riskFacts.facts.includes("external_send")) {
      return "authorization.external_risk_not_declared";
    }
    if (riskFacts.facts.includes("external_send") && context.externalDataScope === undefined) {
      return "authorization.external_scope_missing";
    }
    if (riskFacts.facts.includes("external_send") && riskFacts.facts.some((fact) => (
      fact === "destructive_file" || fact === "protected_resource" || fact === "local_execution"
    ))) {
      return "authorization.mixed_confirmation_scope_unsupported";
    }
    return undefined;
  }
}

export function createToolRiskFacts(declaration: ToolRiskDeclaration): ToolRiskFacts {
  return createToolRiskFactsForKinds(declaration, declaration.staticFacts);
}

export function createToolRiskFactsForKinds(
  declaration: ToolRiskDeclaration,
  kinds: readonly ToolRiskFactKind[],
): ToolRiskFacts {
  const declared = new Set(declaration.staticFacts);
  const facts = [...new Set(kinds)].sort();
  for (const fact of facts) {
    if (!declared.has(fact)) {
      return ToolRiskFactsSchema.parse({
        schemaVersion: CONTRACT_VERSION,
        sourceRevision: declaration.sourceRevision,
        facts,
        factsDigest: "0".repeat(64),
      });
    }
  }
  const material = {
    schemaVersion: CONTRACT_VERSION,
    sourceRevision: declaration.sourceRevision,
    facts,
  };
  return ToolRiskFactsSchema.parse({
    ...material,
    factsDigest: sha256CanonicalJson(JsonValueSchema.parse(material)),
  });
}

export function createConfirmationRequest(input: {
  confirmationId: string;
  scope: ConfirmationScope;
  requestedAt: string;
  runId?: string;
  stepId?: string;
  actionId?: string;
}): UserConfirmationRequest {
  const scope = ConfirmationScopeSchema.parse(input.scope);
  return UserConfirmationRequestSchema.parse({
    schemaVersion: CONTRACT_VERSION,
    confirmationId: input.confirmationId,
    ...(input.runId === undefined ? {} : { runId: input.runId }),
    ...(input.stepId === undefined ? {} : { stepId: input.stepId }),
    ...(input.actionId === undefined ? {} : { actionId: input.actionId }),
    scope,
    scopeDigest: digestScope(scope),
    displaySummary: userConfirmationDisplaySummary(scope),
    requestedAt: input.requestedAt,
  });
}

export function buildConfirmationScope(input: Omit<AuthorizationEvaluationInput, "confirmationRequest" | "persistedConfirmation">): ConfirmationScope | undefined {
  return requiredConfirmationScope(
    input,
    TaskCapabilityLockSchema.parse(input.lock),
    ToolRiskFactsSchema.parse(input.riskFacts),
    ToolAuthorizationContextSchema.parse(input.context),
  );
}

function requiredConfirmationScope(
  input: Pick<AuthorizationEvaluationInput, "taskId" | "runId" | "stepId" | "action">,
  lock: TaskCapabilityLock,
  risks: ToolRiskFacts,
  context: ToolAuthorizationContext,
): ConfirmationScope | undefined {
  const definition = lock.definitionSnapshot;
  if (definition.kind !== "tool") {
    return undefined;
  }
  const revisions = {
    toolCapabilityRevision: definition.revision,
    bindingRevision: lock.bindingSnapshot.revision,
    adapterDescriptorRevision: lock.adapterDescriptorSnapshot.revision,
  };
  if (risks.facts.includes("external_send") && context.externalDataScope !== undefined) {
    return ConfirmationScopeSchema.parse({
      schemaVersion: CONTRACT_VERSION,
      type: "task_external_scope",
      taskId: input.taskId,
      externalTarget: context.externalDataScope.externalTarget,
      dataScopeDigest: context.externalDataScope.dataScopeDigest,
      ...revisions,
    });
  }
  if (risks.facts.some((fact) => (
    fact === "destructive_file" || fact === "protected_resource" || fact === "local_execution"
  ))) {
    return ConfirmationScopeSchema.parse({
      schemaVersion: CONTRACT_VERSION,
      type: "single_action",
      taskId: input.taskId,
      runId: input.runId,
      stepId: input.stepId,
      actionId: input.action.actionId,
      actionDigest: sha256CanonicalJson(JsonValueSchema.parse(input.action)),
      ...revisions,
    });
  }
  return undefined;
}

function validateResourceAccesses(context: ToolAuthorizationContext): string | undefined {
  for (const access of context.resourceAccesses) {
    const grant = context.subject.grants.find((candidate) => candidate.grantId === access.grantId);
    if (grant === undefined) {
      return "authorization.grant_missing";
    }
    if (!grant.operations.includes(access.operation)) {
      return "authorization.operation_not_granted";
    }
    const inside = grant.kind === "file"
      ? access.targetRealPath === grant.rootRealPath
      : pathWithin(access.targetRealPath, grant.rootRealPath);
    if (!inside) {
      return "authorization.workspace_boundary_violation";
    }
  }
  return undefined;
}

function pathWithin(target: string, root: string): boolean {
  const normalizedRoot = root === "/" ? "/" : root.replace(/\/+$/u, "");
  return target === normalizedRoot || normalizedRoot === "/" || target.startsWith(`${normalizedRoot}/`);
}

function digestScope(scope: ConfirmationScope): string {
  return sha256CanonicalJson(JsonValueSchema.parse(ConfirmationScopeSchema.parse(scope)));
}

function hasValidRiskDigest(facts: ToolRiskFacts): boolean {
  const { factsDigest, ...material } = ToolRiskFactsSchema.parse(facts);
  return factsDigest === sha256CanonicalJson(JsonValueSchema.parse(material));
}

type AuthorizationDecisionMaterial =
  | { outcome: "allowed" }
  | { outcome: "denied"; reasonCode: string }
  | { outcome: "user_confirmation_required"; request: UserConfirmationRequest };

export function createAuthorizationDecision(material: AuthorizationDecisionMaterial): AuthorizationDecision {
  const versioned = { schemaVersion: CONTRACT_VERSION, ...material };
  return AuthorizationDecisionSchema.parse({
    ...versioned,
    decisionDigest: sha256CanonicalJson(JsonValueSchema.parse(versioned)),
  });
}
