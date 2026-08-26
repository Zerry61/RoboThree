import { randomUUID } from "node:crypto";

import {
  PROCESS_ECHO_PROTOCOL_VERSION,
  encodeProcessEchoMessage,
  parseProcessEchoInvoke,
  type ProcessEchoObservationMessage,
  type ProcessEchoReadyMessage,
} from "./process-echo-protocol.js";
import { NdjsonFrameDecoder } from "./ndjson-frame-decoder.js";

const MAX_FRAME_BYTES = 64 * 1024;
const diagnosticScenario = process.argv.find((value) => value.startsWith("--diagnostic="))?.slice(13) ?? "normal";
const decoder = new NdjsonFrameDecoder(MAX_FRAME_BYTES);

const ready: ProcessEchoReadyMessage = {
  type: "ready",
  protocolVersion: PROCESS_ECHO_PROTOCOL_VERSION,
  adapter: "process-echo",
};

if (diagnosticScenario === "protocol_mismatch") {
  process.stdout.write(`${JSON.stringify({ ...ready, protocolVersion: "unsupported" })}\n`);
} else {
  process.stdout.write(encodeProcessEchoMessage(ready));
}

process.stdin.on("data", (chunk: Buffer) => {
  try {
    for (const frame of decoder.push(chunk)) {
      handleInvoke(frame);
    }
  } catch (error) {
    process.stderr.write(safeError(error));
    process.exitCode = 2;
  }
});

process.stdin.on("end", () => {
  try {
    decoder.finish();
  } catch (error) {
    process.stderr.write(safeError(error));
    process.exitCode = 2;
  }
});

function handleInvoke(frame: string): void {
  const request = parseProcessEchoInvoke(frame);
  if (diagnosticScenario === "crash_after_request") {
    process.exit(17);
  }
  if (diagnosticScenario === "hang_after_request") {
    return;
  }
  if (diagnosticScenario === "malformed_observation") {
    process.stdout.write("{malformed-json\n");
    return;
  }
  if (diagnosticScenario === "stderr_flood") {
    process.stderr.write("diagnostic".repeat(4096));
  }
  const response: ProcessEchoObservationMessage = {
    type: "observation",
    protocolVersion: PROCESS_ECHO_PROTOCOL_VERSION,
    requestId: diagnosticScenario === "wrong_request_id" ? randomUUID() : request.requestId,
    effectAttemptId: request.effectAttemptId,
    observation: {
      observationId: randomUUID(),
      actionId: request.action.actionId,
      observedAt: new Date().toISOString(),
      outcome: "succeeded",
      output: request.action.payload,
    },
  };
  const encoded = encodeProcessEchoMessage(response);
  if (diagnosticScenario === "split_observation") {
    const splitAt = Math.max(1, Math.floor(encoded.length / 2));
    process.stdout.write(encoded.subarray(0, splitAt));
    setImmediate(() => process.stdout.write(encoded.subarray(splitAt)));
    return;
  }
  process.stdout.write(encoded);
}

function safeError(error: unknown): string {
  return `${error instanceof Error ? error.message : "invalid process echo request"}\n`;
}
