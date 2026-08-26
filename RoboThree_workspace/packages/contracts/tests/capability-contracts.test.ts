import { describe, expect, it } from "vitest";

import {
  AdapterDescriptorSchema,
  CapabilityBindingSchema,
  CapabilityDefinitionSchema,
  CONTRACT_VERSION,
  RegistrySnapshotSchema,
  TaskCapabilityLockSchema,
} from "../src/index.js";

const ids = {
  lock: "019f7447-a784-77b2-a716-000000003001",
  task: "019f7447-a784-77b2-a716-000000003002",
};
const at = "2026-07-20T21:00:00.000Z";
const digestA = `sha256:${"a".repeat(64)}`;
const digestB = `sha256:${"b".repeat(64)}`;
const digestC = `sha256:${"c".repeat(64)}`;
const digestD = `sha256:${"d".repeat(64)}`;
const source = {
  trust: "official" as const,
  packageId: "robothree.official.echo",
  packageRevision: digestA,
};

const toolDefinition = {
  schemaVersion: CONTRACT_VERSION,
  capabilityId: "tool.echo",
  kind: "tool" as const,
  name: "Echo",
  description: "Returns JSON input as a typed observation.",
  source,
  tool: {
    inputSchema: { type: "object", properties: { value: { type: "string" } } },
    outputSchema: { type: "object" },
    readOnlyHint: true,
    risk: {
      schemaVersion: CONTRACT_VERSION,
      sourceRevision: "builtin.echo.v1",
      staticFacts: [],
    },
  },
  revision: digestB,
};

const toolDescriptor = {
  schemaVersion: CONTRACT_VERSION,
  adapterDescriptorId: "adapter.tool.echo",
  adapterKind: "tool_execution_backend" as const,
  source,
  implementationRef: "core:process-echo",
  runtimeBoundary: "child_process" as const,
  protocol: { name: "robothree-tool-stdio", version: "v1alpha1" },
  effectRecoveryMode: "idempotent_retry" as const,
  revision: digestC,
};

const toolBinding = {
  schemaVersion: CONTRACT_VERSION,
  bindingId: "binding.tool.echo",
  capability: {
    capabilityId: toolDefinition.capabilityId,
    capabilityRevision: toolDefinition.revision,
  },
  adapterDescriptor: {
    adapterDescriptorId: toolDescriptor.adapterDescriptorId,
    adapterDescriptorRevision: toolDescriptor.revision,
  },
  port: "tool_execution_backend" as const,
  source,
  revision: digestD,
};

describe("capability contracts", () => {
  it("accepts strict model and tool definitions", () => {
    expect(CapabilityDefinitionSchema.parse(toolDefinition)).toEqual(toolDefinition);
    expect(CapabilityDefinitionSchema.parse({
      schemaVersion: CONTRACT_VERSION,
      capabilityId: "model.default",
      kind: "model",
      name: "Default model",
      description: "Default enterprise model capability.",
      source,
      model: {
        family: "enterprise-chat",
        inputModalities: ["text"],
        outputModalities: ["text"],
        supportsStreaming: true,
      },
      revision: digestB,
    })).toBeDefined();
  });

  it("requires capability IDs to agree with their discriminated kind", () => {
    expect(() => CapabilityDefinitionSchema.parse({
      ...toolDefinition,
      capabilityId: "model.echo",
    })).toThrow("tool capabilityId must start with tool.");
  });

  it("rejects executable values in tool schemas", () => {
    expect(() => CapabilityDefinitionSchema.parse({
      ...toolDefinition,
      tool: { ...toolDefinition.tool, inputSchema: { execute: () => undefined } },
    })).toThrow();
  });

  it("rejects Runtime Handle, PID, connection, and secret fields from descriptors", () => {
    for (const forbidden of [
      { runtimeHandle: {} },
      { pid: 123 },
      { connectionId: "socket-1" },
      { token: "secret" },
    ]) {
      expect(() => AdapterDescriptorSchema.parse({ ...toolDescriptor, ...forbidden })).toThrow();
    }
  });

  it("accepts only a positive bounded local concurrency limit for Tool backends", () => {
    expect(AdapterDescriptorSchema.parse({ ...toolDescriptor, maxConcurrency: 1 }))
      .toMatchObject({ maxConcurrency: 1 });
    for (const maxConcurrency of [0, -1, 1.5, 1025]) {
      expect(() => AdapterDescriptorSchema.parse({ ...toolDescriptor, maxConcurrency })).toThrow();
    }
  });

  it("requires binding port to match capability kind", () => {
    expect(() => CapabilityBindingSchema.parse({
      ...toolBinding,
      port: "model_provider",
    })).toThrow("model_provider binding requires a model. capability");
  });

  it("materializes an internally consistent TaskCapabilityLock", () => {
    expect(TaskCapabilityLockSchema.parse({
      schemaVersion: CONTRACT_VERSION,
      lockId: ids.lock,
      taskId: ids.task,
      registryRevision: digestA,
      definitionSnapshot: toolDefinition,
      bindingSnapshot: toolBinding,
      adapterDescriptorSnapshot: toolDescriptor,
      lockedAt: at,
    })).toBeDefined();
  });

  it("rejects lock references that drift from materialized snapshots", () => {
    expect(() => TaskCapabilityLockSchema.parse({
      schemaVersion: CONTRACT_VERSION,
      lockId: ids.lock,
      taskId: ids.task,
      registryRevision: digestA,
      definitionSnapshot: toolDefinition,
      bindingSnapshot: {
        ...toolBinding,
        capability: { ...toolBinding.capability, capabilityRevision: digestA },
      },
      adapterDescriptorSnapshot: toolDescriptor,
      lockedAt: at,
    })).toThrow("binding snapshot must reference the exact definition snapshot revision");
  });

  it("keeps agent-visible definitions separate from infrastructure resources", () => {
    const snapshot = RegistrySnapshotSchema.parse({
      schemaVersion: CONTRACT_VERSION,
      registryRevision: digestA,
      agentVisibleCapabilities: { models: [], tools: [toolDefinition] },
      infrastructureResources: {
        capabilityBindings: [toolBinding],
        adapterDescriptors: [toolDescriptor],
      },
    });
    expect(Object.keys(snapshot.agentVisibleCapabilities)).toEqual(["models", "tools"]);
    expect(JSON.stringify(snapshot.agentVisibleCapabilities)).not.toContain("implementationRef");
    expect(JSON.stringify(snapshot.agentVisibleCapabilities)).not.toContain("bindingId");
  });
});
