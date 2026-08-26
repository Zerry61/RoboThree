import { CONTRACT_VERSION } from "@robothree/contracts";
import type {
  AdapterDescriptor,
  CapabilitySource,
  TaskCapabilityLock,
} from "@robothree/contracts";

import {
  RegistryBuilder,
  createAdapterDescriptor,
  createCapabilityBinding,
  createCapabilityDefinition,
} from "../src/index.js";

export const capabilityDigest = (value: string) => `sha256:${value.repeat(64)}` as const;

export const capabilitySource: CapabilitySource = {
  trust: "official",
  packageId: "robothree.official.kaf32",
  packageRevision: capabilityDigest("a"),
};

export const capabilityIds = {
  lock: "019f7447-a784-77b2-a716-000000003201",
  lock2: "019f7447-a784-77b2-a716-000000003202",
  task: "019f7447-a784-77b2-a716-000000001001",
};

export function capabilityRecords(adapterId = "adapter.tool.fake.primary") {
  const definition = createCapabilityDefinition({
    schemaVersion: CONTRACT_VERSION,
    capabilityId: "tool.echo",
    kind: "tool",
    name: "Echo tool",
    description: "Returns its JSON input.",
    source: capabilitySource,
    tool: {
      inputSchema: { type: "object" },
      outputSchema: { type: "object" },
      readOnlyHint: true,
      risk: {
        schemaVersion: CONTRACT_VERSION,
        sourceRevision: "builtin.echo.v1",
        staticFacts: [],
      },
    },
  });
  const descriptor = createAdapterDescriptor({
    schemaVersion: CONTRACT_VERSION,
    adapterDescriptorId: adapterId,
    adapterKind: "tool_execution_backend",
    source: capabilitySource,
    implementationRef: `core:${adapterId}`,
    runtimeBoundary: "in_process",
    protocol: { name: "robothree-tool", version: "v1alpha1" },
    effectRecoveryMode: "idempotent_retry",
  });
  const binding = createCapabilityBinding({
    schemaVersion: CONTRACT_VERSION,
    bindingId: "binding.tool.echo",
    capability: {
      capabilityId: definition.capabilityId,
      capabilityRevision: definition.revision,
    },
    adapterDescriptor: {
      adapterDescriptorId: descriptor.adapterDescriptorId,
      adapterDescriptorRevision: descriptor.revision,
    },
    port: "tool_execution_backend",
    source: capabilitySource,
  });
  return { definition, binding, descriptor };
}

export function capabilityRegistry(adapterId?: string) {
  const records = capabilityRecords(adapterId);
  const snapshot = new RegistryBuilder({ trustedSources: [capabilitySource] })
    .registerCapability(records.definition)
    .registerBinding(records.binding)
    .registerAdapterDescriptor(records.descriptor)
    .finalize();
  return { records, snapshot };
}

export function processEchoCapabilityRegistry() {
  const definition = createCapabilityDefinition({
    schemaVersion: CONTRACT_VERSION,
    capabilityId: "tool.echo",
    kind: "tool",
    name: "Process Echo tool",
    description: "Returns its JSON input from a trusted child process.",
    source: capabilitySource,
    tool: {
      inputSchema: { type: "object" },
      outputSchema: { type: "object" },
      readOnlyHint: true,
      risk: {
        schemaVersion: CONTRACT_VERSION,
        sourceRevision: "builtin.process-echo.v1",
        staticFacts: [],
      },
    },
  });
  const descriptor = createAdapterDescriptor({
    schemaVersion: CONTRACT_VERSION,
    adapterDescriptorId: "adapter.tool.process-echo",
    adapterKind: "tool_execution_backend",
    source: capabilitySource,
    implementationRef: "core:process-echo",
    runtimeBoundary: "child_process",
    protocol: { name: "robothree-process-echo", version: "v1alpha1" },
    effectRecoveryMode: "idempotent_retry",
    maxConcurrency: 1,
  });
  const binding = createCapabilityBinding({
    schemaVersion: CONTRACT_VERSION,
    bindingId: "binding.tool.echo",
    capability: {
      capabilityId: definition.capabilityId,
      capabilityRevision: definition.revision,
    },
    adapterDescriptor: {
      adapterDescriptorId: descriptor.adapterDescriptorId,
      adapterDescriptorRevision: descriptor.revision,
    },
    port: "tool_execution_backend",
    source: capabilitySource,
  });
  const snapshot = new RegistryBuilder({ trustedSources: [capabilitySource] })
    .registerCapability(definition)
    .registerBinding(binding)
    .registerAdapterDescriptor(descriptor)
    .finalize();
  return { records: { definition, binding, descriptor }, snapshot };
}

export function capabilityLock(
  overrides: Partial<TaskCapabilityLock> = {},
  adapterId?: string,
): TaskCapabilityLock {
  const { records, snapshot } = capabilityRegistry(adapterId);
  return {
    schemaVersion: CONTRACT_VERSION,
    lockId: capabilityIds.lock,
    taskId: capabilityIds.task,
    registryRevision: snapshot.registryRevision,
    definitionSnapshot: records.definition,
    bindingSnapshot: records.binding,
    adapterDescriptorSnapshot: records.descriptor,
    lockedAt: "2026-07-21T01:00:00.000Z",
    ...overrides,
  };
}

export function requireToolDescriptor(descriptor: AdapterDescriptor) {
  if (descriptor.adapterKind !== "tool_execution_backend") {
    throw new Error("fixture requires a tool execution descriptor");
  }
  return descriptor;
}
