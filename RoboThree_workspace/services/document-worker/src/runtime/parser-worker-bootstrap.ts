import { parentPort, workerData } from "node:worker_threads";

import { computeErrorDigest } from "../common/index.js";
import { parseStrictDocumentCapabilityOptions } from "../handlers/document-capability-options.js";
import { readDocx } from "../docx/docx-read.js";
import { extractPdfTables } from "../pdf/pdf-extract-tables.js";
import { extractPdfText } from "../pdf/pdf-extract-text.js";
import { readXlsx } from "../xlsx/xlsx-read.js";
import { DocumentCapabilityHandlerError } from "./document-capability-handler.js";
import {
  installParserWorkerFetchGuard,
  installParserWorkerModuleGuard,
  installParserWorkerStdioGuard,
} from "./parser-worker-guard.js";

import type {
  DocumentWorkerLimits,
  DocumentWorkerErrorCode,
  DocumentWorkerResultMetadata,
} from "../protocol/index.js";

type ParserWorkerData = Readonly<{
  attemptKey: string;
  capabilityId: string;
  options: Record<string, unknown>;
  limits: DocumentWorkerLimits;
  extension: string;
  bytes: Uint8Array;
  byteLength: number;
}>;

type ParserWorkerMessage =
  | Readonly<{
      type: "result";
      attemptKey: string;
      result: {
        output: unknown;
        metadata: DocumentWorkerResultMetadata;
      };
    }>
  | Readonly<{
      type: "error";
      attemptKey: string;
      error: {
        code: DocumentWorkerErrorCode;
        message: string;
        digest?: string;
        detailCode?: string;
      };
    }>;

if (parentPort === null) {
  throw new Error("Parser worker requires a parentPort");
}

installParserWorkerModuleGuard();
installParserWorkerFetchGuard();
installParserWorkerStdioGuard();

void runParserWorker();

function parseWorkerData(value: unknown): ParserWorkerData {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Parser worker data must be an object");
  }
  const obj = value as Record<string, unknown>;
  if (
    typeof obj.attemptKey !== "string" ||
    obj.attemptKey.length === 0 ||
    typeof obj.capabilityId !== "string" ||
    obj.capabilityId.length === 0 ||
    typeof obj.options !== "object" ||
    obj.options === null ||
    Array.isArray(obj.options) ||
    !isLimits(obj.limits) ||
    typeof obj.extension !== "string" ||
    !(obj.bytes instanceof Uint8Array) ||
    typeof obj.byteLength !== "number" ||
    !Number.isSafeInteger(obj.byteLength) ||
    obj.byteLength < 0
  ) {
    throw new Error("Parser worker data has invalid fields");
  }

  return {
    attemptKey: obj.attemptKey,
    capabilityId: obj.capabilityId,
    options: obj.options as Record<string, unknown>,
    limits: obj.limits,
    extension: obj.extension,
    bytes: obj.bytes,
    byteLength: obj.byteLength,
  };
}

async function runParserWorker(): Promise<void> {
  try {
    const data = parseWorkerData(workerData);
    if (data.bytes.byteLength !== data.byteLength) {
      postError(
        data.attemptKey,
        "internal_failure",
        "Parser worker received malformed bytes",
      );
      return;
    }

    if (data.capabilityId === "tool.document.pdf.extract_text") {
      const options = parseStrictDocumentCapabilityOptions(
        data.capabilityId,
        data.options,
      );
      const result = await extractPdfText({
        bytes: data.bytes,
        extension: data.extension,
        limits: data.limits,
        options,
      });
      const terminal: ParserWorkerMessage = {
        type: "result",
        attemptKey: data.attemptKey,
        result,
      };
      parentPort!.postMessage(terminal);
      return;
    }

    if (data.capabilityId === "tool.document.pdf.extract_tables") {
      const options = parseStrictDocumentCapabilityOptions(
        data.capabilityId,
        data.options,
      );
      const result = await extractPdfTables({
        bytes: data.bytes,
        extension: data.extension,
        limits: data.limits,
        options,
      });
      const terminal: ParserWorkerMessage = {
        type: "result",
        attemptKey: data.attemptKey,
        result,
      };
      parentPort!.postMessage(terminal);
      return;
    }

    if (data.capabilityId === "tool.document.xlsx.read") {
      const options = parseStrictDocumentCapabilityOptions(
        data.capabilityId,
        data.options,
      );
      const result = await readXlsx({
        bytes: data.bytes,
        extension: data.extension,
        limits: data.limits,
        options,
      });
      const terminal: ParserWorkerMessage = {
        type: "result",
        attemptKey: data.attemptKey,
        result,
      };
      parentPort!.postMessage(terminal);
      return;
    }

    if (data.capabilityId === "tool.document.docx.read") {
      const options = parseStrictDocumentCapabilityOptions(
        data.capabilityId,
        data.options,
      );
      const result = await readDocx({
        bytes: data.bytes,
        extension: data.extension,
        limits: data.limits,
        options,
      });
      const terminal: ParserWorkerMessage = {
        type: "result",
        attemptKey: data.attemptKey,
        result,
      };
      parentPort!.postMessage(terminal);
      return;
    }

    parseStrictDocumentCapabilityOptions(data.capabilityId, data.options);

    postError(
      data.attemptKey,
      "unsupported_feature",
      `Tool ${data.capabilityId} is not yet implemented (DTP-1C.1)`,
    );
  } catch (error) {
    if (error instanceof DocumentCapabilityHandlerError) {
      postError(
        attemptKeyFromWorkerData(workerData),
        error.code,
        error.message,
        error.digest,
        error.detailCode,
      );
      return;
    }
    const message = error instanceof Error ? error.message : "Invalid parser worker input";
    postError(attemptKeyFromWorkerData(workerData), "internal_failure", message);
  }
}

function postError(
  attemptKey: string,
  code: DocumentWorkerErrorCode,
  message: string,
  digest?: string,
  detailCode?: string,
): void {
  const terminal: ParserWorkerMessage = {
    type: "error",
    attemptKey,
    error: {
      code,
      message,
      digest: digest ?? computeErrorDigest(code, message),
      ...(detailCode === undefined ? {} : { detailCode }),
    },
  };
  parentPort!.postMessage(terminal);
}

function attemptKeyFromWorkerData(value: unknown): string {
  return typeof value === "object" &&
    value !== null &&
    "attemptKey" in value &&
    typeof (value as { attemptKey?: unknown }).attemptKey === "string"
    ? (value as { attemptKey: string }).attemptKey
    : "unknown";
}

function isLimits(value: unknown): value is DocumentWorkerLimits {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    isPositiveSafeInteger(obj.maxFileBytes) &&
    isPositiveSafeInteger(obj.maxOutputBytes) &&
    isPositiveSafeInteger(obj.maxPageCount) &&
    isPositiveSafeInteger(obj.maxDecompressionRatio)
  );
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
