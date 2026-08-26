import {
  CONTRACT_VERSION,
  ToolCapabilityDefinitionSchema,
} from "@robothree/contracts";
import { DOCUMENT_WORKER_PRIVATE_PROTOCOL_VERSION } from "@robothree/document-worker";
import { describe, expect, it } from "vitest";

import {
  DOCUMENT_TOOL_ADAPTER_DESCRIPTOR,
  DOCUMENT_TOOL_ADAPTER_DESCRIPTOR_ID,
  DOCUMENT_TOOL_CAPABILITY_IDS,
  DOCUMENT_TOOL_DEFINITIONS,
  DOCUMENT_TOOL_IMPLEMENTATION_REF,
  DOCUMENT_TOOL_REGISTRY_RECORDS,
  DOCUMENT_TOOL_RISK_SOURCE_REVISION,
  DOCUMENT_TOOL_SOURCE,
  RegistryBuilder,
  createDocumentToolRegistrySnapshot,
  hasValidAdapterDescriptorRevision,
  hasValidCapabilityBindingRevision,
  hasValidCapabilityDefinitionRevision,
  hasValidRegistrySnapshotRevision,
  registerDocumentToolRecords,
} from "../src/index.js";

describe("Document Tool Registry", () => {
  it("freezes exactly the six formal Document Tool definitions", () => {
    expect(DOCUMENT_TOOL_CAPABILITY_IDS).toEqual([
      "tool.document.pdf.extract_text",
      "tool.document.pdf.extract_tables",
      "tool.document.xlsx.read",
      "tool.document.docx.read",
      "tool.document.xlsx.write",
      "tool.document.pptx.write",
    ]);
    expect(DOCUMENT_TOOL_DEFINITIONS.map((definition) => definition.capabilityId)).toEqual([
      "tool.document.pdf.extract_text",
      "tool.document.pdf.extract_tables",
      "tool.document.xlsx.read",
      "tool.document.docx.read",
      "tool.document.xlsx.write",
      "tool.document.pptx.write",
    ]);
    for (const definition of DOCUMENT_TOOL_DEFINITIONS) {
      expect(ToolCapabilityDefinitionSchema.parse(definition)).toBeTruthy();
      expect(hasValidCapabilityDefinitionRevision(definition)).toBe(true);
      expect(definition.schemaVersion).toBe(CONTRACT_VERSION);
      expect(definition.kind).toBe("tool");
      expect(definition.source).toEqual(DOCUMENT_TOOL_SOURCE);
      expect(definition.tool.readOnlyHint).toBe(
        definition.capabilityId === "tool.document.xlsx.write" || definition.capabilityId === "tool.document.pptx.write"
          ? false
          : true,
      );
      expect(definition.tool.risk).toEqual({
        schemaVersion: CONTRACT_VERSION,
        sourceRevision: DOCUMENT_TOOL_RISK_SOURCE_REVISION,
        staticFacts: definition.capabilityId === "tool.document.xlsx.write"
          ? ["routine_file", "destructive_file"]
          : definition.capabilityId === "tool.document.pptx.write"
            ? ["routine_file"]
          : ["routine_file"],
      });
    }
  });

  it("freezes strict per-capability input and output schemas", () => {
    const byId = new Map(DOCUMENT_TOOL_DEFINITIONS.map((definition) => [definition.capabilityId, definition]));
    expect(byId.get("tool.document.pdf.extract_text")?.tool.inputSchema).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["workspaceRoot", "relativePath", "limits"],
      properties: {
        options: {
          additionalProperties: false,
          properties: {
            pageStart: { type: ["integer", "null"], minimum: 1 },
            pageEnd: { type: ["integer", "null"], minimum: 1 },
            maxTextBytes: { type: ["integer", "null"], minimum: 1 },
          },
        },
      },
    });
    expect(byId.get("tool.document.pdf.extract_tables")?.tool.inputSchema).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["relativePath"],
      properties: {
        relativePath: { type: "string", minLength: 1, maxLength: 4096 },
        options: {
          additionalProperties: false,
          properties: {
            pageStart: { type: ["integer", "null"], minimum: 1 },
            pageEnd: { type: ["integer", "null"], minimum: 1 },
            maxTables: { type: ["integer", "null"], minimum: 1 },
            maxRows: { type: ["integer", "null"], minimum: 1 },
            maxCells: { type: ["integer", "null"], minimum: 1 },
            maxTextBytes: { type: ["integer", "null"], minimum: 1 },
            includeGeometry: { type: ["boolean", "null"] },
            minConfidence: { type: ["number", "null"], minimum: 0, maximum: 1 },
          },
        },
      },
    });
    expect(JSON.stringify(byId.get("tool.document.pdf.extract_tables")?.tool.inputSchema)).not.toContain(
      "workspaceRoot",
    );
    expect(JSON.stringify(byId.get("tool.document.pdf.extract_tables")?.tool.inputSchema)).not.toContain("limits");
    expect(byId.get("tool.document.pdf.extract_tables")?.tool.outputSchema).toMatchObject({
      properties: {
        result: {
          properties: {
            extraction: { const: "tables" },
            tables: {
              items: {
                properties: {
                  confidence: { type: "number", minimum: 0, maximum: 1 },
                  bbox: {
                    properties: {
                      unit: { const: "pdf_point" },
                      origin: { const: "top_left" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    expect(byId.get("tool.document.xlsx.read")?.tool.inputSchema).toMatchObject({
      properties: {
        options: {
          additionalProperties: false,
          properties: {
            maxSheets: { type: ["integer", "null"], minimum: 1 },
            maxRowsPerSheet: { type: ["integer", "null"], minimum: 1 },
            maxColumnsPerSheet: { type: ["integer", "null"], minimum: 1 },
            maxCells: { type: ["integer", "null"], minimum: 1 },
            maxCellTextBytes: { type: ["integer", "null"], minimum: 1 },
          },
        },
      },
    });
    expect(byId.get("tool.document.docx.read")?.tool.inputSchema).toMatchObject({
      properties: {
        options: {
          additionalProperties: false,
          properties: {
            maxBlocks: { type: ["integer", "null"], minimum: 1 },
            maxTextBytes: { type: ["integer", "null"], minimum: 1 },
            maxTableRows: { type: ["integer", "null"], minimum: 1 },
            maxTableCells: { type: ["integer", "null"], minimum: 1 },
          },
        },
      },
    });
    expect(byId.get("tool.document.xlsx.write")?.tool.inputSchema).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["relativePath", "workbook"],
      properties: {
        relativePath: { type: "string", minLength: 1, maxLength: 1024 },
        workbook: { $ref: "#/$defs/workbook" },
        mode: {
          enum: ["create_new", "overwrite_existing"],
          default: "create_new",
        },
        options: { $ref: "#/$defs/options" },
      },
      $defs: {
        workbook: {
          additionalProperties: false,
          required: ["sheets"],
        },
        cell: {
          additionalProperties: false,
          required: ["column", "type", "value"],
          properties: {
            type: { enum: ["blank", "boolean", "number", "date", "string"] },
          },
        },
        options: {
          additionalProperties: false,
          properties: {
            dateSystem: { enum: ["1900", "1904"] },
          },
        },
      },
    });
    expect(JSON.stringify(byId.get("tool.document.xlsx.write")?.tool.inputSchema)).not.toContain("workspaceRoot");
    expect(JSON.stringify(byId.get("tool.document.xlsx.write")?.tool.inputSchema)).not.toContain("limits");
    expect(byId.get("tool.document.pptx.write")?.tool.inputSchema).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["relativePath", "presentation"],
      properties: {
        relativePath: { type: "string", minLength: 1, maxLength: 1024 },
        presentation: {
          required: ["title", "slides"],
          description: expect.stringContaining("PresentationSpecV1"),
        },
        options: { additionalProperties: false },
      },
    });
    expect(JSON.stringify(byId.get("tool.document.pptx.write")?.tool.inputSchema)).toContain("text, image, table, chart, or shape");
    expect(JSON.stringify(byId.get("tool.document.pptx.write")?.tool.inputSchema)).toContain("image/png");
    expect(JSON.stringify(byId.get("tool.document.pptx.write")?.tool.inputSchema)).toContain("HTTPS image URL");
    expect(JSON.stringify(byId.get("tool.document.pptx.write")?.tool.inputSchema)).not.toContain("workspaceRoot");
    expect(JSON.stringify(byId.get("tool.document.pptx.write")?.tool.inputSchema)).not.toContain("limits");
    expect(JSON.stringify(byId.get("tool.document.pptx.write")?.tool.inputSchema)).not.toContain("PptxGenJS");
    expect(byId.get("tool.document.pptx.write")?.tool.outputSchema).toMatchObject({
      properties: {
        result: {
          properties: {
            format: { const: "pptx" },
            presentationDigest: { type: "string", pattern: "^[a-f0-9]{64}$" },
            slideCount: { type: "integer", minimum: 1 },
            mediaType: {
              const: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            },
          },
        },
      },
    });

    for (const definition of DOCUMENT_TOOL_DEFINITIONS) {
      expect(definition.tool.outputSchema).toMatchObject({
        type: "object",
        additionalProperties: false,
        required: ["status", "result", "metadata"],
        properties: {
          status: { enum: ["succeeded", "truncated"] },
          metadata: {
            additionalProperties: false,
            required: ["originalCount", "returnedCount", "truncated", "resultDigest", "timingMs"],
          },
        },
      });
      expect(Object.isFrozen(definition.tool.inputSchema)).toBe(true);
      expect(Object.isFrozen(definition.tool.outputSchema)).toBe(true);
    }
  });

  it("binds all Document Tools to the trusted child-process Document Worker descriptor", () => {
    expect(DOCUMENT_TOOL_ADAPTER_DESCRIPTOR).toMatchObject({
      adapterDescriptorId: DOCUMENT_TOOL_ADAPTER_DESCRIPTOR_ID,
      adapterKind: "tool_execution_backend",
      implementationRef: DOCUMENT_TOOL_IMPLEMENTATION_REF,
      runtimeBoundary: "child_process",
      protocol: {
        name: "robothree-document-worker",
        version: DOCUMENT_WORKER_PRIVATE_PROTOCOL_VERSION,
      },
      effectRecoveryMode: "idempotent_retry",
      maxConcurrency: 1,
    });
    expect(hasValidAdapterDescriptorRevision(DOCUMENT_TOOL_ADAPTER_DESCRIPTOR)).toBe(true);
    expect(DOCUMENT_TOOL_REGISTRY_RECORDS.bindings).toHaveLength(6);
    for (const binding of DOCUMENT_TOOL_REGISTRY_RECORDS.bindings) {
      expect(hasValidCapabilityBindingRevision(binding)).toBe(true);
      expect(binding.port).toBe("tool_execution_backend");
      expect(binding.adapterDescriptor).toEqual({
        adapterDescriptorId: DOCUMENT_TOOL_ADAPTER_DESCRIPTOR.adapterDescriptorId,
        adapterDescriptorRevision: DOCUMENT_TOOL_ADAPTER_DESCRIPTOR.revision,
      });
    }
  });

  it("finalizes through RegistryBuilder without adding Agent, Context, Artifact or Desktop wiring", () => {
    const snapshot = createDocumentToolRegistrySnapshot();
    expect(hasValidRegistrySnapshotRevision(snapshot)).toBe(true);
    expect(snapshot.agentVisibleCapabilities.models).toEqual([]);
    expect(snapshot.agentVisibleCapabilities.tools.map((definition) => definition.capabilityId)).toEqual([
      "tool.document.docx.read",
      "tool.document.pdf.extract_tables",
      "tool.document.pdf.extract_text",
      "tool.document.pptx.write",
      "tool.document.xlsx.read",
      "tool.document.xlsx.write",
    ]);
    expect(snapshot.infrastructureResources.adapterDescriptors).toEqual([
      DOCUMENT_TOOL_ADAPTER_DESCRIPTOR,
    ]);
    expect(JSON.stringify(snapshot)).not.toMatch(/agentDefinitionId|toolReferences|artifact|contextPreview|desktop/i);
  });

  it("registers into an existing builder using only the official Document Tool source", () => {
    const builder = registerDocumentToolRecords(new RegistryBuilder({ trustedSources: [DOCUMENT_TOOL_SOURCE] }));
    const snapshot = builder.finalize();
    expect(snapshot.infrastructureResources.capabilityBindings).toHaveLength(6);
    expect(() => registerDocumentToolRecords(builder)).toThrow(
      expect.objectContaining({ code: "registry.already_finalized" }),
    );
  });
});
