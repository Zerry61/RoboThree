import {
  CONTRACT_VERSION,
  type AdapterDescriptor,
  type CapabilityBinding,
  type CapabilitySource,
  type JsonObject,
  type ToolCapabilityDefinition,
} from "@robothree/contracts";
import {
  DOCUMENT_WORKER_PRIVATE_PROTOCOL_VERSION,
  TEXT_FILE_READ_CAPABILITY_ID,
  TEXT_FILE_WRITE_CAPABILITY_ID,
} from "@robothree/document-worker";

import {
  createAdapterDescriptor,
  createCapabilityBinding,
  createCapabilityDefinition,
} from "./capability-revision.js";
import type { RegistryBuilder } from "./registry-builder.js";

export const WORKSPACE_TEXT_TOOL_ADAPTER_DESCRIPTOR_ID =
  "adapter.tool.workspace-text-document-worker";
export const WORKSPACE_TEXT_READ_TOOL_ADAPTER_DESCRIPTOR_ID =
  "adapter.tool.workspace-text-reader-document-worker";
export const WORKSPACE_TEXT_TOOL_SOURCE: CapabilitySource = Object.freeze({
  trust: "official",
  packageId: "robothree.official.workspace-text-writer",
  packageRevision: "sha256:3d88571757942dc448cbca519c45d27a833596cb40285433d23673f2234209ed",
});
export const WORKSPACE_TEXT_READ_TOOL_SOURCE: CapabilitySource = Object.freeze({
  trust: "official",
  packageId: "robothree.official.workspace-text-reader",
  packageRevision: "sha256:90f01f0527a52befbc2cfe6848e0d508f9635e7d0ad10887fd6933b944110c19",
});

const MODEL_INPUT_SCHEMA: JsonObject = freezeJson({
  type: "object",
  additionalProperties: false,
  required: ["relativePath", "content"],
  properties: {
    relativePath: { type: "string", minLength: 1, maxLength: 1024 },
    content: { type: "string", maxLength: 262144 },
    mode: { type: "string", enum: ["create_new", "replace_existing"] },
    expectedPreviousSha256: {
      type: "string",
      pattern: "^sha256:[a-f0-9]{64}$",
    },
  },
});

const READ_MODEL_INPUT_SCHEMA: JsonObject = freezeJson({
  type: "object",
  additionalProperties: false,
  required: ["relativePath"],
  properties: {
    relativePath: { type: "string", minLength: 1, maxLength: 1024 },
  },
});

const READ_OUTPUT_SCHEMA: JsonObject = freezeJson({
  type: "object",
  additionalProperties: false,
  required: ["status", "result", "metadata"],
  properties: {
    status: { type: "string", enum: ["succeeded"] },
    result: {
      type: "object",
      additionalProperties: false,
      required: ["relativePath", "content", "mediaType", "byteSize", "sha256"],
      properties: {
        relativePath: { type: "string" },
        content: { type: "string", maxLength: 262144 },
        mediaType: { type: "string" },
        byteSize: { type: "integer", minimum: 0 },
        sha256: { type: "string", pattern: "^sha256:[a-f0-9]{64}$" },
      },
    },
    metadata: { type: "object" },
  },
});

const OUTPUT_SCHEMA: JsonObject = freezeJson({
  type: "object",
  additionalProperties: false,
  required: ["status", "result", "metadata"],
  properties: {
    status: { type: "string", enum: ["succeeded", "truncated"] },
    result: {
      type: "object",
      additionalProperties: false,
      required: [
        "status",
        "relativePath",
        "mode",
        "sha256",
        "byteSize",
        "mediaType",
        "backupCreated",
        "warnings",
      ],
      properties: {
        status: { type: "string", enum: ["created", "replaced", "replayed"] },
        relativePath: { type: "string" },
        mode: { type: "string", enum: ["create_new", "replace_existing"] },
        sha256: { type: "string", pattern: "^sha256:[a-f0-9]{64}$" },
        byteSize: { type: "integer", minimum: 0 },
        mediaType: { type: "string" },
        previousSha256: { type: "string", pattern: "^sha256:[a-f0-9]{64}$" },
        backupCreated: { type: "boolean" },
        warnings: { type: "array", items: { type: "string" } },
      },
    },
    metadata: { type: "object" },
  },
});

export const WORKSPACE_TEXT_TOOL_DEFINITION = createCapabilityDefinition({
    schemaVersion: CONTRACT_VERSION,
    capabilityId: TEXT_FILE_WRITE_CAPABILITY_ID,
    kind: "tool",
    name: "Workspace Text File Write",
    description:
      "Creates or replaces one UTF-8 text file inside the active workspace and returns a durable Artifact.",
    source: WORKSPACE_TEXT_TOOL_SOURCE,
    tool: {
      inputSchema: MODEL_INPUT_SCHEMA,
      outputSchema: OUTPUT_SCHEMA,
      readOnlyHint: false,
      risk: {
        schemaVersion: CONTRACT_VERSION,
        sourceRevision: "builtin.workspace-text-writer.wfw2.v1",
        staticFacts: ["routine_file"],
      },
    },
  }) as ToolCapabilityDefinition;

export const WORKSPACE_TEXT_READ_TOOL_DEFINITION = createCapabilityDefinition({
  schemaVersion: CONTRACT_VERSION,
  capabilityId: TEXT_FILE_READ_CAPABILITY_ID,
  kind: "tool",
  name: "Workspace Text File Read",
  description:
    "Reads one bounded UTF-8 text file from the active workspace for the current edit turn.",
  source: WORKSPACE_TEXT_READ_TOOL_SOURCE,
  tool: {
    inputSchema: READ_MODEL_INPUT_SCHEMA,
    outputSchema: READ_OUTPUT_SCHEMA,
    readOnlyHint: true,
    risk: {
      schemaVersion: CONTRACT_VERSION,
      sourceRevision: "builtin.workspace-text-reader.wte1.v1",
      staticFacts: ["routine_file"],
    },
  },
}) as ToolCapabilityDefinition;

export const WORKSPACE_TEXT_TOOL_ADAPTER_DESCRIPTOR: AdapterDescriptor =
  createAdapterDescriptor({
    schemaVersion: CONTRACT_VERSION,
    adapterDescriptorId: WORKSPACE_TEXT_TOOL_ADAPTER_DESCRIPTOR_ID,
    adapterKind: "tool_execution_backend",
    source: WORKSPACE_TEXT_TOOL_SOURCE,
    implementationRef: "core:document-worker/workspace-text-writer",
    runtimeBoundary: "child_process",
    protocol: {
      name: "robothree-document-worker",
      version: DOCUMENT_WORKER_PRIVATE_PROTOCOL_VERSION,
    },
    effectRecoveryMode: "query_then_retry",
    maxConcurrency: 1,
  });

export const WORKSPACE_TEXT_READ_TOOL_ADAPTER_DESCRIPTOR: AdapterDescriptor =
  createAdapterDescriptor({
    schemaVersion: CONTRACT_VERSION,
    adapterDescriptorId: WORKSPACE_TEXT_READ_TOOL_ADAPTER_DESCRIPTOR_ID,
    adapterKind: "tool_execution_backend",
    source: WORKSPACE_TEXT_READ_TOOL_SOURCE,
    implementationRef: "core:document-worker/workspace-text-reader",
    runtimeBoundary: "child_process",
    protocol: {
      name: "robothree-document-worker",
      version: DOCUMENT_WORKER_PRIVATE_PROTOCOL_VERSION,
    },
    effectRecoveryMode: "idempotent_retry",
    maxConcurrency: 1,
  });

export const WORKSPACE_TEXT_TOOL_BINDING: CapabilityBinding =
  createCapabilityBinding({
    schemaVersion: CONTRACT_VERSION,
    bindingId: `binding.${TEXT_FILE_WRITE_CAPABILITY_ID}`,
    capability: {
      capabilityId: TEXT_FILE_WRITE_CAPABILITY_ID,
      capabilityRevision: WORKSPACE_TEXT_TOOL_DEFINITION.revision,
    },
    adapterDescriptor: {
      adapterDescriptorId: WORKSPACE_TEXT_TOOL_ADAPTER_DESCRIPTOR.adapterDescriptorId,
      adapterDescriptorRevision: WORKSPACE_TEXT_TOOL_ADAPTER_DESCRIPTOR.revision,
    },
    port: "tool_execution_backend",
    source: WORKSPACE_TEXT_TOOL_SOURCE,
  });

export const WORKSPACE_TEXT_READ_TOOL_BINDING: CapabilityBinding =
  createCapabilityBinding({
    schemaVersion: CONTRACT_VERSION,
    bindingId: `binding.${TEXT_FILE_READ_CAPABILITY_ID}`,
    capability: {
      capabilityId: TEXT_FILE_READ_CAPABILITY_ID,
      capabilityRevision: WORKSPACE_TEXT_READ_TOOL_DEFINITION.revision,
    },
    adapterDescriptor: {
      adapterDescriptorId: WORKSPACE_TEXT_READ_TOOL_ADAPTER_DESCRIPTOR.adapterDescriptorId,
      adapterDescriptorRevision: WORKSPACE_TEXT_READ_TOOL_ADAPTER_DESCRIPTOR.revision,
    },
    port: "tool_execution_backend",
    source: WORKSPACE_TEXT_READ_TOOL_SOURCE,
  });

export function registerWorkspaceTextToolRecords(builder: RegistryBuilder): RegistryBuilder {
  builder.registerAdapterDescriptor(WORKSPACE_TEXT_READ_TOOL_ADAPTER_DESCRIPTOR);
  builder.registerAdapterDescriptor(WORKSPACE_TEXT_TOOL_ADAPTER_DESCRIPTOR);
  builder.registerCapability(WORKSPACE_TEXT_READ_TOOL_DEFINITION);
  builder.registerCapability(WORKSPACE_TEXT_TOOL_DEFINITION);
  builder.registerBinding(WORKSPACE_TEXT_READ_TOOL_BINDING);
  builder.registerBinding(WORKSPACE_TEXT_TOOL_BINDING);
  return builder;
}

function freezeJson<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      freezeJson(child);
    }
  }
  return value;
}
