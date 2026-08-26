import {
  CONTRACT_VERSION,
  TaskCapabilityLockSchema,
} from "@robothree/contracts";
import type {
  AdapterDescriptor,
  CapabilityBinding,
  CapabilityDefinition,
  CapabilitySource,
} from "@robothree/contracts";
import { describe, expect, it } from "vitest";

import {
  CapabilityRevisionError,
  RegistryBuildError,
  RegistryBuilder,
  createAdapterDescriptor,
  createCapabilityBinding,
  createCapabilityDefinition,
  hasValidRegistrySnapshotRevision,
  validateTaskCapabilityLockRevisions,
} from "../src/index.js";

const digest = (character: string) => `sha256:${character.repeat(64)}` as const;
const source: CapabilitySource = {
  trust: "official",
  packageId: "robothree.official.alpha",
  packageRevision: digest("a"),
};
const ids = {
  lock: "019f7447-a784-77b2-a716-000000003101",
  task: "019f7447-a784-77b2-a716-000000003102",
};

function modelDefinition(overrides: Partial<CapabilityDefinition> = {}): CapabilityDefinition {
  return createCapabilityDefinition({
    schemaVersion: CONTRACT_VERSION,
    capabilityId: "model.default",
    kind: "model",
    name: "Default model",
    description: "Default model for Alpha registry tests.",
    source,
    model: {
      family: "fake-chat",
      inputModalities: ["text"],
      outputModalities: ["text"],
      supportsStreaming: true,
    },
    ...withoutRevision(overrides),
  } as never);
}

function toolDefinition(overrides: Partial<CapabilityDefinition> = {}): CapabilityDefinition {
  return createCapabilityDefinition({
    schemaVersion: CONTRACT_VERSION,
    capabilityId: "tool.echo",
    kind: "tool",
    name: "Echo tool",
    description: "Returns its JSON input.",
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
    ...withoutRevision(overrides),
  } as never);
}

function modelDescriptor(): AdapterDescriptor {
  return createAdapterDescriptor({
    schemaVersion: CONTRACT_VERSION,
    adapterDescriptorId: "adapter.model.fake",
    adapterKind: "model_provider",
    source,
    implementationRef: "core:fake-model-provider",
    runtimeBoundary: "in_process",
    protocol: { name: "robothree-model", version: "v1alpha1" },
  });
}

function toolDescriptor(): AdapterDescriptor {
  return createAdapterDescriptor({
    schemaVersion: CONTRACT_VERSION,
    adapterDescriptorId: "adapter.tool.fake",
    adapterKind: "tool_execution_backend",
    source,
    implementationRef: "core:fake-tool-backend",
    runtimeBoundary: "in_process",
    protocol: { name: "robothree-tool", version: "v1alpha1" },
    effectRecoveryMode: "idempotent_retry",
  });
}

function toolCatalogDescriptor(): AdapterDescriptor {
  return createAdapterDescriptor({
    schemaVersion: CONTRACT_VERSION,
    adapterDescriptorId: "adapter.tool.catalog.official",
    adapterKind: "tool_catalog_provider",
    source,
    implementationRef: "core:official-tool-catalog",
    runtimeBoundary: "in_process",
    protocol: { name: "robothree-tool-catalog", version: "v1alpha1" },
  });
}

function binding(
  definition: CapabilityDefinition,
  descriptor: AdapterDescriptor,
  bindingId: string,
): CapabilityBinding {
  return createCapabilityBinding({
    schemaVersion: CONTRACT_VERSION,
    bindingId,
    capability: {
      capabilityId: definition.capabilityId,
      capabilityRevision: definition.revision,
    },
    adapterDescriptor: {
      adapterDescriptorId: descriptor.adapterDescriptorId,
      adapterDescriptorRevision: descriptor.revision,
    },
    port: definition.kind === "model" ? "model_provider" : "tool_execution_backend",
    source,
  });
}

function completeRecords() {
  const model = modelDefinition();
  const tool = toolDefinition();
  const modelAdapter = modelDescriptor();
  const toolAdapter = toolDescriptor();
  return {
    definitions: [model, tool] as const,
    descriptors: [modelAdapter, toolAdapter, toolCatalogDescriptor()] as const,
    bindings: [
      binding(model, modelAdapter, "binding.model.default"),
      binding(tool, toolAdapter, "binding.tool.echo"),
    ] as const,
  };
}

function buildComplete(reverse = false) {
  const records = completeRecords();
  const builder = trustedBuilder();
  for (const descriptor of ordered(records.descriptors, reverse)) {
    builder.registerAdapterDescriptor(descriptor);
  }
  for (const bindingRecord of ordered(records.bindings, reverse)) {
    builder.registerBinding(bindingRecord);
  }
  for (const definition of ordered(records.definitions, reverse)) {
    builder.registerCapability(definition);
  }
  return { records, builder, snapshot: builder.finalize() };
}

describe("RegistryBuilder", () => {
  it("computes stable record revisions from canonical JSON", () => {
    const left = toolDefinition({
      tool: {
        inputSchema: { z: 1, nested: { b: true, a: false } },
        readOnlyHint: true,
        risk: {
          schemaVersion: CONTRACT_VERSION,
          sourceRevision: "builtin.echo.v1",
          staticFacts: [],
        },
      },
    } as never);
    const right = toolDefinition({
      tool: {
        inputSchema: { nested: { a: false, b: true }, z: 1 },
        readOnlyHint: true,
        risk: {
          schemaVersion: CONTRACT_VERSION,
          sourceRevision: "builtin.echo.v1",
          staticFacts: [],
        },
      },
    } as never);
    expect(left.revision).toBe(right.revision);
  });

  it("rejects a well-shaped record whose exact revision drifted", () => {
    const definition = toolDefinition();
    const forged = { ...definition, description: "Changed after revision was calculated." };
    expectRegistryError(
      () => trustedBuilder().registerCapability(forged),
      "registry.revision_mismatch",
    );
  });

  it("builds the same sorted snapshot regardless of registration order", () => {
    const forward = buildComplete(false).snapshot;
    const reverse = buildComplete(true).snapshot;
    expect(reverse).toEqual(forward);
    expect(hasValidRegistrySnapshotRevision(forward)).toBe(true);
    expect(hasValidRegistrySnapshotRevision({
      ...forward,
      registryRevision: digest("f"),
    })).toBe(false);
    expect(forward.agentVisibleCapabilities.models.map((item) => item.capabilityId)).toEqual(["model.default"]);
    expect(forward.agentVisibleCapabilities.tools.map((item) => item.capabilityId)).toEqual(["tool.echo"]);
    expect(JSON.stringify(forward.agentVisibleCapabilities)).not.toContain("implementationRef");
  });

  it("deep-freezes the finalized snapshot and every nested collection", () => {
    const snapshot = buildComplete().snapshot;
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.agentVisibleCapabilities)).toBe(true);
    expect(Object.isFrozen(snapshot.agentVisibleCapabilities.tools)).toBe(true);
    expect(Object.isFrozen(snapshot.agentVisibleCapabilities.tools[0]?.tool.inputSchema)).toBe(true);
    expect(() => (snapshot.agentVisibleCapabilities.tools as CapabilityDefinition[])
      .push(toolDefinition())).toThrow(TypeError);
  });

  it("rejects duplicate IDs and duplicate logical names", () => {
    const definition = toolDefinition();
    const duplicateId = trustedBuilder().registerCapability(definition);
    expectRegistryError(() => duplicateId.registerCapability(definition), "registry.duplicate_capability");

    const duplicateName = toolDefinition({ capabilityId: "tool.echo.alias" } as never);
    const names = trustedBuilder()
      .registerCapability(definition)
      .registerCapability(duplicateName);
    expectRegistryError(() => names.finalize(), "registry.duplicate_capability_name");
  });

  it("fails closed on missing bindings and missing adapter descriptors", () => {
    const definition = toolDefinition();
    expectRegistryError(
      () => trustedBuilder().registerCapability(definition).finalize(),
      "registry.missing_binding",
    );

    const descriptor = toolDescriptor();
    const unboundDescriptor = trustedBuilder()
      .registerCapability(definition)
      .registerBinding(binding(definition, descriptor, "binding.tool.echo"));
    expectRegistryError(() => unboundDescriptor.finalize(), "registry.missing_adapter_descriptor");
  });

  it("rejects multiple Alpha bindings instead of introducing silent failover", () => {
    const definition = toolDefinition();
    const descriptor = toolDescriptor();
    const builder = trustedBuilder()
      .registerCapability(definition)
      .registerAdapterDescriptor(descriptor)
      .registerBinding(binding(definition, descriptor, "binding.tool.echo.primary"))
      .registerBinding(binding(definition, descriptor, "binding.tool.echo.secondary"));
    expectRegistryError(() => builder.finalize(), "registry.multiple_bindings");
  });

  it("rejects a binding whose descriptor kind does not match its typed port", () => {
    const definition = toolDefinition();
    const modelAdapter = modelDescriptor();
    const builder = trustedBuilder()
      .registerCapability(definition)
      .registerAdapterDescriptor(modelAdapter)
      .registerBinding(binding(definition, modelAdapter, "binding.tool.invalid"));
    expectRegistryError(() => builder.finalize(), "registry.port_mismatch");
  });

  it("consumes the builder at finalize and rejects later mutation", () => {
    const { builder } = buildComplete();
    expectRegistryError(() => builder.finalize(), "registry.already_finalized");
    expectRegistryError(() => builder.registerCapability(toolDefinition()), "registry.already_finalized");
  });

  it("rejects caller-declared official records not present in the bootstrap trust allowlist", () => {
    const untrusted = toolDefinition({
      source: { ...source, packageId: "vendor.unreviewed.package" },
    } as never);
    expectRegistryError(
      () => trustedBuilder().registerCapability(untrusted),
      "registry.untrusted_source",
    );
  });

  it("validates every materialized TaskCapabilityLock record revision", () => {
    const { records, snapshot } = buildComplete();
    const tool = records.definitions[1];
    const toolBinding = records.bindings[1];
    const toolAdapter = records.descriptors[1];
    const lock = TaskCapabilityLockSchema.parse({
      schemaVersion: CONTRACT_VERSION,
      lockId: ids.lock,
      taskId: ids.task,
      registryRevision: snapshot.registryRevision,
      definitionSnapshot: tool,
      bindingSnapshot: toolBinding,
      adapterDescriptorSnapshot: toolAdapter,
      lockedAt: "2026-07-20T21:30:00.000Z",
    });
    expect(validateTaskCapabilityLockRevisions(lock)).toEqual(lock);

    const forged = {
      ...lock,
      definitionSnapshot: { ...lock.definitionSnapshot, description: "drifted" },
    };
    expect(() => validateTaskCapabilityLockRevisions(forged)).toThrow(CapabilityRevisionError);
  });
});

function ordered<T>(values: readonly T[], reverse: boolean): readonly T[] {
  return reverse ? [...values].reverse() : values;
}

function withoutRevision<T extends { revision?: unknown }>(value: T): Omit<T, "revision"> {
  const { revision: _revision, ...material } = value;
  return material;
}

function expectRegistryError(action: () => unknown, code: RegistryBuildError["code"]): void {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(RegistryBuildError);
    expect((error as RegistryBuildError).code).toBe(code);
    return;
  }
  throw new Error(`Expected RegistryBuildError ${code}`);
}

function trustedBuilder(): RegistryBuilder {
  return new RegistryBuilder({ trustedSources: [source] });
}
