import {
  NdjsonFrameDecoder,
  encodeDocumentWorkerMessage,
  parseDocumentWorkerInvoke,
  createReadyMessage,
} from "./protocol/index.js";
import { DocumentWorkerRuntime } from "./runtime/index.js";
import {
  logLifecycle,
  logError,
  computeErrorDigest,
} from "./common/index.js";
import { DocumentCapabilityRouter } from "./handlers/index.js";

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
    terminalPromise = runtime.invoke(parseDocumentWorkerInvoke(frame));
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
