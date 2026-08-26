import {
  CONTRACT_VERSION,
  CONTEXT_SCHEMA_VERSION,
  CONVERSATION_SCHEMA_VERSION,
  JsonValueSchema,
  MODEL_PROTOCOL_VERSION,
  RUNTIME_SELECTION_SCHEMA_VERSION,
  type AssistantToolCall,
  type ConversationMessage,
  type Observation,
  type TaskCapabilityLock,
  type TaskRuntimeSelection,
  type TurnContextSnapshot,
} from "@robothree/contracts";
import { describe, expect, it } from "vitest";

import {
  ConservativeTokenEstimator,
  ContextBudgetPolicy,
  ContextPipeline,
  DOCUMENT_TOOL_ADAPTER_DESCRIPTOR_ID,
  DOCUMENT_TOOL_CAPABILITY_IDS,
  DOCUMENT_TOOL_IMPLEMENTATION_REF,
  DOCUMENT_TOOL_REGISTRY_RECORDS,
  type DocumentToolCapabilityId,
  createDocumentToolRegistrySnapshot,
  createTaskRuntimeSelection,
  documentToolCandidatesForContext,
  sha256CanonicalJson,
  toolObservationMessage,
} from "../src/index.js";

const entityId = (value: number) =>
  `019f8840-0000-7000-8000-${String(value).padStart(12, "0")}`;
const digest = (value: string) => `sha256:${value.repeat(64)}` as const;
const rawDigest = "a".repeat(64);
const at = "2026-08-04T09:00:00.000Z";
const taskId = entityId(1);
const snapshotId = entityId(2);
const sessionId = entityId(3);

describe("DTP-2B Document Tool context semantics", () => {
  it("materializes only selected, authorized, exact Document Tool candidates", () => {
    const { locks, selection } = documentRuntimeSelection();
    const candidates = documentToolCandidatesForContext({
      snapshotId,
      runtimeSelection: selection,
      locks,
      authorization: { outcome: "allowed", decisionDigest: digest("b") },
    });

    expect(candidates.map((candidate) => candidate.lock.definitionSnapshot.capabilityId)).toEqual([
      "tool.document.docx.read",
      "tool.document.pdf.extract_tables",
      "tool.document.pdf.extract_text",
      "tool.document.pptx.write",
      "tool.document.xlsx.read",
      "tool.document.xlsx.write",
    ]);
    for (const candidate of candidates) {
      expect(candidate.authorization).toEqual({ outcome: "allowed", decisionDigest: digest("b") });
      expect(candidate.registration).toMatchObject({
        registryRevision: candidate.lock.registryRevision,
        capabilityRevision: candidate.lock.definitionSnapshot.revision,
        bindingRevision: candidate.lock.bindingSnapshot.revision,
        adapterDescriptorRevision: DOCUMENT_TOOL_REGISTRY_RECORDS.descriptor.revision,
        versionCompatible: true,
      });
      expect(candidate.lockDigest).toBe(sha256CanonicalJson(JsonValueSchema.parse(candidate.lock)));
    }
  });

  it("fails closed for denied authorization, digest drift, and registry material drift", () => {
    const { locks, selection } = documentRuntimeSelection();
    expect(documentToolCandidatesForContext({
      snapshotId,
      runtimeSelection: selection,
      locks,
      authorization: { outcome: "denied", decisionDigest: digest("c") },
    })).toEqual([]);

    expect(documentToolCandidatesForContext({
      snapshotId,
      runtimeSelection: {
        ...selection,
        toolLocks: selection.toolLocks.map((reference, index) =>
          index === 0 ? { ...reference, lockDigest: digest("d") } : reference),
      },
      locks,
      authorization: { outcome: "allowed", decisionDigest: digest("c") },
    }).map((candidate) => candidate.lock.definitionSnapshot.capabilityId)).not.toContain(
      selection.toolLocks[0]?.capabilityId,
    );

    const drifted = structuredClone(locks[0]);
    if (drifted !== undefined) {
      drifted.adapterDescriptorSnapshot.revision = digest("e");
    }
    expect(documentToolCandidatesForContext({
      snapshotId,
      runtimeSelection: selection,
      locks: drifted === undefined ? locks : [drifted, ...locks.slice(1)],
      authorization: { outcome: "allowed", decisionDigest: digest("c") },
    }).map((candidate) => candidate.lock.definitionSnapshot.capabilityId)).not.toContain(
      selection.toolLocks[0]?.capabilityId,
    );
  });

  it("passes formal Document Tool schemas into ContextPipeline without adapter internals", () => {
    const { locks, selection } = documentRuntimeSelection();
    const message = userMessage(1, "Read the selected workspace document.");
    const snapshot = snapshotForLocks([message], locks);
    const candidates = documentToolCandidatesForContext({
      snapshotId: snapshot.snapshotId,
      runtimeSelection: selection,
      locks,
      authorization: { outcome: "allowed", decisionDigest: digest("f") },
    });
    const result = new ContextPipeline({
      budgetPolicy: new ContextBudgetPolicy({
        modelContextWindow: 20_000,
        reservedOutputTokens: 1_024,
        safetyMarginTokens: 512,
        compactionThresholdRatio: 1,
        maxPreviewBytes: 4_096,
      }),
      estimator: new ConservativeTokenEstimator(),
    }).run({
      phase: "pre_call",
      requestId: entityId(80),
      snapshot,
      conversationMessages: [message],
      model: {
        capabilityId: "model.fake",
        capabilityRevision: digest("1"),
      },
      toolCandidates: candidates,
    });

    expect(result.request.tools.map((tool) => tool.capabilityId)).toEqual([
      "tool.document.docx.read",
      "tool.document.pdf.extract_tables",
      "tool.document.pdf.extract_text",
      "tool.document.pptx.write",
      "tool.document.xlsx.read",
      "tool.document.xlsx.write",
    ]);
    expect(result.receipt.includedSegments.filter((segment) =>
      segment.sourceKind === "tool_schema")).toHaveLength(6);
    const serializedTools = JSON.stringify(result.request.tools);
    expect(serializedTools).not.toContain(DOCUMENT_TOOL_ADAPTER_DESCRIPTOR_ID);
    expect(serializedTools).not.toContain(DOCUMENT_TOOL_IMPLEMENTATION_REF);
    expect(serializedTools).not.toContain("binding.tool.document");
    const writeTool = result.request.tools.find((tool) => tool.capabilityId === "tool.document.xlsx.write");
    expect(JSON.stringify(writeTool)).not.toContain("workspaceRoot");
    expect(JSON.stringify(writeTool)).not.toContain("limits");
    const tableTool = result.request.tools.find((tool) =>
      tool.capabilityId === "tool.document.pdf.extract_tables");
    expect(JSON.stringify(tableTool)).not.toContain("workspaceRoot");
    expect(JSON.stringify(tableTool)).not.toContain("limits");
    expect(JSON.stringify(tableTool)).toContain("includeGeometry");
    expect(JSON.stringify(tableTool)).toContain("minConfidence");
    const pptxTool = result.request.tools.find((tool) =>
      tool.capabilityId === "tool.document.pptx.write");
    expect(JSON.stringify(pptxTool)).toContain("presentation");
    expect(JSON.stringify(pptxTool)).toContain("image/png");
    expect(JSON.stringify(pptxTool)).toContain("HTTPS image URL");
    expect(JSON.stringify(pptxTool)).not.toContain("workspaceRoot");
    expect(JSON.stringify(pptxTool)).not.toContain("limits");
    expect(JSON.stringify(pptxTool)).not.toContain("PptxGenJS");
  });

  it("summarizes Document Tool observations and preserves non-document Tool JSON output", () => {
    const call = toolCall("tool.document.pdf.extract_text");
    const huge = "alpha ".repeat(2_000);
    const observation: Observation = {
      observationId: entityId(91),
      actionId: call.actionId,
      observedAt: at,
      outcome: "succeeded",
      output: {
        status: "truncated",
        result: {
          format: "pdf",
          pageCount: 2,
          pages: [
            { pageNumber: 1, text: huge, rotation: 0, empty: false },
            { pageNumber: 2, text: "第二页 Unicode 文本", rotation: 0, empty: false },
          ],
        },
        metadata: {
          originalCount: 2,
          returnedCount: 2,
          truncated: true,
          resultDigest: rawDigest,
          timingMs: 7,
        },
      },
    };

    const message = toolObservationMessage(call, observation);
    const text = message.content[0]?.text ?? "";
    expect(message.resultDigest).toBe(sha256CanonicalJson(JsonValueSchema.parse(observation)));
    expect(text).toContain("Document tool: tool.document.pdf.extract_text");
    expect(text).toContain("Status: truncated");
    expect(text).toContain(`Result digest: ${rawDigest}`);
    expect(text).toContain("[page 1] alpha");
    expect(text).not.toContain("\"pages\"");
    expect(text).not.toContain(huge);
    expect(new TextEncoder().encode(text).byteLength).toBeLessThanOrEqual(4_096);

    const echo = toolObservationMessage({
      ...call,
      capabilityId: "tool.echo",
    }, {
      ...observation,
      output: { value: "hello" },
    });
    expect(echo.content).toEqual([{ type: "text", text: "{\"value\":\"hello\"}" }]);
  });

  it("summarizes XLSX write observations without leaking workbook payloads or absolute paths", () => {
    const call = toolCall("tool.document.xlsx.write");
    const observation: Observation = {
      observationId: entityId(92),
      actionId: call.actionId,
      observedAt: at,
      outcome: "succeeded",
      output: {
        status: "succeeded",
        result: {
          format: "xlsx",
          relativePath: "reports/out.xlsx",
          sha256: rawDigest,
          logicalWorkbookDigest: "b".repeat(64),
          byteSize: 4096,
          sheetCount: 1,
          cellCount: 2,
          mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          warnings: [],
        },
        metadata: {
          originalCount: 1,
          returnedCount: 1,
          truncated: false,
          resultDigest: "c".repeat(64),
          timingMs: 9,
        },
      },
    };

    const text = toolObservationMessage(call, observation).content[0]?.text ?? "";
    expect(text).toContain("Document tool: tool.document.xlsx.write");
    expect(text).toContain("Created: reports/out.xlsx");
    expect(text).toContain(`File SHA-256: ${rawDigest}`);
    expect(text).not.toContain("Secret Cell");
    expect(text).not.toContain("\"sheets\"");
    expect(text).not.toContain("/tmp/");
    expect(new TextEncoder().encode(text).byteLength).toBeLessThanOrEqual(4_096);
  });

  it("summarizes PPTX write observations without leaking presentation payloads or resource internals", () => {
    const call = toolCall("tool.document.pptx.write");
    const observation: Observation = {
      observationId: entityId(94),
      actionId: call.actionId,
      observedAt: at,
      outcome: "succeeded",
      output: {
        status: "succeeded",
        result: {
          format: "pptx",
          relativePath: "reports/deck.pptx",
          sha256: rawDigest,
          presentationDigest: "d".repeat(64),
          byteSize: 8192,
          slideCount: 2,
          mediaType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          warnings: [],
        },
        metadata: {
          originalCount: 2,
          returnedCount: 2,
          truncated: false,
          resultDigest: "e".repeat(64),
          timingMs: 12,
        },
      },
    };

    const text = toolObservationMessage(call, observation).content[0]?.text ?? "";
    expect(text).toContain("Document tool: tool.document.pptx.write");
    expect(text).toContain("Created: reports/deck.pptx");
    expect(text).toContain("Slides: 2");
    expect(text).toContain(`Presentation digest: ${"d".repeat(64)}`);
    expect(text).not.toContain("\"slides\"");
    expect(text).not.toContain("dataBase64");
    expect(text).not.toContain("/tmp/");
    expect(new TextEncoder().encode(text).byteLength).toBeLessThanOrEqual(4_096);
  });

  it("summarizes PDF table observations without leaking raw table JSON or full cell text", () => {
    const call = toolCall("tool.document.pdf.extract_tables");
    const huge = "cell ".repeat(2_000);
    const observation: Observation = {
      observationId: entityId(93),
      actionId: call.actionId,
      observedAt: at,
      outcome: "succeeded",
      output: {
        status: "truncated",
        result: {
          format: "pdf",
          extraction: "tables",
          pageCount: 1,
          selectedPageCount: 1,
          warnings: ["ambiguous_columns"],
          tables: [{
            pageNumber: 1,
            tableIndex: 1,
            rowCount: 4,
            columnCount: 3,
            confidence: 0.82,
            locator: { pageNumber: 1, tableIndex: 1 },
            warnings: ["table_truncated"],
            rows: [
              {
                rowIndex: 1,
                cells: [
                  { rowIndex: 1, columnIndex: 1, text: "Name" },
                  { rowIndex: 1, columnIndex: 2, text: "Amount" },
                  { rowIndex: 1, columnIndex: 3, text: huge },
                ],
              },
            ],
          }],
        },
        metadata: {
          originalCount: 1,
          returnedCount: 1,
          truncated: true,
          resultDigest: rawDigest,
          timingMs: 11,
        },
      },
    };

    const text = toolObservationMessage(call, observation).content[0]?.text ?? "";
    expect(text).toContain("Document tool: tool.document.pdf.extract_tables");
    expect(text).toContain("[table 1] page 1, table 1: 4 rows x 3 columns, confidence 0.82");
    expect(text).toContain("Name | Amount");
    expect(text).toContain("Warning: ambiguous_columns");
    expect(text).not.toContain("\"tables\"");
    expect(text).not.toContain(huge);
    expect(new TextEncoder().encode(text).byteLength).toBeLessThanOrEqual(4_096);
  });
});

function documentRuntimeSelection(): {
  locks: readonly TaskCapabilityLock[];
  selection: TaskRuntimeSelection;
} {
  const registry = createDocumentToolRegistrySnapshot();
  const locks = DOCUMENT_TOOL_CAPABILITY_IDS.map((capabilityId, index) =>
    documentLock(capabilityId, registry.registryRevision, index));
  const selection = createTaskRuntimeSelection({
    schemaVersion: RUNTIME_SELECTION_SCHEMA_VERSION,
    runtimeSelectionId: entityId(10),
    taskId,
    agent: {
      agentDefinitionId: "agent.dtp-2b",
      revision: digest("2"),
      digest: digest("2"),
    },
    agentDefaultModelId: "model.fake",
    resolvedModelLock: {
      lockId: entityId(11),
      capabilityId: "model.fake",
      lockDigest: digest("3"),
    },
    activeSkillRevisions: [],
    toolLocks: locks.map((lock) => ({
      lockId: lock.lockId,
      capabilityId: lock.definitionSnapshot.capabilityId,
      lockDigest: sha256CanonicalJson(JsonValueSchema.parse(lock)),
    })),
    knowledgeRevisions: [],
    platformPromptRevision: digest("4"),
    registryRevision: registry.registryRevision,
    createdAt: at,
  });
  return { locks, selection };
}

function documentLock(
  capabilityId: DocumentToolCapabilityId,
  registryRevision: string,
  index: number,
): TaskCapabilityLock {
  const definition = DOCUMENT_TOOL_REGISTRY_RECORDS.definitions.find((record) =>
    record.capabilityId === capabilityId);
  const binding = DOCUMENT_TOOL_REGISTRY_RECORDS.bindings.find((record) =>
    record.capability.capabilityId === capabilityId);
  if (definition === undefined || binding === undefined) {
    throw new Error(`missing document registry record for ${capabilityId}`);
  }
  return {
    schemaVersion: CONTRACT_VERSION,
    lockId: entityId(20 + index),
    taskId,
    registryRevision,
    definitionSnapshot: definition,
    bindingSnapshot: binding,
    adapterDescriptorSnapshot: DOCUMENT_TOOL_REGISTRY_RECORDS.descriptor,
    lockedAt: at,
  };
}

function snapshotForLocks(
  messages: readonly ConversationMessage[],
  locks: readonly TaskCapabilityLock[],
): TurnContextSnapshot {
  const tasks = [{
    taskId,
    stateRevision: 1,
    lastEventSequence: 0,
    checkpointId: entityId(50),
    stateDigest: digest("5"),
    capabilityLocks: locks.map((lock) => ({
      lockId: lock.lockId,
      capabilityId: lock.definitionSnapshot.capabilityId,
      capabilityRevision: lock.definitionSnapshot.revision,
      registryRevision: lock.registryRevision,
      lockDigest: sha256CanonicalJson(JsonValueSchema.parse(lock)),
    })),
  }];
  const projection = messages.map((message, index) => ({
    type: "conversation_message" as const,
    order: index,
    sessionId,
    messageId: message.envelope.messageId,
    messageSequence: message.envelope.sequence,
    messageDigest: message.envelope.messageDigest,
  }));
  return {
    schemaVersion: CONTEXT_SCHEMA_VERSION,
    snapshotId,
    sessionId,
    conversation: {
      sessionId,
      messageSequence: messages.length,
      contextRevision: 0,
      messageStartSequence: 1,
      messageEndSequence: messages.length,
      messageDigest: sha256CanonicalJson(JsonValueSchema.parse(messages.map((message) => ({
        messageId: message.envelope.messageId,
        digest: message.envelope.messageDigest,
      })))),
    },
    tasks,
    projection,
    sourceDigest: sha256CanonicalJson(JsonValueSchema.parse({ tasks, projection })),
    createdAt: at,
  };
}

function userMessage(sequence: number, text: string): ConversationMessage {
  const message = {
    schemaVersion: MODEL_PROTOCOL_VERSION,
    role: "user" as const,
    content: [{ type: "text" as const, text }],
  };
  return {
    envelope: {
      schemaVersion: CONVERSATION_SCHEMA_VERSION,
      messageId: entityId(60 + sequence),
      sessionId,
      sequence,
      messageSchemaVersion: MODEL_PROTOCOL_VERSION,
      messageDigest: sha256CanonicalJson(JsonValueSchema.parse(message)),
      createdAt: at,
    },
    message,
  };
}

function toolCall(capabilityId: string): AssistantToolCall {
  return {
    toolCallId: entityId(90),
    taskId,
    actionId: entityId(92),
    capabilityId,
    arguments: {},
  };
}
