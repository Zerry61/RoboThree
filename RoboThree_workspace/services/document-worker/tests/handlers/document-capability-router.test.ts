import { describe, expect, it } from "vitest";
import {
  DocumentCapabilityRouter,
} from "../../src/index.js";

import type {
  DocumentCapabilityHandlerError,
  DocumentCapabilityRequest,
  DocumentCapabilityResult,
  ParserExecutionRequest,
} from "../../src/index.js";

function request(overrides: {
  capabilityId?: string;
  options?: Record<string, unknown>;
  protocolVersion?: "v1alpha1" | "v1alpha2";
  signal?: AbortSignal;
} = {}): DocumentCapabilityRequest {
  return {
    invoke: {
      type: "invoke",
      protocolVersion: overrides.protocolVersion ?? "v1alpha1",
      requestId: "req",
      actionId: "act",
      effectAttemptId: "eff",
      capabilityId: overrides.capabilityId ?? "tool.document.pdf.extract_text",
      workspaceRoot: "/workspace",
      relativePath: "sample.pdf",
      options: overrides.options ?? {},
      limits: {
        maxFileBytes: 1024,
        maxOutputBytes: 1024,
        maxPageCount: 1,
        maxDecompressionRatio: 10,
      },
      deadlineAt: "2026-08-03T00:00:00.000Z",
    },
    signal: overrides.signal ?? new AbortController().signal,
  };
}

function parserResult(): DocumentCapabilityResult {
  return {
    output: { ok: true },
    metadata: {
      originalCount: 1,
      returnedCount: 1,
      truncated: false,
      resultDigest: "sha256:router",
      timingMs: 0,
    },
  };
}

describe("DocumentCapabilityRouter", () => {
  it("routes exact document capabilities through source and parser boundary", async () => {
    let parserRequest: ParserExecutionRequest | null = null;
    const router = new DocumentCapabilityRouter({
      source: {
        resolvePath: async () => "/workspace/sample.pdf",
        statFile: async () => ({
          size: 4,
          dev: 1,
          ino: 2,
          isFile: () => true,
        }) as never,
        realpathFile: async () => "/workspace/sample.pdf",
        openFile: async () => ({
          stat: async () => ({
            size: 4,
            dev: 1,
            ino: 2,
            isFile: () => true,
          }) as never,
          read: async (buffer: Uint8Array) => {
            buffer.set([0x25, 0x50, 0x44, 0x46]);
            return { bytesRead: buffer.byteLength, buffer };
          },
          close: async () => {},
        }),
      },
      parserBoundary: {
        execute: async (input) => {
          parserRequest = input;
          return parserResult();
        },
      },
    });

    await expect(router.invoke(request())).resolves.toEqual(parserResult());
    expect(parserRequest).toMatchObject({
      attemptKey: "req:act:eff",
      capabilityId: "tool.document.pdf.extract_text",
      options: {},
    });
    expect(parserRequest?.bytes.byteLength).toBe(4);
  });

  it("requires private protocol for PDF table extraction", async () => {
    let resolved = false;
    const router = new DocumentCapabilityRouter({
      source: {
        resolvePath: async () => {
          resolved = true;
          return "/workspace/sample.pdf";
        },
      },
    });

    await expect(
      router.invoke(request({ capabilityId: "tool.document.pdf.extract_tables" })),
    ).rejects.toMatchObject({
      code: "unsupported_feature",
      detailCode: "private_protocol_required",
    });
    expect(resolved).toBe(false);
  });

  it("routes private PDF table extraction through source and parser boundary", async () => {
    let parserRequest: ParserExecutionRequest | null = null;
    const router = new DocumentCapabilityRouter({
      source: {
        resolvePath: async () => "/workspace/sample.pdf",
        statFile: async () => ({
          size: 4,
          dev: 1,
          ino: 2,
          isFile: () => true,
        }) as never,
        realpathFile: async () => "/workspace/sample.pdf",
        openFile: async () => ({
          stat: async () => ({
            size: 4,
            dev: 1,
            ino: 2,
            isFile: () => true,
          }) as never,
          read: async (buffer: Uint8Array) => {
            buffer.set([0x25, 0x50, 0x44, 0x46]);
            return { bytesRead: buffer.byteLength, buffer };
          },
          close: async () => {},
        }),
      },
      parserBoundary: {
        execute: async (input) => {
          parserRequest = input;
          return parserResult();
        },
      },
    });

    await expect(
      router.invoke(request({
        capabilityId: "tool.document.pdf.extract_tables",
        protocolVersion: "v1alpha2",
        options: {
          includeGeometry: true,
          minConfidence: 0.7,
        },
      })),
    ).resolves.toEqual(parserResult());
    expect(parserRequest).toMatchObject({
      attemptKey: "req:act:eff",
      capabilityId: "tool.document.pdf.extract_tables",
      options: {
        pageStart: 1,
        pageEnd: null,
        maxTables: null,
        maxRows: null,
        maxCells: null,
        maxTextBytes: null,
        includeGeometry: true,
        minConfidence: 0.7,
      },
    });
  });

  it("rejects unknown capabilities before reading files", async () => {
    let resolved = false;
    const router = new DocumentCapabilityRouter({
      source: {
        resolvePath: async () => {
          resolved = true;
          return "/workspace/sample.bin";
        },
      },
    });

    await expect(
      router.invoke(request({ capabilityId: "tool.document.unknown.read" })),
    ).rejects.toMatchObject({
      code: "unsupported_feature",
    });
    expect(resolved).toBe(false);
  });

  it("rejects unknown options before reading files", async () => {
    let resolved = false;
    const router = new DocumentCapabilityRouter({
      source: {
        resolvePath: async () => {
          resolved = true;
          return "/workspace/sample.pdf";
        },
      },
    });

    await expect(
      router.invoke(request({ options: { pages: [1] } })),
    ).rejects.toMatchObject({
      code: "invalid_format",
    } satisfies Partial<DocumentCapabilityHandlerError>);
    expect(resolved).toBe(false);
  });

  it("passes cancellation into secured source and parser boundary", async () => {
    const controller = new AbortController();
    controller.abort();
    const router = new DocumentCapabilityRouter();

    await expect(
      router.invoke(request({ signal: controller.signal })),
    ).rejects.toMatchObject({
      code: "cancelled",
    });
  });
});
