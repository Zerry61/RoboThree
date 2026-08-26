import { describe, expect, it } from "vitest";

import {
  AuthorizationDecisionSchema,
  CONTRACT_VERSION,
  ToolAuthorizationContextSchema,
  ToolRiskFactsSchema,
  TaskModelExternalConfirmationScopeSchema,
  UserConfirmationRequestSchema,
} from "../src/index.js";

const entityId = (value: number) => `019f7447-a784-77b2-a716-${String(value).padStart(12, "0")}`;
const digest = (value: string) => `sha256:${value.repeat(64)}`;
const at = "2026-07-22T13:00:00.000Z";

describe("authorization contracts", () => {
  it("accepts strict versioned risk and decision records", () => {
    expect(ToolRiskFactsSchema.parse({
      schemaVersion: CONTRACT_VERSION,
      sourceRevision: "tool-risk-v1",
      facts: ["local_execution"],
      factsDigest: digest("a"),
    })).toBeDefined();
    expect(AuthorizationDecisionSchema.parse({
      schemaVersion: CONTRACT_VERSION,
      outcome: "denied",
      reasonCode: "authorization.unknown_risk",
      decisionDigest: digest("b"),
    })).toBeDefined();
  });

  it("rejects legacy and unknown versions at new Authorization boundaries", () => {
    const base = {
      sourceRevision: "tool-risk-v1",
      facts: [],
      factsDigest: digest("a"),
    };
    expect(() => ToolRiskFactsSchema.parse({ schemaVersion: "v1alpha1", ...base })).toThrow();
    expect(() => ToolRiskFactsSchema.parse({ schemaVersion: "v9", ...base })).toThrow();
  });

  it("rejects Secret, Runtime Handle, PID, and undeclared fields", () => {
    const request = confirmationRequest();
    for (const forbidden of [
      { token: "secret" },
      { runtimeHandle: {} },
      { pid: 123 },
      { prompt: "sensitive body" },
    ]) {
      expect(() => UserConfirmationRequestSchema.parse({ ...request, ...forbidden })).toThrow();
    }
    expect(() => UserConfirmationRequestSchema.parse({
      ...request,
      displaySummary: "Execute request with token=qa-only-fake-secret",
    })).toThrow();
  });

  it("requires absolute grants and rejects duplicate assignments", () => {
    const context = authorizationContext();
    expect(() => ToolAuthorizationContextSchema.parse({
      ...context,
      subject: {
        ...context.subject,
        assignedToolCapabilityIds: ["tool.echo", "tool.echo"],
      },
    })).toThrow("assigned tools must be unique");
    expect(() => ToolAuthorizationContextSchema.parse({
      ...context,
      subject: {
        ...context.subject,
        grants: [{
          schemaVersion: CONTRACT_VERSION,
          grantId: entityId(5008),
          kind: "workspace",
          rootRealPath: "relative/path",
          operations: ["read"],
        }],
      },
    })).toThrow("grant rootRealPath must be absolute");
  });

  it("locks Model external confirmation to the exact runtime selection and capability revisions", () => {
    const scope = TaskModelExternalConfirmationScopeSchema.parse({
      schemaVersion: CONTRACT_VERSION,
      type: "task_model_external_scope",
      taskId: entityId(5010),
      runtimeSelectionDigest: digest("1"),
      modelCapabilityRevision: digest("2"),
      bindingRevision: digest("3"),
      adapterDescriptorRevision: digest("4"),
      externalTarget: "gateway.enterprise.model",
      dataCategories: ["user_text", "tool_schema"],
      dataScopeDigest: digest("5"),
    });

    expect(scope.dataCategories).toEqual(["user_text", "tool_schema"]);
    expect(() => TaskModelExternalConfirmationScopeSchema.parse({
      ...scope,
      dataCategories: ["user_text", "user_text"],
    })).toThrow("model external data categories must be unique");
    expect(() => TaskModelExternalConfirmationScopeSchema.parse({
      ...scope,
      credentialRef: "must-not-cross-contract",
    })).toThrow();
  });
});

function confirmationRequest() {
  return {
    schemaVersion: CONTRACT_VERSION,
    confirmationId: entityId(5001),
    runId: entityId(5002),
    stepId: entityId(5003),
    actionId: entityId(5004),
    scope: {
      schemaVersion: CONTRACT_VERSION,
      type: "single_action",
      taskId: entityId(5005),
      runId: entityId(5002),
      stepId: entityId(5003),
      actionId: entityId(5004),
      actionDigest: digest("c"),
      toolCapabilityRevision: digest("d"),
      bindingRevision: digest("e"),
      adapterDescriptorRevision: digest("f"),
    },
    scopeDigest: digest("0"),
    displaySummary: "Confirm this exact Tool Action",
    requestedAt: at,
  };
}

function authorizationContext() {
  return {
    schemaVersion: CONTRACT_VERSION,
    subject: {
      schemaVersion: CONTRACT_VERSION,
      userId: entityId(5006),
      activeConfigRevision: "config-v1",
      canUseTools: true,
      assignedToolCapabilityIds: ["tool.echo"],
      grants: [],
    },
    resourceAccesses: [],
    availability: { enabled: true, healthy: true, credentialAvailable: true, revision: "health-v1" },
  };
}
