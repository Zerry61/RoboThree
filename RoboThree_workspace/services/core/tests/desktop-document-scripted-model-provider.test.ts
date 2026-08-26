import {
  MODEL_PROTOCOL_VERSION,
  type ModelRequest,
  type ModelStreamEvent,
} from "@robothree/contracts";
import { describe, expect, it } from "vitest";

import {
  DesktopDocumentScriptedModelProvider,
  sha256CanonicalJson,
} from "../src/index.js";

const digest = (marker: string) => `sha256:${marker.repeat(64)}`;

describe("DesktopDocumentScriptedModelProvider", () => {
  it("emits a model-visible Document Tool call without workspaceRoot", async () => {
    const provider = new DesktopDocumentScriptedModelProvider({
      adapterDescriptorId: "adapter.model.desktop-scripted",
      adapterDescriptorRevision: digest("a"),
    });
    const events = await collect(provider.stream(request("Read sample.pdf"), new AbortController().signal, {
      taskId: "019f7d00-0000-7000-8000-000000000001",
      runId: "019f7d00-0000-7000-8000-000000000002",
      stepId: "019f7d00-0000-7000-8000-000000000003",
      actionId: "019f7d00-0000-7000-8000-000000000004",
      round: 1,
      runtimeSelection: runtimeSelection(),
      modelLock: modelLock(),
      modelRequest: request("Read sample.pdf"),
      assistantMessageId: "019f7d00-0000-7000-8000-000000000005",
      deadlineAt: "2026-08-04T09:00:00.000Z",
      externalTarget: "core:desktop-scripted-model",
      dataCategories: ["user_text", "tool_schema"],
      dataScopeDigest: digest("b"),
      admission: {
        type: "user_confirmed",
        confirmationId: "019f7d00-0000-7000-8000-000000000006",
        scopeDigest: digest("b"),
        confirmationDigest: digest("c"),
      },
    }));

    expect(events).toMatchObject([
      { type: "started" },
      {
        type: "tool_call",
        call: {
          taskId: "019f7d00-0000-7000-8000-000000000001",
          capabilityId: "tool.document.pdf.extract_text",
          arguments: {
            relativePath: "sample.pdf",
            options: {},
          },
        },
      },
      { type: "completed", finishReason: "tool_calls" },
    ]);
    expect(JSON.stringify(events)).not.toContain("workspaceRoot");
  });

  it("uses PDF extract_tables only for explicit table intent", async () => {
    const provider = new DesktopDocumentScriptedModelProvider({
      adapterDescriptorId: "adapter.model.desktop-scripted",
      adapterDescriptorRevision: digest("a"),
    });
    const events = await collect(provider.stream(
      request("Extract tables from reports/sample.pdf", [
        "tool.document.pdf.extract_text",
        "tool.document.pdf.extract_tables",
        "tool.document.xlsx.read",
      ]),
      new AbortController().signal,
      {
        taskId: "019f7d00-0000-7000-8000-000000000001",
        runId: "019f7d00-0000-7000-8000-000000000002",
        stepId: "019f7d00-0000-7000-8000-000000000003",
        actionId: "019f7d00-0000-7000-8000-000000000004",
        round: 1,
        runtimeSelection: runtimeSelection(),
        modelLock: modelLock(),
        modelRequest: request("Extract tables from reports/sample.pdf"),
        assistantMessageId: "019f7d00-0000-7000-8000-000000000005",
        deadlineAt: "2026-08-04T09:00:00.000Z",
        externalTarget: "core:desktop-scripted-model",
        dataCategories: ["user_text", "tool_schema"],
        dataScopeDigest: digest("b"),
        admission: {
          type: "user_confirmed",
          confirmationId: "019f7d00-0000-7000-8000-000000000006",
          scopeDigest: digest("b"),
          confirmationDigest: digest("c"),
        },
      },
    ));

    expect(events).toMatchObject([
      { type: "started" },
      {
        type: "tool_call",
        call: {
          capabilityId: "tool.document.pdf.extract_tables",
          arguments: {
            relativePath: "reports/sample.pdf",
            options: {},
          },
        },
      },
      { type: "completed", finishReason: "tool_calls" },
    ]);
    expect(JSON.stringify(events)).not.toContain("workspaceRoot");
    expect(JSON.stringify(events)).not.toContain("limits");
  });

  it("emits an XLSX write Tool call with model-visible workbook data only", async () => {
    const provider = new DesktopDocumentScriptedModelProvider({
      adapterDescriptorId: "adapter.model.desktop-scripted",
      adapterDescriptorRevision: digest("a"),
    });
    const events = await collect(provider.stream(
      request("Create reports/out.xlsx", [
        "tool.document.pdf.extract_text",
        "tool.document.xlsx.read",
        "tool.document.docx.read",
        "tool.document.xlsx.write",
      ]),
      new AbortController().signal,
      {
        taskId: "019f7d00-0000-7000-8000-000000000001",
        runId: "019f7d00-0000-7000-8000-000000000002",
        stepId: "019f7d00-0000-7000-8000-000000000003",
        actionId: "019f7d00-0000-7000-8000-000000000004",
        round: 1,
        runtimeSelection: runtimeSelection(),
        modelLock: modelLock(),
        modelRequest: request("Create reports/out.xlsx"),
        assistantMessageId: "019f7d00-0000-7000-8000-000000000005",
        deadlineAt: "2026-08-04T09:00:00.000Z",
        externalTarget: "core:desktop-scripted-model",
        dataCategories: ["user_text", "tool_schema"],
        dataScopeDigest: digest("b"),
        admission: {
          type: "user_confirmed",
          confirmationId: "019f7d00-0000-7000-8000-000000000006",
          scopeDigest: digest("b"),
          confirmationDigest: digest("c"),
        },
      },
    ));

    expect(events).toMatchObject([
      { type: "started" },
      {
        type: "tool_call",
        call: {
          capabilityId: "tool.document.xlsx.write",
          arguments: {
            relativePath: "reports/out.xlsx",
            workbook: {
              sheets: [expect.objectContaining({ name: "Report" })],
            },
            options: {},
          },
        },
      },
      { type: "completed", finishReason: "tool_calls" },
    ]);
    expect(JSON.stringify(events)).not.toContain("workspaceRoot");
    expect(JSON.stringify(events)).not.toContain("limits");
    expect(JSON.stringify(events)).not.toContain("overwrite_existing");
  });

  it("keeps legacy document intents stable when PPTX write is also available", async () => {
    const provider = new DesktopDocumentScriptedModelProvider({
      adapterDescriptorId: "adapter.model.desktop-scripted",
      adapterDescriptorRevision: digest("a"),
    });
    const capabilities = [
      "tool.document.pdf.extract_text",
      "tool.document.pdf.extract_tables",
      "tool.document.xlsx.read",
      "tool.document.docx.read",
      "tool.document.xlsx.write",
      "tool.document.pptx.write",
    ];

    const xlsxEvents = await collect(provider.stream(
      request("Create reports/out.xlsx", capabilities),
      new AbortController().signal,
      invocation("Create reports/out.xlsx"),
    ));
    expect(xlsxEvents).toMatchObject([
      { type: "started" },
      {
        type: "tool_call",
        call: {
          capabilityId: "tool.document.xlsx.write",
          arguments: {
            relativePath: "reports/out.xlsx",
            workbook: {
              sheets: [expect.objectContaining({ name: "Report" })],
            },
            options: {},
          },
        },
      },
      { type: "completed", finishReason: "tool_calls" },
    ]);

    const pdfEvents = await collect(provider.stream(
      request("Extract tables from reports/sample.pdf", capabilities),
      new AbortController().signal,
      invocation("Extract tables from reports/sample.pdf"),
    ));
    expect(pdfEvents).toMatchObject([
      { type: "started" },
      {
        type: "tool_call",
        call: {
          capabilityId: "tool.document.pdf.extract_tables",
          arguments: {
            relativePath: "reports/sample.pdf",
            options: {},
          },
        },
      },
      { type: "completed", finishReason: "tool_calls" },
    ]);
    expect(JSON.stringify([...xlsxEvents, ...pdfEvents])).not.toContain("workspaceRoot");
    expect(JSON.stringify([...xlsxEvents, ...pdfEvents])).not.toContain("limits");
  });

  it("generates a PPTX write call with a bounded PresentationSpec and no private fields", async () => {
    const provider = new DesktopDocumentScriptedModelProvider({
      adapterDescriptorId: "adapter.model.desktop-scripted",
      adapterDescriptorRevision: digest("a"),
    });
    const events = await collect(provider.stream(
      request("Create reports/deck.pptx", [
        "tool.document.pptx.write",
      ]),
      new AbortController().signal,
      invocation("Create reports/deck.pptx"),
    ));

    expect(events).toMatchObject([
      { type: "started" },
      {
        type: "tool_call",
        call: {
          capabilityId: "tool.document.pptx.write",
          arguments: {
            relativePath: "reports/deck.pptx",
            presentation: {
              title: "RoboThree Generated Deck",
              slides: [
                expect.objectContaining({ title: "RoboThree PPTX" }),
                expect.objectContaining({ title: "Summary" }),
              ],
            },
            options: {},
          },
        },
      },
      { type: "completed", finishReason: "tool_calls" },
    ]);
    expect(JSON.stringify(events)).not.toContain("workspaceRoot");
    expect(JSON.stringify(events)).not.toContain("limits");
    expect(JSON.stringify(events)).not.toContain("dataBase64");
    expect(JSON.stringify(events)).not.toContain("https://");
  });

  it("emits overwrite mode only for explicit XLSX overwrite intent", async () => {
    const provider = new DesktopDocumentScriptedModelProvider({
      adapterDescriptorId: "adapter.model.desktop-scripted",
      adapterDescriptorRevision: digest("a"),
    });
    const events = await collect(provider.stream(
      request("Overwrite reports/out.xlsx", [
        "tool.document.pdf.extract_text",
        "tool.document.xlsx.read",
        "tool.document.docx.read",
        "tool.document.xlsx.write",
      ]),
      new AbortController().signal,
      {
        taskId: "019f7d00-0000-7000-8000-000000000001",
        runId: "019f7d00-0000-7000-8000-000000000002",
        stepId: "019f7d00-0000-7000-8000-000000000003",
        actionId: "019f7d00-0000-7000-8000-000000000004",
        round: 1,
        runtimeSelection: runtimeSelection(),
        modelLock: modelLock(),
        modelRequest: request("Overwrite reports/out.xlsx"),
        assistantMessageId: "019f7d00-0000-7000-8000-000000000005",
        deadlineAt: "2026-08-04T09:00:00.000Z",
        externalTarget: "core:desktop-scripted-model",
        dataCategories: ["user_text", "tool_schema"],
        dataScopeDigest: digest("b"),
        admission: {
          type: "user_confirmed",
          confirmationId: "019f7d00-0000-7000-8000-000000000006",
          scopeDigest: digest("b"),
          confirmationDigest: digest("c"),
        },
      },
    ));

    expect(events).toMatchObject([
      { type: "started" },
      {
        type: "tool_call",
        call: {
          capabilityId: "tool.document.xlsx.write",
          arguments: {
            relativePath: "reports/out.xlsx",
            mode: "overwrite_existing",
            workbook: {
              sheets: [expect.objectContaining({ name: "Report" })],
            },
            options: {},
          },
        },
      },
      { type: "completed", finishReason: "tool_calls" },
    ]);
    expect(JSON.stringify(events)).not.toContain("workspaceRoot");
    expect(JSON.stringify(events)).not.toContain("limits");
    expect(JSON.stringify(events)).not.toContain("confirmedOldSha256");
    expect(JSON.stringify(events)).not.toContain("requestDigest");
  });

  it("turns a Tool Result message into bounded final assistant text", async () => {
    const provider = new DesktopDocumentScriptedModelProvider({
      adapterDescriptorId: "adapter.model.desktop-scripted",
      adapterDescriptorRevision: digest("a"),
    });
    const events = await collect(provider.stream(toolResultRequest(), new AbortController().signal));

    expect(events).toMatchObject([
      { type: "started" },
      {
        type: "text_delta",
        delta: expect.stringContaining("Document tool completed."),
      },
      { type: "completed", finishReason: "stop" },
    ]);
    expect(JSON.stringify(events)).toContain("DTP-3B provider preview");
  });

  it("turns a failed Tool Result message into bounded final assistant text", async () => {
    const provider = new DesktopDocumentScriptedModelProvider({
      adapterDescriptorId: "adapter.model.desktop-scripted",
      adapterDescriptorRevision: digest("a"),
    });
    const events = await collect(provider.stream(
      toolResultRequest("failed"),
      new AbortController().signal,
    ));

    expect(events).toMatchObject([
      { type: "started" },
      {
        type: "text_delta",
        delta: expect.stringContaining("Document tool failed."),
      },
      { type: "completed", finishReason: "stop" },
    ]);
    expect(JSON.stringify(events)).toContain("DTP-3B provider preview");
  });
});

async function collect(source: AsyncIterable<ModelStreamEvent>): Promise<ModelStreamEvent[]> {
  const events: ModelStreamEvent[] = [];
  for await (const event of source) events.push(event);
  return events;
}

function request(
  text: string,
  capabilities: readonly string[] = ["tool.document.pdf.extract_text"],
): ModelRequest {
  const material = {
    schemaVersion: MODEL_PROTOCOL_VERSION,
    requestId: "019f7d00-0000-7000-8000-000000000101",
    snapshotId: "019f7d00-0000-7000-8000-000000000102",
    contextSourceDigest: digest("d"),
    model: {
      capabilityId: "model.desktop-scripted",
      capabilityRevision: digest("e"),
    },
    messages: [{
      schemaVersion: MODEL_PROTOCOL_VERSION,
      role: "user" as const,
      content: [{ type: "text" as const, text }],
    }],
    tools: capabilities.map((capabilityId, index) => ({
      taskId: "019f7d00-0000-7000-8000-000000000001",
      lockId: `019f7d00-0000-7000-8000-${String(103 + index).padStart(12, "0")}`,
      capabilityId,
      capabilityRevision: digest("f"),
      name: `Document Tool ${index + 1}`,
      description: "Document Tool test capability.",
      inputSchema: { type: "object" },
    })),
    artifacts: [],
    maxOutputTokens: 1_024,
  };
  return {
    ...material,
    requestDigest: sha256CanonicalJson(material),
  };
}

function invocation(text: string) {
  return {
    taskId: "019f7d00-0000-7000-8000-000000000001",
    runId: "019f7d00-0000-7000-8000-000000000002",
    stepId: "019f7d00-0000-7000-8000-000000000003",
    actionId: "019f7d00-0000-7000-8000-000000000004",
    round: 1,
    runtimeSelection: runtimeSelection(),
    modelLock: modelLock(),
    modelRequest: request(text),
    assistantMessageId: "019f7d00-0000-7000-8000-000000000005",
    deadlineAt: "2026-08-04T09:00:00.000Z",
    externalTarget: "core:desktop-scripted-model",
    dataCategories: ["user_text", "tool_schema"],
    dataScopeDigest: digest("b"),
    admission: {
      type: "user_confirmed" as const,
      confirmationId: "019f7d00-0000-7000-8000-000000000006",
      scopeDigest: digest("b"),
      confirmationDigest: digest("c"),
    },
  };
}

function toolResultRequest(outcome: "succeeded" | "failed" = "succeeded"): ModelRequest {
  const resultDigest = digest("1");
  const { requestDigest: _requestDigest, ...base } = request("Read sample.pdf");
  const material = {
    ...base,
    messages: [
      ...request("Read sample.pdf").messages,
      {
        schemaVersion: MODEL_PROTOCOL_VERSION,
        role: "tool" as const,
        toolCallId: "019f7d00-0000-7000-8000-000000000201",
        taskId: "019f7d00-0000-7000-8000-000000000202",
        actionId: "019f7d00-0000-7000-8000-000000000203",
        observationId: "019f7d00-0000-7000-8000-000000000204",
        outcome,
        resultDigest,
        content: [{ type: "text" as const, text: "DTP-3B provider preview" }],
      },
    ],
    artifacts: [{
      type: "tool_result" as const,
      toolCallId: "019f7d00-0000-7000-8000-000000000201",
      taskId: "019f7d00-0000-7000-8000-000000000202",
      actionId: "019f7d00-0000-7000-8000-000000000203",
      observationId: "019f7d00-0000-7000-8000-000000000204",
      resultDigest,
      originalBytes: 24,
      previewBytes: 24,
      truncated: false,
    }],
  };
  return {
    ...material,
    requestDigest: sha256CanonicalJson(material),
  };
}

function runtimeSelection() {
  return {
    schemaVersion: "v1alpha1" as const,
    runtimeSelectionId: "019f7d00-0000-7000-8000-000000000301",
    taskId: "019f7d00-0000-7000-8000-000000000001",
    registryRevision: digest("2"),
    selectionDigest: digest("3"),
    agent: {
      agentDefinitionId: "agent.general",
      revision: digest("4"),
      digest: digest("5"),
    },
    resolvedModelLock: {
      capabilityId: "model.desktop-scripted",
      lockId: "019f7d00-0000-7000-8000-000000000302",
      lockDigest: digest("6"),
    },
    toolLocks: [],
    skillLocks: [],
    knowledgeLocks: [],
    createdAt: "2026-08-04T08:00:00.000Z",
  };
}

function modelLock() {
  return {
    schemaVersion: "v1alpha1" as const,
    lockId: "019f7d00-0000-7000-8000-000000000302",
    taskId: "019f7d00-0000-7000-8000-000000000001",
    registryRevision: digest("2"),
    definitionSnapshot: {
      schemaVersion: "v1alpha1" as const,
      capabilityId: "model.desktop-scripted",
      kind: "model" as const,
      name: "Desktop Scripted Model",
      description: "Scripted",
      source: {
        trust: "official" as const,
        packageId: "test",
        packageRevision: digest("7"),
      },
      revision: digest("8"),
      model: {
        family: "scripted",
        inputModalities: ["text"],
        outputModalities: ["text"],
        supportsStreaming: true,
      },
    },
    bindingSnapshot: {
      schemaVersion: "v1alpha1" as const,
      bindingId: "binding.model.desktop-scripted",
      capability: {
        capabilityId: "model.desktop-scripted",
        capabilityRevision: digest("8"),
      },
      adapterDescriptor: {
        adapterDescriptorId: "adapter.model.desktop-scripted",
        adapterDescriptorRevision: digest("a"),
      },
      port: "model_provider" as const,
      source: {
        trust: "official" as const,
        packageId: "test",
        packageRevision: digest("7"),
      },
      revision: digest("9"),
    },
    adapterDescriptorSnapshot: {
      schemaVersion: "v1alpha1" as const,
      adapterDescriptorId: "adapter.model.desktop-scripted",
      adapterKind: "model_provider" as const,
      source: {
        trust: "official" as const,
        packageId: "test",
        packageRevision: digest("7"),
      },
      implementationRef: "core:desktop-scripted-model",
      runtimeBoundary: "in_process" as const,
      protocol: { name: "robothree-model", version: "v1alpha1" },
      revision: digest("a"),
    },
    lockedAt: "2026-08-04T08:00:00.000Z",
  };
}
