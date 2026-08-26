import { CONTRACT_VERSION } from "@robothree/contracts";
import type {
  CapabilitySource,
  ConfirmationScope,
  PersistedUserConfirmation,
  TaskCapabilityLock,
  ToolAuthorizationContext,
  ToolRiskFactKind,
} from "@robothree/contracts";
import { describe, expect, it } from "vitest";

import {
  AuthorizationEvaluator,
  buildConfirmationScope,
  createAdapterDescriptor,
  createCapabilityBinding,
  createCapabilityDefinition,
  createConfirmationRequest,
  createToolRiskFacts,
} from "../src/index.js";

const entityId = (value: number) => `019f7447-a784-77b2-a716-${String(value).padStart(12, "0")}`;
const digest = (value: string) => `sha256:${value.repeat(64)}` as const;
const ids = {
  task: entityId(4101), run: entityId(4102), step: entityId(4103), action: entityId(4104),
  lock: entityId(4105), confirmation: entityId(4106), decision: entityId(4107), user: entityId(4108), grant: entityId(4109),
};
const at = "2026-07-22T10:00:00.000Z";
const source: CapabilitySource = {
  trust: "official",
  packageId: "robothree.official.authorization-tests",
  packageRevision: digest("a"),
};

describe("AuthorizationEvaluator", () => {
  it("is deterministic and allows a trusted no-side-effect Tool", () => {
    const input = evaluationInput([]);
    const left = new AuthorizationEvaluator().evaluate(input);
    const right = new AuthorizationEvaluator().evaluate(input);
    expect(left).toEqual(right);
    expect(left).toMatchObject({ outcome: "allowed" });
  });

  it("allows routine read/create/modify inside a WorkspaceGrant without confirmation", () => {
    for (const operation of ["read", "create", "modify"] as const) {
      const input = evaluationInput(["routine_file"], {
        context: fileContext(operation, "/workspace/docs/report.md", [operation]),
      });
      expect(new AuthorizationEvaluator().evaluate(input)).toMatchObject({ outcome: "allowed" });
    }
  });

  it("denies Workspace boundary escapes before considering confirmation", () => {
    const input = evaluationInput(["routine_file"], {
      context: fileContext("modify", "/workspace-other/report.md"),
    });
    expect(new AuthorizationEvaluator().evaluate(input)).toMatchObject({
      outcome: "denied",
      reasonCode: "authorization.workspace_boundary_violation",
    });
  });

  it("requires an exact single Action confirmation for deletion", () => {
    const context = fileContext("delete", "/workspace/report.md", ["delete"]);
    const base = evaluationInput(["destructive_file"], { context });
    const request = requestFor(base);
    expect(new AuthorizationEvaluator().evaluate({ ...base, confirmationRequest: request })).toMatchObject({
      outcome: "user_confirmation_required",
      request: { scope: { type: "single_action", actionId: ids.action } },
    });
  });

  it("requires exact single-Action confirmation for bulk overwrite, protected resources, and local execution", () => {
    const cases = [
      evaluationInput(["destructive_file"], {
        context: fileContext("bulk_overwrite", "/workspace", ["bulk_overwrite"]),
      }),
      evaluationInput(["protected_resource"], {
        context: fileContext("modify", "/workspace/protected.txt", ["modify"], true),
      }),
      evaluationInput(["local_execution"]),
    ];
    for (const input of cases) {
      const request = requestFor(input);
      expect(new AuthorizationEvaluator().evaluate({ ...input, confirmationRequest: request })).toMatchObject({
        outcome: "user_confirmation_required",
        request: { scope: { type: "single_action", actionId: ids.action } },
      });
    }
  });

  it("reuses an exact confirmed scope but not a changed Action", () => {
    const context = fileContext("delete", "/workspace/report.md", ["delete"]);
    const base = evaluationInput(["destructive_file"], { context });
    const request = requestFor(base);
    const confirmation = confirmed(request);
    expect(new AuthorizationEvaluator().evaluate({
      ...base,
      confirmationRequest: request,
      persistedConfirmation: confirmation,
    })).toMatchObject({ outcome: "allowed" });

    const changed = { ...base, action: { ...base.action, payload: { path: "/workspace/other.md" } } };
    expect(new AuthorizationEvaluator().evaluate({
      ...changed,
      confirmationRequest: request,
      persistedConfirmation: confirmation,
    })).toMatchObject({ outcome: "denied", reasonCode: "authorization.confirmation_scope_mismatch" });
  });

  it("requires exact Task, target, data scope, and locked revisions for external send", () => {
    const context: ToolAuthorizationContext = {
      ...baseContext(),
      externalDataScope: { externalTarget: "service:central.crm", dataScopeDigest: digest("d") },
    };
    const base = evaluationInput(["external_send"], { context });
    const request = requestFor(base);
    expect(request.scope).toMatchObject({
      type: "task_external_scope",
      taskId: ids.task,
      externalTarget: "service:central.crm",
      dataScopeDigest: digest("d"),
    });
    expect(new AuthorizationEvaluator().evaluate({ ...base, confirmationRequest: request })).toMatchObject({
      outcome: "user_confirmation_required",
    });
    const confirmation = confirmed(request);
    expect(new AuthorizationEvaluator().evaluate({
      ...base,
      confirmationRequest: request,
      persistedConfirmation: confirmation,
    })).toMatchObject({ outcome: "allowed" });

    const changedTarget = {
      ...base,
      context: {
        ...context,
        externalDataScope: { ...context.externalDataScope!, externalTarget: "service:central.erp" },
      },
    };
    const changedData = {
      ...base,
      context: {
        ...context,
        externalDataScope: { ...context.externalDataScope!, dataScopeDigest: digest("e") },
      },
    };
    const changedBinding = {
      ...base,
      lock: {
        ...base.lock,
        bindingSnapshot: { ...base.lock.bindingSnapshot, revision: digest("f") },
      },
    };
    for (const changed of [changedTarget, changedData, changedBinding]) {
      expect(new AuthorizationEvaluator().evaluate({
        ...changed,
        confirmationRequest: request,
        persistedConfirmation: confirmation,
      })).toMatchObject({
        outcome: "denied",
        reasonCode: "authorization.confirmation_scope_mismatch",
      });
    }
  });

  it("matches a FileGrant only to its exact normalized file", () => {
    const context = fileContext("read", "/workspace/report.md", ["read"]);
    const fileGrantContext: ToolAuthorizationContext = {
      ...context,
      subject: {
        ...context.subject,
        grants: context.subject.grants.map((grant) => ({
          ...grant,
          kind: "file" as const,
          rootRealPath: "/workspace/report.md",
        })),
      },
    };
    expect(new AuthorizationEvaluator().evaluate(evaluationInput(["routine_file"], {
      context: fileGrantContext,
    }))).toMatchObject({ outcome: "allowed" });
    expect(new AuthorizationEvaluator().evaluate(evaluationInput(["routine_file"], {
      context: {
        ...fileGrantContext,
        resourceAccesses: [{
          ...fileGrantContext.resourceAccesses[0]!,
          targetRealPath: "/workspace/report.md/child",
        }],
      },
    }))).toMatchObject({
      outcome: "denied",
      reasonCode: "authorization.workspace_boundary_violation",
    });
  });

  it("fails closed for missing permission, unavailable capability, and unknown risk", () => {
    const missingPermission = evaluationInput([], {
      context: { ...baseContext(), subject: { ...baseContext().subject, canUseTools: false } },
    });
    expect(new AuthorizationEvaluator().evaluate(missingPermission)).toMatchObject({
      outcome: "denied", reasonCode: "authorization.tool_permission_missing",
    });

    const unavailable = evaluationInput([], {
      context: { ...baseContext(), availability: { ...baseContext().availability, healthy: false } },
    });
    expect(new AuthorizationEvaluator().evaluate(unavailable)).toMatchObject({
      outcome: "denied", reasonCode: "authorization.capability_unavailable",
    });

    const unknown = evaluationInput(["unknown"]);
    expect(new AuthorizationEvaluator().evaluate(unknown)).toMatchObject({
      outcome: "denied", reasonCode: "authorization.unknown_risk",
    });
  });
});

function evaluationInput(
  risks: readonly ToolRiskFactKind[],
  overrides: { context?: ToolAuthorizationContext } = {},
) {
  const lock = lockFor(risks);
  return {
    taskId: ids.task,
    runId: ids.run,
    stepId: ids.step,
    action: { actionId: ids.action, kind: "tool.secure", payload: { path: "/workspace/report.md" } },
    lock,
    riskFacts: createToolRiskFacts(lock.definitionSnapshot.kind === "tool" ? lock.definitionSnapshot.tool.risk : never()),
    context: overrides.context ?? baseContext(),
  };
}

function lockFor(risks: readonly ToolRiskFactKind[]): TaskCapabilityLock {
  const definition = createCapabilityDefinition({
    schemaVersion: CONTRACT_VERSION,
    capabilityId: "tool.secure",
    kind: "tool",
    name: "Secure test Tool",
    description: "Exercises fixed authorization decisions.",
    source,
    tool: {
      inputSchema: { type: "object" },
      readOnlyHint: false,
      risk: { schemaVersion: CONTRACT_VERSION, sourceRevision: "secure-tool-v1", staticFacts: [...risks] },
    },
  });
  const descriptor = createAdapterDescriptor({
    schemaVersion: CONTRACT_VERSION,
    adapterDescriptorId: "adapter.tool.secure",
    adapterKind: "tool_execution_backend",
    source,
    implementationRef: "core:secure-test",
    runtimeBoundary: "in_process",
    protocol: { name: "robothree-tool", version: "v1alpha1" },
    effectRecoveryMode: "idempotent_retry",
  });
  const binding = createCapabilityBinding({
    schemaVersion: CONTRACT_VERSION,
    bindingId: "binding.tool.secure",
    capability: { capabilityId: definition.capabilityId, capabilityRevision: definition.revision },
    adapterDescriptor: { adapterDescriptorId: descriptor.adapterDescriptorId, adapterDescriptorRevision: descriptor.revision },
    port: "tool_execution_backend",
    source,
  });
  return {
    schemaVersion: CONTRACT_VERSION,
    lockId: ids.lock,
    taskId: ids.task,
    registryRevision: digest("b"),
    definitionSnapshot: definition,
    bindingSnapshot: binding,
    adapterDescriptorSnapshot: descriptor,
    lockedAt: at,
  };
}

function baseContext(): ToolAuthorizationContext {
  return {
    schemaVersion: CONTRACT_VERSION,
    subject: {
      schemaVersion: CONTRACT_VERSION,
      userId: ids.user,
      activeConfigRevision: "config-v1",
      canUseTools: true,
      assignedToolCapabilityIds: ["tool.secure"],
      grants: [],
    },
    resourceAccesses: [],
    availability: { enabled: true, healthy: true, credentialAvailable: true, revision: "availability-v1" },
  };
}

function fileContext(
  operation: "read" | "create" | "modify" | "delete" | "bulk_overwrite",
  targetRealPath: string,
  operations: ("read" | "create" | "modify" | "delete" | "bulk_overwrite")[] = ["modify"],
  protectedResource = false,
): ToolAuthorizationContext {
  return {
    ...baseContext(),
    subject: {
      ...baseContext().subject,
      grants: [{
        schemaVersion: CONTRACT_VERSION,
        grantId: ids.grant,
        kind: "workspace",
        rootRealPath: "/workspace",
        operations,
      }],
    },
    resourceAccesses: [{ grantId: ids.grant, targetRealPath, operation, protectedResource }],
  };
}

function requestFor(base: ReturnType<typeof evaluationInput>) {
  const scope = buildConfirmationScope(base) as ConfirmationScope;
  return createConfirmationRequest({
    confirmationId: ids.confirmation,
    scope,
    runId: ids.run,
    stepId: ids.step,
    actionId: ids.action,
    requestedAt: at,
  });
}

function confirmed(request: ReturnType<typeof requestFor>): PersistedUserConfirmation {
  return {
    request,
    decision: {
      schemaVersion: CONTRACT_VERSION,
      decisionId: ids.decision,
      confirmationId: request.confirmationId,
      scopeDigest: request.scopeDigest,
      decision: "confirmed",
      decidedByUserId: ids.user,
      decidedAt: at,
    },
  };
}

function never(): never {
  throw new Error("test lock must be a Tool");
}
