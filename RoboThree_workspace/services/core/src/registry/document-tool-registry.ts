import {
  CONTRACT_VERSION,
  type AdapterDescriptor,
  type CapabilityBinding,
  type CapabilitySource,
  type JsonObject,
  type ToolCapabilityDefinition,
  type ToolRiskFactKind,
} from "@robothree/contracts";
import {
  DOCUMENT_CAPABILITIES,
  DOCUMENT_WORKER_PRIVATE_PROTOCOL_VERSION,
  PPTX_WRITE_CAPABILITY_ID,
  XLSX_WRITE_CAPABILITY_ID,
  type DocumentCapabilityId,
} from "@robothree/document-worker";

import {
  createAdapterDescriptor,
  createCapabilityBinding,
  createCapabilityDefinition,
} from "./capability-revision.js";
import { RegistryBuilder, type FinalizedRegistrySnapshot } from "./registry-builder.js";

export const DOCUMENT_TOOL_ADAPTER_DESCRIPTOR_ID = "adapter.tool.document-worker";
export const DOCUMENT_TOOL_IMPLEMENTATION_REF = "core:document-worker";
export const DOCUMENT_TOOL_RISK_SOURCE_REVISION = "builtin.document-tools.ptx2.v1";

export const DOCUMENT_TOOL_SOURCE: CapabilitySource = Object.freeze({
  trust: "official",
  packageId: "robothree.official.document-tools",
  packageRevision: "sha256:28ba1503e0003f1fba2e17cdd3570cfbb24aa4f19183a0edfa6fabe00ffeb54c",
});

export type DocumentToolCapabilityId =
  | DocumentCapabilityId
  | typeof XLSX_WRITE_CAPABILITY_ID
  | typeof PPTX_WRITE_CAPABILITY_ID;

export const DOCUMENT_TOOL_CAPABILITY_IDS = Object.freeze([
  ...DOCUMENT_CAPABILITIES,
  XLSX_WRITE_CAPABILITY_ID,
  PPTX_WRITE_CAPABILITY_ID,
]) as readonly DocumentToolCapabilityId[];

export type DocumentToolRegistryRecords = Readonly<{
  definitions: readonly ToolCapabilityDefinition[];
  bindings: readonly CapabilityBinding[];
  descriptor: AdapterDescriptor;
}>;

const LIMITS_SCHEMA: JsonObject = deepFreeze({
  type: "object",
  additionalProperties: false,
  required: [
    "maxFileBytes",
    "maxOutputBytes",
    "maxPageCount",
    "maxDecompressionRatio",
  ],
  properties: {
    maxFileBytes: positiveIntegerSchema("Maximum input file bytes read by the Document Worker."),
    maxOutputBytes: positiveIntegerSchema("Maximum serialized output bytes returned by the Document Worker."),
    maxPageCount: positiveIntegerSchema("Maximum page, sheet, or page-like unit count."),
    maxDecompressionRatio: positiveIntegerSchema("Maximum compressed document decompression ratio."),
  },
});

const DOCUMENT_TOOL_METADATA_SCHEMA: JsonObject = deepFreeze({
  type: "object",
  additionalProperties: false,
  required: [
    "originalCount",
    "returnedCount",
    "truncated",
    "resultDigest",
    "timingMs",
  ],
  properties: {
    originalCount: { type: "integer", minimum: 0 },
    returnedCount: { type: "integer", minimum: 0 },
    truncated: { type: "boolean" },
    resultDigest: { type: "string", pattern: "^[a-f0-9]{64}$" },
    locators: {
      type: "array",
      items: { type: "object" },
    },
    timingMs: { type: "integer", minimum: 0 },
  },
});

const PDF_OPTIONS_SCHEMA: JsonObject = deepFreeze({
  type: "object",
  additionalProperties: false,
  properties: {
    pageStart: nullablePositiveIntegerSchema("One-based first page to extract."),
    pageEnd: nullablePositiveIntegerSchema("One-based final page to extract."),
    maxTextBytes: nullablePositiveIntegerSchema("Maximum PDF text bytes returned."),
  },
});

const PDF_TABLE_OPTIONS_SCHEMA: JsonObject = deepFreeze({
  type: "object",
  additionalProperties: false,
  properties: {
    pageStart: nullablePositiveIntegerSchema("One-based first page to inspect."),
    pageEnd: nullablePositiveIntegerSchema("One-based final page to inspect."),
    maxTables: nullablePositiveIntegerSchema("Maximum PDF tables returned."),
    maxRows: nullablePositiveIntegerSchema("Maximum PDF table rows returned."),
    maxCells: nullablePositiveIntegerSchema("Maximum PDF table cells returned."),
    maxTextBytes: nullablePositiveIntegerSchema("Maximum UTF-8 text bytes returned across all cells."),
    includeGeometry: {
      type: ["boolean", "null"],
      description:
        "Whether to include approximate PDF point bounding boxes. Geometry is only for human source-location reference.",
    },
    minConfidence: {
      type: ["number", "null"],
      minimum: 0,
      maximum: 1,
      description: "Minimum heuristic table confidence to return.",
    },
  },
});

const XLSX_OPTIONS_SCHEMA: JsonObject = deepFreeze({
  type: "object",
  additionalProperties: false,
  properties: {
    maxSheets: nullablePositiveIntegerSchema("Maximum workbook sheets returned."),
    maxRowsPerSheet: nullablePositiveIntegerSchema("Maximum rows per sheet."),
    maxColumnsPerSheet: nullablePositiveIntegerSchema("Maximum columns per sheet."),
    maxCells: nullablePositiveIntegerSchema("Maximum total populated cells returned."),
    maxCellTextBytes: nullablePositiveIntegerSchema("Maximum string bytes per cell."),
  },
});

const DOCX_OPTIONS_SCHEMA: JsonObject = deepFreeze({
  type: "object",
  additionalProperties: false,
  properties: {
    maxBlocks: nullablePositiveIntegerSchema("Maximum DOCX content blocks returned."),
    maxTextBytes: nullablePositiveIntegerSchema("Maximum DOCX text bytes returned."),
    maxTableRows: nullablePositiveIntegerSchema("Maximum table rows returned."),
    maxTableCells: nullablePositiveIntegerSchema("Maximum table cells returned."),
  },
});

const PDF_RESULT_SCHEMA: JsonObject = deepFreeze({
  type: "object",
  additionalProperties: false,
  required: ["format", "pageCount", "pages"],
  properties: {
    format: { const: "pdf" },
    pageCount: { type: "integer", minimum: 0 },
    pages: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["pageNumber", "text", "rotation", "empty"],
        properties: {
          pageNumber: { type: "integer", minimum: 1 },
          text: { type: "string" },
          rotation: { type: "integer" },
          empty: { type: "boolean" },
        },
      },
    },
  },
});

const PDF_TABLE_BOX_SCHEMA: JsonObject = deepFreeze({
  type: "object",
  additionalProperties: false,
  required: ["x", "y", "width", "height", "unit", "origin"],
  properties: {
    x: { type: "number" },
    y: { type: "number" },
    width: { type: "number" },
    height: { type: "number" },
    unit: { const: "pdf_point" },
    origin: { const: "top_left" },
  },
});

const PDF_TABLE_WARNING_SCHEMA: JsonObject = deepFreeze({
  enum: [
    "low_confidence",
    "ambiguous_columns",
    "ambiguous_rows",
    "merged_cells_not_supported",
    "rotated_text_ignored",
    "table_truncated",
    "page_truncated",
  ],
});

const PDF_TABLE_RESULT_SCHEMA: JsonObject = deepFreeze({
  type: "object",
  additionalProperties: false,
  required: ["format", "extraction", "pageCount", "selectedPageCount", "tables", "warnings"],
  properties: {
    format: { const: "pdf" },
    extraction: { const: "tables" },
    pageCount: { type: "integer", minimum: 0 },
    selectedPageCount: { type: "integer", minimum: 0 },
    warnings: {
      type: "array",
      maxItems: 32,
      items: PDF_TABLE_WARNING_SCHEMA,
    },
    tables: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["pageNumber", "tableIndex", "rowCount", "columnCount", "confidence", "locator", "rows", "warnings"],
        properties: {
          pageNumber: { type: "integer", minimum: 1 },
          tableIndex: { type: "integer", minimum: 1 },
          rowCount: { type: "integer", minimum: 0 },
          columnCount: { type: "integer", minimum: 0 },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          locator: {
            type: "object",
            additionalProperties: false,
            required: ["pageNumber", "tableIndex"],
            properties: {
              pageNumber: { type: "integer", minimum: 1 },
              tableIndex: { type: "integer", minimum: 1 },
            },
          },
          bbox: PDF_TABLE_BOX_SCHEMA,
          warnings: {
            type: "array",
            maxItems: 16,
            items: PDF_TABLE_WARNING_SCHEMA,
          },
          rows: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["rowIndex", "cells"],
              properties: {
                rowIndex: { type: "integer", minimum: 1 },
                bbox: PDF_TABLE_BOX_SCHEMA,
                cells: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["rowIndex", "columnIndex", "text", "confidence", "warnings"],
                    properties: {
                      rowIndex: { type: "integer", minimum: 1 },
                      columnIndex: { type: "integer", minimum: 1 },
                      text: { type: "string" },
                      bbox: PDF_TABLE_BOX_SCHEMA,
                      confidence: { type: "number", minimum: 0, maximum: 1 },
                      warnings: {
                        type: "array",
                        maxItems: 8,
                        items: PDF_TABLE_WARNING_SCHEMA,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
});

const XLSX_RESULT_SCHEMA: JsonObject = deepFreeze({
  type: "object",
  additionalProperties: false,
  required: ["format", "dateSystem", "sheets"],
  properties: {
    format: { const: "xlsx" },
    dateSystem: { enum: ["1900", "1904"] },
    sheets: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["index", "name", "visibility", "usedRange", "rows"],
        properties: {
          index: { type: "integer", minimum: 0 },
          name: { type: "string" },
          visibility: { enum: ["visible", "hidden", "veryHidden"] },
          usedRange: {
            anyOf: [
              { type: "null" },
              {
                type: "object",
                additionalProperties: false,
                required: ["start", "end", "rowCount", "columnCount"],
                properties: {
                  start: { type: "string" },
                  end: { type: "string" },
                  rowCount: { type: "integer", minimum: 0 },
                  columnCount: { type: "integer", minimum: 0 },
                },
              },
            ],
          },
          rows: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["rowNumber", "cells"],
              properties: {
                rowNumber: { type: "integer", minimum: 1 },
                cells: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["address", "column", "type", "value"],
                    properties: {
                      address: { type: "string" },
                      column: { type: "string" },
                      type: { enum: ["blank", "boolean", "number", "date", "string", "error"] },
                      value: { type: ["string", "number", "boolean", "null"] },
                      formula: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
});

const DOCX_LOCATOR_SCHEMA: JsonObject = deepFreeze({
  type: "object",
  additionalProperties: false,
  required: ["sectionIndex"],
  properties: {
    sectionIndex: { type: "integer", minimum: 1 },
    blockIndex: { type: "integer", minimum: 1 },
    paragraphIndex: { type: "integer", minimum: 1 },
    tableIndex: { type: "integer", minimum: 1 },
    rowIndex: { type: "integer", minimum: 1 },
    cellIndex: { type: "integer", minimum: 1 },
  },
});

const DOCX_RESULT_SCHEMA: JsonObject = deepFreeze({
  type: "object",
  additionalProperties: false,
  required: ["format", "blocks", "metadata"],
  properties: {
    format: { const: "docx" },
    blocks: {
      type: "array",
      items: {
        oneOf: [
          {
            type: "object",
            additionalProperties: false,
            required: ["kind", "locator", "content"],
            properties: {
              kind: { enum: ["heading", "paragraph", "list_item"] },
              locator: DOCX_LOCATOR_SCHEMA,
              content: { type: "string" },
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["kind", "locator", "rows"],
            properties: {
              kind: { const: "table" },
              locator: DOCX_LOCATOR_SCHEMA,
              rows: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["locator", "cells"],
                  properties: {
                    locator: DOCX_LOCATOR_SCHEMA,
                    cells: {
                      type: "array",
                      items: {
                        type: "object",
                        additionalProperties: false,
                        required: ["locator", "content", "colSpan", "rowSpan"],
                        properties: {
                          locator: DOCX_LOCATOR_SCHEMA,
                          content: { type: "string" },
                          colSpan: { type: "integer", minimum: 1 },
                          rowSpan: { type: "integer", minimum: 1 },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        ],
      },
    },
    metadata: {
      type: "object",
      additionalProperties: false,
      required: ["sectionCount"],
      properties: {
        sectionCount: { type: "integer", minimum: 1 },
      },
    },
  },
});

const XLSX_WRITE_OPTIONS_SCHEMA: JsonObject = deepFreeze({
  type: "object",
  additionalProperties: false,
  properties: {
    dateSystem: { enum: ["1900", "1904"] },
  },
});

const XLSX_WRITE_WORKBOOK_DEFS: JsonObject = deepFreeze({
  workbook: {
    type: "object",
    additionalProperties: false,
    required: ["sheets"],
    properties: {
      sheets: {
        type: "array",
        minItems: 1,
        maxItems: 32,
        items: { $ref: "#/$defs/sheet" },
      },
    },
  },
  sheet: {
    type: "object",
    additionalProperties: false,
    required: ["name", "rows"],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 31 },
      rows: {
        type: "array",
        maxItems: 10_000,
        items: { $ref: "#/$defs/row" },
      },
    },
  },
  row: {
    type: "object",
    additionalProperties: false,
    required: ["rowNumber", "cells"],
    properties: {
      rowNumber: { type: "integer", minimum: 1, maximum: 1_048_576 },
      cells: {
        type: "array",
        maxItems: 256,
        items: { $ref: "#/$defs/cell" },
      },
    },
  },
  cell: {
    type: "object",
    additionalProperties: false,
    required: ["column", "type", "value"],
    properties: {
      column: { type: "string", pattern: "^[A-Z]{1,3}$" },
      type: { enum: ["blank", "boolean", "number", "date", "string"] },
      value: { type: ["string", "number", "boolean", "null"] },
    },
  },
  options: XLSX_WRITE_OPTIONS_SCHEMA,
});

const XLSX_WRITE_RESULT_SCHEMA: JsonObject = deepFreeze({
  type: "object",
  additionalProperties: false,
  required: [
    "format",
    "relativePath",
    "sha256",
    "logicalWorkbookDigest",
    "byteSize",
    "sheetCount",
    "cellCount",
    "mediaType",
    "warnings",
  ],
  properties: {
    format: { const: "xlsx" },
    relativePath: { type: "string" },
    sha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
    logicalWorkbookDigest: { type: "string", pattern: "^[a-f0-9]{64}$" },
    byteSize: { type: "integer", minimum: 1 },
    sheetCount: { type: "integer", minimum: 1 },
    cellCount: { type: "integer", minimum: 0 },
    mediaType: {
      const: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
    warnings: {
      type: "array",
      maxItems: 16,
      items: { type: "string", maxLength: 200 },
    },
  },
});

const PPTX_PRESENTATION_SCHEMA: JsonObject = deepFreeze({
  type: "object",
  required: ["title", "slides"],
  description:
    "PresentationSpecV1: title; optional layout wide|standard and templateRef robothree.default; slides[] with title and elements[]. Element type is text, image, table, chart, or shape. Images use source type data with mediaType image/png|image/jpeg|image/webp and dataBase64, or source type url with HTTPS image URL resolved by Core ResourceResolver.",
});

const PPTX_OPTIONS_SCHEMA: JsonObject = deepFreeze({
  type: "object",
  additionalProperties: false,
});

const PPTX_WRITE_RESULT_SCHEMA: JsonObject = deepFreeze({
  type: "object",
  additionalProperties: false,
  required: [
    "format",
    "relativePath",
    "sha256",
    "presentationDigest",
    "byteSize",
    "slideCount",
    "mediaType",
    "warnings",
  ],
  properties: {
    format: { const: "pptx" },
    relativePath: { type: "string" },
    sha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
    presentationDigest: { type: "string", pattern: "^[a-f0-9]{64}$" },
    byteSize: { type: "integer", minimum: 1 },
    slideCount: { type: "integer", minimum: 1 },
    mediaType: {
      const: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    },
    warnings: {
      type: "array",
      maxItems: 16,
      items: { type: "string", maxLength: 200 },
    },
  },
});

const CAPABILITY_MATERIALS: Record<DocumentToolCapabilityId, {
  name: string;
  description: string;
  inputSchema: JsonObject;
  outputSchema: JsonObject;
  readOnlyHint: boolean;
  riskStaticFacts: readonly ToolRiskFactKind[];
}> = {
  "tool.document.pdf.extract_text": {
    name: "PDF Extract Text",
    description:
      "Extracts read-only text from a PDF in the selected workspace through the trusted Document Worker.",
    inputSchema: documentToolInputSchema(PDF_OPTIONS_SCHEMA),
    outputSchema: documentToolOutputSchema(PDF_RESULT_SCHEMA),
    readOnlyHint: true,
    riskStaticFacts: ["routine_file"],
  },
  "tool.document.pdf.extract_tables": {
    name: "PDF Extract Tables",
    description:
      "Extracts heuristic tables from text-selectable PDF text-layer geometry in the selected workspace through the trusted Document Worker. OCR and scanned image PDFs are unsupported.",
    inputSchema: documentToolModelInputSchema(PDF_TABLE_OPTIONS_SCHEMA),
    outputSchema: documentToolOutputSchema(PDF_TABLE_RESULT_SCHEMA),
    readOnlyHint: true,
    riskStaticFacts: ["routine_file"],
  },
  "tool.document.xlsx.read": {
    name: "XLSX Read",
    description:
      "Reads workbook sheets, rows, cells, formulas as expressions, and locators from an XLSX file through the trusted Document Worker.",
    inputSchema: documentToolInputSchema(XLSX_OPTIONS_SCHEMA),
    outputSchema: documentToolOutputSchema(XLSX_RESULT_SCHEMA),
    readOnlyHint: true,
    riskStaticFacts: ["routine_file"],
  },
  "tool.document.docx.read": {
    name: "DOCX Read",
    description:
      "Reads headings, paragraphs, lists, tables, and locators from a DOCX file through the trusted Document Worker.",
    inputSchema: documentToolInputSchema(DOCX_OPTIONS_SCHEMA),
    outputSchema: documentToolOutputSchema(DOCX_RESULT_SCHEMA),
    readOnlyHint: true,
    riskStaticFacts: ["routine_file"],
  },
  "tool.document.xlsx.write": {
    name: "XLSX Write",
    description:
      "Creates a new XLSX file, or overwrites one existing XLSX file only after exact user confirmation, through the trusted Document Worker.",
    inputSchema: xlsxWriteToolInputSchema(),
    outputSchema: documentToolOutputSchema(XLSX_WRITE_RESULT_SCHEMA),
    readOnlyHint: false,
    riskStaticFacts: ["routine_file", "destructive_file"],
  },
  "tool.document.pptx.write": {
    name: "PPTX Write",
    description:
      "Creates a new PPTX presentation in the selected workspace through the trusted Document Worker. Remote images are resolved only by the controlled ResourceResolver.",
    inputSchema: pptxWriteToolInputSchema(),
    outputSchema: documentToolOutputSchema(PPTX_WRITE_RESULT_SCHEMA),
    readOnlyHint: false,
    riskStaticFacts: ["routine_file"],
  },
};

export const DOCUMENT_TOOL_ADAPTER_DESCRIPTOR = createAdapterDescriptor({
  schemaVersion: CONTRACT_VERSION,
  adapterDescriptorId: DOCUMENT_TOOL_ADAPTER_DESCRIPTOR_ID,
  adapterKind: "tool_execution_backend",
  source: DOCUMENT_TOOL_SOURCE,
  implementationRef: DOCUMENT_TOOL_IMPLEMENTATION_REF,
  runtimeBoundary: "child_process",
  protocol: {
    name: "robothree-document-worker",
    version: DOCUMENT_WORKER_PRIVATE_PROTOCOL_VERSION,
  },
  effectRecoveryMode: "idempotent_retry",
  maxConcurrency: 1,
});

export const DOCUMENT_TOOL_DEFINITIONS = deepFreeze(DOCUMENT_TOOL_CAPABILITY_IDS.map((capabilityId) => {
  const material = CAPABILITY_MATERIALS[capabilityId];
  return createCapabilityDefinition({
    schemaVersion: CONTRACT_VERSION,
    capabilityId,
    kind: "tool",
    name: material.name,
    description: material.description,
    source: DOCUMENT_TOOL_SOURCE,
    tool: {
      inputSchema: material.inputSchema,
      outputSchema: material.outputSchema,
      readOnlyHint: material.readOnlyHint,
      risk: {
        schemaVersion: CONTRACT_VERSION,
        sourceRevision: DOCUMENT_TOOL_RISK_SOURCE_REVISION,
        staticFacts: [...material.riskStaticFacts],
      },
    },
  });
})) as readonly ToolCapabilityDefinition[];

export const DOCUMENT_TOOL_BINDINGS = deepFreeze(DOCUMENT_TOOL_DEFINITIONS.map((definition) =>
  createCapabilityBinding({
    schemaVersion: CONTRACT_VERSION,
    bindingId: `binding.${definition.capabilityId}`,
    capability: {
      capabilityId: definition.capabilityId,
      capabilityRevision: definition.revision,
    },
    adapterDescriptor: {
      adapterDescriptorId: DOCUMENT_TOOL_ADAPTER_DESCRIPTOR.adapterDescriptorId,
      adapterDescriptorRevision: DOCUMENT_TOOL_ADAPTER_DESCRIPTOR.revision,
    },
    port: "tool_execution_backend",
    source: DOCUMENT_TOOL_SOURCE,
  })
)) as readonly CapabilityBinding[];

export const DOCUMENT_TOOL_REGISTRY_RECORDS: DocumentToolRegistryRecords = deepFreeze({
  definitions: DOCUMENT_TOOL_DEFINITIONS,
  bindings: DOCUMENT_TOOL_BINDINGS,
  descriptor: DOCUMENT_TOOL_ADAPTER_DESCRIPTOR,
});

export function registerDocumentToolRecords(builder: RegistryBuilder): RegistryBuilder {
  builder.registerAdapterDescriptor(DOCUMENT_TOOL_ADAPTER_DESCRIPTOR);
  for (const definition of DOCUMENT_TOOL_DEFINITIONS) {
    builder.registerCapability(definition);
  }
  for (const binding of DOCUMENT_TOOL_BINDINGS) {
    builder.registerBinding(binding);
  }
  return builder;
}

export function createDocumentToolRegistrySnapshot(): FinalizedRegistrySnapshot {
  return registerDocumentToolRecords(new RegistryBuilder({ trustedSources: [DOCUMENT_TOOL_SOURCE] }))
    .finalize();
}

function documentToolInputSchema(optionsSchema: JsonObject): JsonObject {
  return deepFreeze({
    type: "object",
    additionalProperties: false,
    required: ["workspaceRoot", "relativePath", "limits"],
    properties: {
      workspaceRoot: {
        type: "string",
        minLength: 1,
        maxLength: 4096,
      },
      relativePath: {
        type: "string",
        minLength: 1,
        maxLength: 4096,
      },
      options: optionsSchema,
      limits: LIMITS_SCHEMA,
    },
  });
}

function documentToolModelInputSchema(optionsSchema: JsonObject): JsonObject {
  return deepFreeze({
    type: "object",
    additionalProperties: false,
    required: ["relativePath"],
    properties: {
      relativePath: {
        type: "string",
        minLength: 1,
        maxLength: 4096,
        description: "Workspace-relative PDF path. Absolute paths are rejected.",
      },
      options: optionsSchema,
    },
  });
}

function xlsxWriteToolInputSchema(): JsonObject {
  return deepFreeze({
    type: "object",
    additionalProperties: false,
    required: ["relativePath", "workbook"],
    properties: {
      relativePath: {
        type: "string",
        minLength: 1,
        maxLength: 1024,
        description: "Workspace-relative .xlsx target path. Absolute paths are rejected.",
      },
      workbook: { $ref: "#/$defs/workbook" },
      mode: {
        enum: ["create_new", "overwrite_existing"],
        default: "create_new",
        description: "create_new creates only a missing .xlsx target; overwrite_existing requires exact user confirmation.",
      },
      options: { $ref: "#/$defs/options" },
    },
    $defs: XLSX_WRITE_WORKBOOK_DEFS,
  });
}

function pptxWriteToolInputSchema(): JsonObject {
  return deepFreeze({
    type: "object",
    additionalProperties: false,
    required: ["relativePath", "presentation"],
    properties: {
      relativePath: {
        type: "string",
        minLength: 1,
        maxLength: 1024,
        description: "Workspace-relative .pptx target path. Absolute paths are rejected.",
      },
      presentation: PPTX_PRESENTATION_SCHEMA,
      options: PPTX_OPTIONS_SCHEMA,
    },
  });
}

function documentToolOutputSchema(resultSchema: JsonObject): JsonObject {
  return deepFreeze({
    type: "object",
    additionalProperties: false,
    required: ["status", "result", "metadata"],
    properties: {
      status: { enum: ["succeeded", "truncated"] },
      result: resultSchema,
      metadata: DOCUMENT_TOOL_METADATA_SCHEMA,
    },
  });
}

function positiveIntegerSchema(description: string): JsonObject {
  return {
    type: "integer",
    minimum: 1,
    description,
  };
}

function nullablePositiveIntegerSchema(description: string): JsonObject {
  return {
    type: ["integer", "null"],
    minimum: 1,
    description,
  };
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}
