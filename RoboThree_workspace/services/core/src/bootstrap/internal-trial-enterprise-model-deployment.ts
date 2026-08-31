import {
  CONTRACT_VERSION,
  ModelProviderDescriptorSchema,
  RegistrySnapshotSchema,
  type AdapterDescriptor,
  type CapabilityBinding,
  type ModelCapabilityDefinition,
  type RegistrySnapshot,
} from "@robothree/contracts";
import { z } from "zod";

import {
  createModelDefinition,
} from "../application/runtime-selection-revisions.js";
import {
  createAdapterDescriptor,
  createCapabilityBinding,
  createCapabilityDefinition,
} from "../registry/capability-revision.js";
import { RegistryBuilder } from "../registry/registry-builder.js";
import {
  hasValidAdapterDescriptorRevision,
  hasValidCapabilityBindingRevision,
  hasValidCapabilityDefinitionRevision,
  hasValidRegistrySnapshotRevision,
} from "../registry/capability-revision.js";

export const INTERNAL_TRIAL_ENTERPRISE_MODEL_DEPLOYMENT_ENV =
  "ROBOTHREE_INTERNAL_TRIAL_ENTERPRISE_MODEL_DEPLOYMENT";

const LegacyDeploymentSchema = z.object({
  schemaVersion: z.literal("mvp-vs1.internal-trial.v1"),
  centralBaseUrl: z.url().max(2_048),
  configurationRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
  modelId: z.string().regex(/^model\.[A-Za-z0-9._:-]{1,154}$/u),
  modelCreatedAt: z.iso.datetime({ offset: true }),
  supportsToolCalling: z.literal(true),
  registrySnapshot: RegistrySnapshotSchema,
}).strict();

const AdminManagedDeploymentSchema = z.object({
  schemaVersion: z.literal("mvp-admin-vs1.internal-trial.v1"),
  centralBaseUrl: z.url().max(2_048),
  configurationRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
  modelId: z.string().regex(/^model\.[A-Za-z0-9._:-]{1,154}$/u),
  modelCreatedAt: z.iso.datetime({ offset: true }),
  displayName: z.string().trim().min(1).max(160),
  supportsToolCalling: z.literal(true),
}).strict();

const DeploymentSchema = z.discriminatedUnion("schemaVersion", [
  LegacyDeploymentSchema,
  AdminManagedDeploymentSchema,
]);

type Environment = Record<string, string | undefined>;

export type InternalTrialEnterpriseModelDeployment = Readonly<{
  source: "deployment/internal_trial";
  managedByAdmin: boolean;
  adminMutationReady: boolean;
  centralBaseUrl: string;
  configurationRevision: string;
  allowInsecureLoopback: boolean;
  registrySnapshot: RegistrySnapshot;
  capability: ModelCapabilityDefinition;
  binding: CapabilityBinding;
  descriptor: AdapterDescriptor & Readonly<{ adapterKind: "model_provider" }>;
  model: ReturnType<typeof createModelDefinition>;
}>;

export class InternalTrialEnterpriseModelDeploymentError extends Error {
  public readonly code = "internal_trial_model_deployment_invalid";

  public constructor() {
    super("internal-trial enterprise Model deployment is invalid");
    this.name = "InternalTrialEnterpriseModelDeploymentError";
  }
}

export function consumeInternalTrialEnterpriseModelDeployment(input: Readonly<{
  environment: Environment;
  variableName?: string;
}>): InternalTrialEnterpriseModelDeployment | undefined {
  const variableName = input.variableName
    ?? INTERNAL_TRIAL_ENTERPRISE_MODEL_DEPLOYMENT_ENV;
  const encoded = input.environment[variableName];
  delete input.environment[variableName];
  if (encoded === undefined || encoded.length === 0) return undefined;
  if (Buffer.byteLength(encoded, "utf8") > 1_048_576) throw invalid();

  try {
    const deployment = DeploymentSchema.parse(JSON.parse(encoded) as unknown);
    const managedByAdmin = deployment.schemaVersion
      === "mvp-admin-vs1.internal-trial.v1";
    const registry = managedByAdmin
      ? createAdminManagedRegistry(deployment)
      : deployment.registrySnapshot;
    if (!hasValidRegistrySnapshotRevision(registry)) throw invalid();
    if (registry.agentVisibleCapabilities.models.length !== 1
      || registry.agentVisibleCapabilities.tools.length !== 0
      || registry.infrastructureResources.capabilityBindings.length !== 1
      || registry.infrastructureResources.adapterDescriptors.length !== 1) {
      throw invalid();
    }
    const capabilities = registry.agentVisibleCapabilities.models.filter(
      (candidate) => candidate.capabilityId === deployment.modelId,
    );
    if (capabilities.length !== 1) throw invalid();
    const capability = capabilities[0]!;
    if (!hasValidCapabilityDefinitionRevision(capability)
      || capability.model.family !== "openai-compatible"
      || !capability.model.inputModalities.includes("text")
      || !capability.model.outputModalities.includes("text")
      || !capability.model.supportsStreaming
      || capability.model.contextWindow === undefined) throw invalid();

    const bindings = registry.infrastructureResources.capabilityBindings.filter(
      (candidate) => candidate.port === "model_provider"
        && candidate.capability.capabilityId === capability.capabilityId
        && candidate.capability.capabilityRevision === capability.revision,
    );
    if (bindings.length !== 1) throw invalid();
    const binding = bindings[0]!;
    if (!hasValidCapabilityBindingRevision(binding)) throw invalid();
    const descriptors = registry.infrastructureResources.adapterDescriptors.filter(
      (candidate) => candidate.adapterKind === "model_provider"
        && candidate.adapterDescriptorId
          === binding.adapterDescriptor.adapterDescriptorId
        && candidate.revision
          === binding.adapterDescriptor.adapterDescriptorRevision,
    );
    if (descriptors.length !== 1) throw invalid();
    const descriptor = ModelProviderDescriptorSchema.parse(descriptors[0]);
    if (!hasValidAdapterDescriptorRevision(descriptor)
      || descriptor.runtimeBoundary !== "remote"
      || descriptor.protocol.name !== "robothree-enterprise-model"
      || descriptor.protocol.version !== "v1alpha1") throw invalid();

    const origin = new URL(deployment.centralBaseUrl);
    const loopback = origin.protocol === "http:"
      && (origin.hostname === "127.0.0.1" || origin.hostname === "localhost");
    if (origin.protocol !== "https:" && !loopback) throw invalid();
    if (origin.username !== "" || origin.password !== ""
      || origin.search !== "" || origin.hash !== "") throw invalid();

    const model = createModelDefinition({
      schemaVersion: "v1alpha1",
      modelId: capability.capabilityId,
      name: capability.name,
      source: "enterprise",
      capability: {
        capabilityId: capability.capabilityId,
        capabilityRevision: capability.revision,
      },
      capabilities: {
        inputModalities: capability.model.inputModalities,
        outputModalities: capability.model.outputModalities,
        supportsToolCalling: deployment.supportsToolCalling,
        supportsStreaming: capability.model.supportsStreaming,
        contextWindow: capability.model.contextWindow,
      },
      createdAt: deployment.modelCreatedAt,
    });
    return Object.freeze({
      source: "deployment/internal_trial",
      managedByAdmin,
      adminMutationReady: managedByAdmin,
      centralBaseUrl: origin.toString(),
      configurationRevision: deployment.configurationRevision,
      allowInsecureLoopback: loopback,
      registrySnapshot: registry,
      capability,
      binding,
      descriptor,
      model,
    });
  } catch (error) {
    if (error instanceof InternalTrialEnterpriseModelDeploymentError) throw error;
    throw invalid();
  }
}

function createAdminManagedRegistry(deployment: z.infer<
  typeof AdminManagedDeploymentSchema
>): RegistrySnapshot {
  const source = Object.freeze({
    trust: "enterprise" as const,
    packageId: "deployment.admin-model.internal-trial",
    packageRevision: deployment.configurationRevision,
  });
  const capability = createCapabilityDefinition({
    schemaVersion: CONTRACT_VERSION,
    capabilityId: deployment.modelId,
    kind: "model",
    name: deployment.displayName,
    description: "Admin-managed internal-trial enterprise model",
    source,
    model: {
      family: "openai-compatible",
      inputModalities: ["text"],
      outputModalities: ["text"],
      // ADMIN-MVP-VS1 manages the one approved internal-trial model class.
      // Keep the same execution capability baseline as the frozen VS1
      // deployment path until a real consumer justifies a public capability
      // field; 8k made the existing presentation Agent selectable but unable
      // to start once its compiled instruction bundle was materialized.
      contextWindow: 128_000,
      supportsStreaming: true,
    },
  });
  const descriptor = createAdapterDescriptor({
    schemaVersion: CONTRACT_VERSION,
    adapterDescriptorId:
      `adapter.admin-model.${deployment.configurationRevision.slice(7, 39)}`,
    adapterKind: "model_provider",
    source,
    implementationRef: "enterprise:model-gateway",
    runtimeBoundary: "remote",
    protocol: { name: "robothree-enterprise-model", version: "v1alpha1" },
  });
  const binding = createCapabilityBinding({
    schemaVersion: CONTRACT_VERSION,
    bindingId: `binding.admin-model.${deployment.configurationRevision.slice(7, 39)}`,
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
  return RegistrySnapshotSchema.parse(new RegistryBuilder({ trustedSources: [source] })
    .registerCapability(capability)
    .registerAdapterDescriptor(descriptor)
    .registerBinding(binding)
    .finalize());
}

function invalid(): InternalTrialEnterpriseModelDeploymentError {
  return new InternalTrialEnterpriseModelDeploymentError();
}
