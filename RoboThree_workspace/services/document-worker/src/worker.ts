import {
  NdjsonFrameDecoder,
  encodeDocumentWorkerMessage,
  parseDocumentWorkerInvoke,
  parseDocumentWorkerTextWriteInspect,
  createDocumentWorkerTextWritePostconditionMessage,
  createErrorMessage,
  createReadyMessage,
} from "./protocol/index.js";
import { DocumentWorkerRuntime } from "./runtime/index.js";
import {
  logLifecycle,
  logError,
  computeErrorDigest,
} from "./common/index.js";
import { DocumentCapabilityRouter } from "./handlers/index.js";
import {
  computeTextFileWriteRequestDigest,
  createRecoveredTextFileWriteResult,
  inspectTextFileWritePostcondition,
  normalizeTextFileWriteRequest,
} from "./text/index.js";
import { DocumentCapabilityHandlerError } from "./runtime/index.js";

import type { DocumentWorkerProtocolMessage } from "./protocol/index.js";

const MAX_FRAME_BYTES = 1024 * 1024;
const decoder = new NdjsonFrameDecoder(MAX_FRAME_BYTES);
const runtime = new DocumentWorkerRuntime(new DocumentCapabilityRouter());
const pendingTerminals = new Set<Promise<void>>();
let stdinClosed = false;
let exitScheduled = false;

logLifecycle("worker.startup");

process.stdout.write(encodeDocumentWorkerMessage(createReadyMessage()));
logLifecycle("worker.ready_sent");

process.stdin.on("data", (chunk: Buffer) => {
  try {
    for (const frame of decoder.push(chunk)) {
      handleFrame(frame);
    }
  } catch (error) {
    handleFatalError("Frame decode error", error);
  }
});

process.stdin.on("end", () => {
  stdinClosed = true;
  try {
    decoder.finish();
  } catch {
    // Incomplete frame at stream end is logged by the host side as protocol loss.
  }

  logLifecycle("worker.stdin_closed");
  scheduleExitWhenIdle();
});

process.on("SIGTERM", () => {
  logLifecycle("worker.sigterm_received");
  cleanup();
  process.exit(0);
});

process.on("SIGINT", () => {
  logLifecycle("worker.sigint_received");
  cleanup();
  process.exit(0);
});

process.on("exit", (code) => {
  logLifecycle("worker.exit", { status: String(code) });
});

function handleFrame(frame: string): void {
  let terminalPromise: Promise<DocumentWorkerProtocolMessage>;
  try {
    const envelope = JSON.parse(frame) as { type?: unknown };
    terminalPromise = envelope.type === "inspect_text_write_postcondition"
      ? inspectTextWrite(frame)
      : runtime.invoke(parseDocumentWorkerInvoke(frame));
  } catch {
    logError(
      "internal_failure",
      computeErrorDigest("internal_failure", "malformed_invoke"),
      {},
    );
    return;
  }

  const writePromise = terminalPromise.then((terminal) => {
    process.stdout.write(encodeDocumentWorkerMessage(terminal));
  }).finally(() => {
    pendingTerminals.delete(writePromise);
    scheduleExitWhenIdle();
  });
  pendingTerminals.add(writePromise);
}

async function inspectTextWrite(frame: string): Promise<DocumentWorkerProtocolMessage> {
  const request = parseDocumentWorkerTextWriteInspect(frame);
  if (runtime.snapshot().active || pendingTerminals.size > 0) {
    return createErrorMessage(
      request.requestId,
      request.actionId,
      request.effectAttemptId,
      "worker_busy",
      "Document Worker is already processing another request",
      undefined,
      undefined,
      request.protocolVersion,
    );
  }
  try {
    const normalized = normalizeTextFileWriteRequest(
      request.relativePath,
      request.options,
      request.limits,
    );
    const expectedDigest = computeTextFileWriteRequestDigest({
      idempotencyKey: request.idempotencyKey,
      workspaceGrantId: normalized.options.workspaceGrantId,
      relativePath: normalized.relativePath,
      mode: normalized.options.mode,
      contentSha256: normalized.contentSha256,
      ...(normalized.options.expectedPreviousSha256 === undefined
        ? {}
        : { expectedPreviousSha256: normalized.options.expectedPreviousSha256 }),
      ...(normalized.options.ownedArtifactProofDigest === undefined
        ? {}
        : { ownedArtifactProofDigest: normalized.options.ownedArtifactProofDigest }),
      limitsRevision: normalized.options.limitsRevision,
    });
    if (expectedDigest !== request.requestDigest) {
      throw new DocumentCapabilityHandlerError(
        "invalid_format",
        "Text write request digest mismatch",
        undefined,
        "invalid_arguments",
      );
    }
    const startedAt = Date.now();
    const postcondition = await inspectTextFileWritePostcondition({
      workspaceRoot: request.workspaceRoot,
      relativePath: request.relativePath,
      options: request.options,
      limits: request.limits,
    });
    const recovered = postcondition.decision === "recovered_success"
      ? createRecoveredTextFileWriteResult({
        relativePath: request.relativePath,
        options: request.options,
        limits: request.limits,
        postcondition,
        timingMs: Date.now() - startedAt,
      })
      : undefined;
    return createDocumentWorkerTextWritePostconditionMessage({
      request,
      decision: postcondition.decision,
      ...(recovered === undefined ? {} : recovered),
    });
  } catch (error) {
    const normalized = error instanceof DocumentCapabilityHandlerError
      ? error
      : new DocumentCapabilityHandlerError(
        "internal_failure",
        "Text write postcondition inspection failed",
        undefined,
        "recovery_uncertain",
      );
    return createErrorMessage(
      request.requestId,
      request.actionId,
      request.effectAttemptId,
      normalized.code,
      normalized.message,
      normalized.digest,
      normalized.detailCode,
      request.protocolVersion,
    );
  }
}

function scheduleExitWhenIdle(): void {
  if (!stdinClosed || exitScheduled || runtime.snapshot().active) {
    return;
  }
  if (pendingTerminals.size > 0) {
    return;
  }

  exitScheduled = true;
  setTimeout(() => {
    cleanup();
    process.exit(0);
  }, 50);
}

function handleFatalError(context: string, error: unknown): void {
  const message = error instanceof Error ? error.message : "Unknown error";
  logError(
    "internal_failure",
    computeErrorDigest("internal_failure", `${context}: ${message}`),
    {},
  );
  cleanup();
  process.exitCode = 2;
}

function cleanup(): void {
  runtime.cleanup();
  logLifecycle("worker.cleanup_complete");
}
