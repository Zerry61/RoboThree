import { CONTRACT_VERSION } from "@robothree/contracts";
import { describe, expect, it } from "vitest";

import {
  createAdapterDescriptor,
  createCapabilityBinding,
  createCapabilityDefinition,
} from "../src/registry/capability-revision.js";
import { RegistryBuilder } from "../src/registry/registry-builder.js";
import {
  INTERNAL_TRIAL_ENTERPRISE_MODEL_DEPLOYMENT_ENV,
  consumeInternalTrialEnterpriseModelDeployment,
} from "../src/bootstrap/internal-trial-enterprise-model-deployment.js";
import {
  INTERNAL_TRIAL_ENTERPRISE_ACCESS_TOKEN_ENV,
} from "../src/adapters/environment/internal-trial-enterprise-access-token-provider.js";
import { createDesktopPrivateRuntime } from
  "../src/bootstrap/create-desktop-private-runtime.js";

const source = Object.freeze({
  trust: "enterprise" as const,
  packageId: "deployment.internal-trial",
  packageRevision: `sha256:${"a".repeat(64)}` as const,
});

describe("internal-trial enterprise Model deployment", () => {
  it("consumes one exact remote Model graph and marks it non-Admin-managed", () => {
    const environment = {
      [INTERNAL_TRIAL_ENTERPRISE_MODEL_DEPLOYMENT_ENV]: JSON.stringify(fixture()),
    };
    const deployment = consumeInternalTrialEnterpriseModelDeployment({ environment });

    expect(environment).not.toHaveProperty(INTERNAL_TRIAL_ENTERPRISE_MODEL_DEPLOYMENT_ENV);
    expect(deployment).toMatchObject({
      source: "deployment/internal_trial",
      managedByAdmin: false,
      adminMutationReady: false,
      centralBaseUrl: "https://central.internal.example/",
      allowInsecureLoopback: false,
      capability: { capabilityId: "model.internal-trial" },
      binding: { bindingId: "binding.model.internal-trial" },
      descriptor: { adapterDescriptorId: "adapter.model.internal-trial" },
      model: {
        modelId: "model.internal-trial",
        source: "enterprise",
        capabilities: { supportsToolCalling: true, supportsStreaming: true },
      },
    });
  });

  it("fails closed for revision drift, ambiguous binding and a non-loopback HTTP origin", () => {
    const base = fixture();
    for (const candidate of [
      { ...base, registrySnapshot: { ...base.registrySnapshot,
        registryRevision: `sha256:${"f".repeat(64)}` } },
      { ...base, registrySnapshot: { ...base.registrySnapshot,
        infrastructureResources: { ...base.registrySnapshot.infrastructureResources,
          capabilityBindings: [
            ...base.registrySnapshot.infrastructureResources.capabilityBindings,
            { ...base.registrySnapshot.infrastructureResources.capabilityBindings[0]!,
              bindingId: "binding.model.internal-trial.duplicate" },
          ] } } },
      { ...base, centralBaseUrl: "http://central.internal.example" },
    ]) {
      const environment = {
        [INTERNAL_TRIAL_ENTERPRISE_MODEL_DEPLOYMENT_ENV]: JSON.stringify(candidate),
      };
      expect(() => consumeInternalTrialEnterpriseModelDeployment({ environment }))
        .toThrowError(expect.objectContaining({
          code: "internal_trial_model_deployment_invalid",
        }));
      expect(environment).not.toHaveProperty(
        INTERNAL_TRIAL_ENTERPRISE_MODEL_DEPLOYMENT_ENV,
      );
    }
  });

  it("returns undefined when no deployment was configured", () => {
    expect(consumeInternalTrialEnterpriseModelDeployment({ environment: {} }))
      .toBeUndefined();
  });

  it("builds a strict internal registry for one Admin-managed model", () => {
    const environment = {
      [INTERNAL_TRIAL_ENTERPRISE_MODEL_DEPLOYMENT_ENV]: JSON.stringify({
        schemaVersion: "mvp-admin-vs1.internal-trial.v1",
        centralBaseUrl: "http://127.0.0.1:41731",
        configurationRevision: `sha256:${"d".repeat(64)}`,
        modelId: "model.admin-managed",
        modelCreatedAt: "2026-08-30T00:00:00.000Z",
        displayName: "Admin Managed Model",
        supportsToolCalling: true,
        contextWindowTokens: 400_000,
        maxOutputTokens: 128_000,
      }),
    };

    const deployment = consumeInternalTrialEnterpriseModelDeployment({ environment });

    expect(environment).not.toHaveProperty(INTERNAL_TRIAL_ENTERPRISE_MODEL_DEPLOYMENT_ENV);
    expect(deployment).toMatchObject({
      managedByAdmin: true,
      adminMutationReady: true,
      allowInsecureLoopback: true,
      configurationRevision: `sha256:${"d".repeat(64)}`,
      capability: {
        capabilityId: "model.admin-managed",
        name: "Admin Managed Model",
        model: { contextWindow: 400_000 },
      },
      descriptor: {
        configurationRef: expect.stringMatching(
          /^model-capability-profile:v1\/400000\/128000\/[a-f0-9]{64}$/u,
        ),
      },
      binding: {
        configurationRef: expect.stringMatching(
          /^model-capability-profile:v1\/400000\/128000\/[a-f0-9]{64}$/u,
        ),
      },
      model: {
        modelId: "model.admin-managed",
        source: "enterprise",
      },
    });
  });

  it("projects the exact deployment Model through the normal Desktop catalog", async () => {
    const now = Date.now();
    const environment = {
      [INTERNAL_TRIAL_ENTERPRISE_MODEL_DEPLOYMENT_ENV]: JSON.stringify(fixture()),
      [INTERNAL_TRIAL_ENTERPRISE_ACCESS_TOKEN_ENV]: compactToken({
        issuedAt: new Date(now - 60_000).toISOString(),
        expiresAt: new Date(now + 3_600_000).toISOString(),
      }),
    };
    const runtime = createDesktopPrivateRuntime({
      databasePath: ":memory:",
      authorizationToken: "internal-trial-bootstrap-test-token",
      environment,
    });

    expect(environment).not.toHaveProperty(
      INTERNAL_TRIAL_ENTERPRISE_MODEL_DEPLOYMENT_ENV,
    );
    expect(environment).not.toHaveProperty(
      INTERNAL_TRIAL_ENTERPRISE_ACCESS_TOKEN_ENV,
    );
    await expect(runtime.facade.listModels({
      contractVersion: "v1alpha1",
      type: "list_models",
      queryId: "019f7447-a784-77b2-a716-000000001101",
      correlationId: "019f7447-a784-77b2-a716-000000001102",
      clientInstanceId: "019f7447-a784-77b2-a716-000000001103",
    })).resolves.toMatchObject({
      ok: true,
      value: [{ modelId: "model.internal-trial", available: true }],
    });
    expect(runtime.facade.compatibilityV1Alpha5({
      contractVersion: "v1alpha5",
      queryId: "019f7447-a784-77b2-a716-000000001104",
      correlationId: "019f7447-a784-77b2-a716-000000001105",
      clientInstanceId: "019f7447-a784-77b2-a716-000000001106",
      supportedContractVersions: ["v1alpha5"],
    })).toMatchObject({
      ok: true,
      value: { features: [{
        feature: "max_reasoning_mode_core",
        state: "available",
      }] },
    });
  });

  it("projects an Admin-managed deployment through the same normal catalog", async () => {
    const now = Date.now();
    const environment = {
      [INTERNAL_TRIAL_ENTERPRISE_MODEL_DEPLOYMENT_ENV]: JSON.stringify({
        schemaVersion: "mvp-admin-vs1.internal-trial.v1",
        centralBaseUrl: "http://127.0.0.1:41731",
        configurationRevision: `sha256:${"d".repeat(64)}`,
        modelId: "model.admin-managed",
        modelCreatedAt: "2026-08-30T00:00:00.000Z",
        displayName: "Admin Managed Model",
        supportsToolCalling: true,
        contextWindowTokens: 128_000,
        maxOutputTokens: 8_192,
      }),
      [INTERNAL_TRIAL_ENTERPRISE_ACCESS_TOKEN_ENV]: compactToken({
        issuedAt: new Date(now - 60_000).toISOString(),
        expiresAt: new Date(now + 3_600_000).toISOString(),
      }),
    };
    const runtime = createDesktopPrivateRuntime({
      databasePath: ":memory:",
      authorizationToken: "admin-managed-bootstrap-test-token",
      environment,
    });

    await expect(runtime.facade.listModels({
      contractVersion: "v1alpha1",
      type: "list_models",
      queryId: "019f7447-a784-77b2-a716-000000001201",
      correlationId: "019f7447-a784-77b2-a716-000000001202",
      clientInstanceId: "019f7447-a784-77b2-a716-000000001203",
    })).resolves.toMatchObject({
      ok: true,
      value: [{
        modelId: "model.admin-managed",
        name: "Admin Managed Model",
        available: true,
      }],
    });
  });
});

function fixture() {
  const capability = createCapabilityDefinition({
    schemaVersion: CONTRACT_VERSION,
    capabilityId: "model.internal-trial",
    kind: "model",
    name: "Internal Trial Model",
    description: "Deployment-configured MVP model",
    source,
    model: {
      family: "openai-compatible",
      inputModalities: ["text"],
      outputModalities: ["text"],
      contextWindow: 128_000,
      supportsStreaming: true,
    },
  });
  const descriptor = createAdapterDescriptor({
    schemaVersion: CONTRACT_VERSION,
    adapterDescriptorId: "adapter.model.internal-trial",
    adapterKind: "model_provider",
    source,
    implementationRef: "enterprise:model-gateway",
    runtimeBoundary: "remote",
    protocol: { name: "robothree-enterprise-model", version: "v1alpha1" },
  });
  const binding = createCapabilityBinding({
    schemaVersion: CONTRACT_VERSION,
    bindingId: "binding.model.internal-trial",
    capability: {
      capabilityId: capability.capabilityId,
      capabilityRevision: capability.revision,
    },
    adapterDescriptor: {
      adapterDescriptorId: descriptor.adapterDescriptorId,
      adapterDescriptorRevision: descriptor.revision,
    },
    port: "model_provider",
    source,
  });
  const registrySnapshot = new RegistryBuilder({ trustedSources: [source] })
    .registerCapability(capability)
    .registerAdapterDescriptor(descriptor)
    .registerBinding(binding)
    .finalize();
  return {
    schemaVersion: "mvp-vs1.internal-trial.v1" as const,
    centralBaseUrl: "https://central.internal.example",
    configurationRevision: `sha256:${"c".repeat(64)}`,
    modelId: capability.capabilityId,
    modelCreatedAt: "2026-08-29T00:00:00.000Z",
    supportsToolCalling: true as const,
    registrySnapshot,
  };
}

function compactToken(input: Readonly<{ issuedAt: string; expiresAt: string }>) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value))
    .toString("base64url");
  return [
    encode({ alg: "ES256", typ: "JWT" }),
    encode({
      contractVersion: "v1alpha1",
      issuer: "central.internal-trial",
      audience: "enterprise-model-gateway",
      enterpriseId: "enterprise.internal-trial",
      userId: "user.internal-trial",
      deviceId: "device.internal-trial",
      clientInstanceId: "019f7447-a784-77b2-a716-000000001107",
      tokenId: "019f7447-a784-77b2-a716-000000001108",
      issuedAt: input.issuedAt,
      expiresAt: input.expiresAt,
      permissions: ["model.use"],
    }),
    "internal-trial-signature-not-verified-locally",
  ].join(".");
}
