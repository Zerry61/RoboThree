import { createHash } from "node:crypto";

import {
  ModelRequestSchema,
  ModelStreamEventSchema,
  type AssistantToolCall,
  type JsonObject,
  type ModelRequest,
  type ModelStreamEvent,
} from "@robothree/contracts";

import { calculateModelRequestDigest } from "../../application/model-message-converter.js";
import type { ModelProvider } from "../../ports/model-provider.js";
import type { ModelProviderInvocation } from "../../ports/model-provider-invocation.js";

type DocumentCapabilityId =
  | "tool.document.pdf.extract_text"
  | "tool.document.pdf.extract_tables"
  | "tool.document.xlsx.read"
  | "tool.document.docx.read"
  | "tool.document.xlsx.write"
  | "tool.document.pptx.write";

type InferredDocumentTarget = Readonly<{
  capabilityId: DocumentCapabilityId;
  relativePath: string;
  mode?: "overwrite_existing";
}>;

const READ_CAPABILITY_BY_EXTENSION: Record<string, DocumentCapabilityId> = {
  ".pdf": "tool.document.pdf.extract_text",
  ".xlsx": "tool.document.xlsx.read",
  ".docx": "tool.document.docx.read",
};

export class DesktopDocumentScriptedModelProvider implements ModelProvider {
  readonly adapterKind = "model_provider" as const;
  readonly adapterDescriptorId: string;
  readonly adapterDescriptorRevision: string;
  readonly requests: ModelRequest[] = [];

  constructor(input: {
    adapterDescriptorId: string;
    adapterDescriptorRevision: string;
  }) {
    this.adapterDescriptorId = input.adapterDescriptorId;
    this.adapterDescriptorRevision = input.adapterDescriptorRevision;
  }

  async *stream(
    request: ModelRequest,
    signal: AbortSignal,
    invocation?: ModelProviderInvocation,
  ): AsyncIterable<ModelStreamEvent> {
    const parsed = ModelRequestSchema.parse(request);
    if (calculateModelRequestDigest(parsed) !== parsed.requestDigest) {
      throw new Error("ModelRequest digest does not match its canonical content");
    }
    this.requests.push(structuredClone(parsed));
    for (const event of this.#events(parsed, invocation)) {
      if (signal.aborted) return;
      yield ModelStreamEventSchema.parse(event);
      await Promise.resolve();
    }
  }

  #events(
    request: ModelRequest,
    invocation?: ModelProviderInvocation,
  ): readonly ModelStreamEvent[] {
    const toolResult = request.messages.findLast((message) => message.role === "tool");
    if (toolResult !== undefined) {
      const preview = toolResult.content.map((part) => part.text).join("\n").trim();
      return [
        { type: "started" },
        {
          type: "text_delta",
          delta: documentResultText(preview, toolResult.outcome),
        },
        { type: "completed", finishReason: "stop" },
      ];
    }
    const target = inferDocumentTarget(request);
    if (target === undefined || invocation === undefined) {
      return [
        { type: "started" },
        { type: "text_delta", delta: "RoboThree Desktop scripted response." },
        { type: "completed", finishReason: "stop" },
      ];
    }
    const call: AssistantToolCall = {
      toolCallId: stableUuid(request.requestId, `tool-call:${target.relativePath}`),
      taskId: invocation.taskId,
      actionId: stableUuid(request.requestId, `tool-action:${target.relativePath}`),
      capabilityId: target.capabilityId,
      arguments: {
        relativePath: target.relativePath,
        ...(target.capabilityId === "tool.document.xlsx.write"
          ? {
            workbook: scriptedWorkbook(target.relativePath),
            ...(target.mode === undefined ? {} : { mode: target.mode }),
          }
          : {}),
        ...(target.capabilityId === "tool.document.pptx.write"
          ? { presentation: scriptedPresentation(target.relativePath) }
          : {}),
        options: {},
      },
    };
    return [
      { type: "started" },
      { type: "tool_call", call },
      { type: "completed", finishReason: "tool_calls" },
    ];
  }
}

function inferDocumentTarget(
  request: ModelRequest,
): InferredDocumentTarget | undefined {
  const available = new Set(request.tools.map((tool) => tool.capabilityId));
  const text = request.messages
    .filter((message) => message.role === "user")
    .flatMap((message) => message.content.map((part) => part.text))
    .join("\n");
  const matches = text.match(/[A-Za-z0-9._/-]+\.(?:pdf|xlsx|docx|pptx)/giu);
  const relativePath = matches?.at(-1)?.trim().replace(/^\/+/u, "");
  if (relativePath === undefined || relativePath.length === 0) return undefined;
  const lower = relativePath.toLowerCase();
  if (lower.endsWith(".pdf") && isTableIntent(text)) {
    const capabilityId = "tool.document.pdf.extract_tables";
    return available.has(capabilityId) ? { capabilityId, relativePath } : undefined;
  }
  if (lower.endsWith(".xlsx") && isWriteIntent(text)) {
    const capabilityId = "tool.document.xlsx.write";
    return available.has(capabilityId)
      ? {
        capabilityId,
        relativePath,
        ...(isOverwriteIntent(text) ? { mode: "overwrite_existing" as const } : {}),
      }
      : undefined;
  }
  if (lower.endsWith(".pptx") && isWriteIntent(text)) {
    const capabilityId = "tool.document.pptx.write";
    return available.has(capabilityId) ? { capabilityId, relativePath } : undefined;
  }
  const extension = Object.keys(READ_CAPABILITY_BY_EXTENSION).find((candidate) =>
    lower.endsWith(candidate));
  if (extension === undefined) return undefined;
  const capabilityId = READ_CAPABILITY_BY_EXTENSION[extension]!;
  if (!available.has(capabilityId)) return undefined;
  return { capabilityId, relativePath };
}

function isWriteIntent(text: string): boolean {
  return isOverwriteIntent(text)
    || /\b(?:create|write|new|generate|save)\b/iu.test(text)
    || /(?:创建|新建|写入|生成|保存)/u.test(text);
}

function isTableIntent(text: string): boolean {
  return /\b(?:table|tables|tabular)\b/iu.test(text)
    || /(?:表格|表|提取表格|抽取表格)/u.test(text);
}

function isOverwriteIntent(text: string): boolean {
  return /\b(?:overwrite|replace)\b/iu.test(text)
    || /(?:覆盖|替换)/u.test(text);
}

function scriptedWorkbook(relativePath: string): JsonObject {
  return {
    sheets: [{
      name: "Report",
      rows: [
        {
          rowNumber: 1,
          cells: [
            { column: "A", type: "string", value: "Generated by RoboThree" },
            { column: "B", type: "string", value: relativePath },
          ],
        },
        {
          rowNumber: 2,
          cells: [
            { column: "A", type: "string", value: "=SUM(A1:A2)" },
            { column: "B", type: "number", value: 42 },
          ],
        },
      ],
    }],
  };
}

function scriptedPresentation(relativePath: string): JsonObject {
  return {
    title: "RoboThree Generated Deck",
    layout: "wide",
    templateRef: "robothree.default",
    slides: [
      {
        title: "RoboThree PPTX",
        elements: [
          {
            type: "text",
            text: "Generated by RoboThree",
            x: 0.7,
            y: 1,
            w: 5.8,
            h: 0.7,
            style: { fontSize: 24, bold: true, color: "111827" },
          },
          {
            type: "table",
            rows: [["File", relativePath], ["Status", "Created"]],
            x: 0.7,
            y: 2,
            w: 6.2,
            h: 1.2,
          },
        ],
      },
      {
        title: "Summary",
        elements: [
          {
            type: "chart",
            chartType: "bar",
            labels: ["Plan", "Build"],
            series: [{ name: "Progress", values: [1, 2] }],
            x: 0.8,
            y: 1.3,
            w: 5.8,
            h: 3,
          },
          {
            type: "shape",
            shapeType: "rect",
            x: 7.1,
            y: 1.3,
            w: 2.4,
            h: 1,
            fillColor: "E5E7EB",
            lineColor: "6B7280",
          },
        ],
      },
    ],
  };
}

function documentResultText(
  preview: string,
  outcome: ModelRequest["messages"][number] extends infer Message
    ? Message extends { role: "tool"; outcome: infer Outcome } ? Outcome : never
    : never,
): string {
  const bounded = preview.length > 1_200 ? `${preview.slice(0, 1_197)}...` : preview;
  if (outcome !== "succeeded") {
    return bounded.length === 0
      ? "Document tool failed with no preview content."
      : `Document tool failed.\n\n${bounded}`;
  }
  return bounded.length === 0
    ? "Document tool completed with no preview content."
    : `Document tool completed.\n\n${bounded}`;
}

function stableUuid(identity: string, label: string): string {
  const bytes = createHash("sha256")
    .update(`${identity}:${label}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
