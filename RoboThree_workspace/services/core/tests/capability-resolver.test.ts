import { describe, expect, it } from "vitest";

import {
  CapabilityResolutionError,
  CapabilityResolver,
  calculateRegistryRevision,
} from "../src/index.js";
import { capabilityLock, capabilityRegistry } from "./capability.fixtures.js";

describe("CapabilityResolver", () => {
  it("resolves one exact static route by explicit ID", () => {
    const { records, snapshot } = capabilityRegistry();
    const resolver = new CapabilityResolver(snapshot);
    expect(resolver.resolveById(snapshot.registryRevision, records.definition.capabilityId)).toEqual({
      registryRevision: snapshot.registryRevision,
      definition: records.definition,
      binding: records.binding,
      adapterDescriptor: records.descriptor,
    });
    expect("search" in resolver).toBe(false);
    expect("score" in resolver).toBe(false);
  });

  it("returns typed errors for registry mismatch and missing explicit IDs", () => {
    const { snapshot } = capabilityRegistry();
    const resolver = new CapabilityResolver(snapshot);
    expectCode(() => resolver.resolveById(`sha256:${"f".repeat(64)}`, "tool.echo"),
      "capability.registry_revision_mismatch");
    expectCode(() => resolver.resolveById(snapshot.registryRevision, "tool.missing"),
      "capability.not_found");
  });

  it("fails with a typed ambiguous error for a corrupted but canonically digested snapshot", () => {
    const { snapshot } = capabilityRegistry();
    const material = {
      schemaVersion: snapshot.schemaVersion,
      agentVisibleCapabilities: {
        ...snapshot.agentVisibleCapabilities,
        tools: [
          ...snapshot.agentVisibleCapabilities.tools,
          ...snapshot.agentVisibleCapabilities.tools,
        ],
      },
      infrastructureResources: snapshot.infrastructureResources,
    };
    const corrupted = { ...material, registryRevision: calculateRegistryRevision(material) };
    const resolver = new CapabilityResolver(corrupted);
    expectCode(
      () => resolver.resolveById(corrupted.registryRevision, "tool.echo"),
      "capability.ambiguous",
    );
  });

  it.each([
    [{ revoked: true }, "capability.revoked"],
    [{ disabled: true }, "capability.disabled"],
    [{ credentialStatus: "unavailable" }, "capability.credential_unavailable"],
    [{ healthStatus: "unhealthy" }, "capability.health_unavailable"],
  ] as const)("applies live state as a deny-only overlay %#", (state, code) => {
    const { records, snapshot } = capabilityRegistry();
    const resolver = new CapabilityResolver(snapshot);
    expectCode(() => resolver.resolveById(snapshot.registryRevision, "tool.echo", {
      capabilityId: "tool.echo",
      bindingId: records.binding.bindingId,
      adapterDescriptorId: records.descriptor.adapterDescriptorId,
      ...state,
    }), code);
  });

  it("allows a degraded but available exact route without changing its Binding", () => {
    const { records, snapshot } = capabilityRegistry();
    const route = new CapabilityResolver(snapshot).resolveById(snapshot.registryRevision, "tool.echo", {
      capabilityId: "tool.echo",
      bindingId: records.binding.bindingId,
      adapterDescriptorId: records.descriptor.adapterDescriptorId,
      credentialStatus: "available",
      healthStatus: "degraded",
    });
    expect(route.binding).toEqual(records.binding);
    expect(route.adapterDescriptor).toEqual(records.descriptor);
  });

  it("does not reinterpret live state for another binding or silently fall back", () => {
    const { snapshot } = capabilityRegistry();
    const resolver = new CapabilityResolver(snapshot);
    expectCode(() => resolver.resolveById(snapshot.registryRevision, "tool.echo", {
      capabilityId: "tool.echo",
      bindingId: "binding.tool.another",
      adapterDescriptorId: "adapter.tool.another",
      healthStatus: "unhealthy",
    }), "capability.state_subject_mismatch");
  });

  it("validates a materialized old-task lock without using the current RegistrySnapshot", () => {
    const current = capabilityRegistry("adapter.tool.fake.current");
    const oldLock = capabilityLock({}, "adapter.tool.fake.old");
    const route = new CapabilityResolver(current.snapshot).resolveLocked(oldLock);
    expect(route.adapterDescriptor.adapterDescriptorId).toBe("adapter.tool.fake.old");
    expect(route.registryRevision).toBe(oldLock.registryRevision);
  });
});

function expectCode(action: () => unknown, code: CapabilityResolutionError["code"]): void {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(CapabilityResolutionError);
    expect((error as CapabilityResolutionError).code).toBe(code);
    return;
  }
  throw new Error(`Expected CapabilityResolutionError ${code}`);
}
