const scenario = process.argv.find((arg) => arg.startsWith("--scenario="))?.slice("--scenario=".length) ?? "normal";

function write(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

if (scenario === "protocol_mismatch") {
  write({ type: "ready", protocolVersion: "v0", adapter: "document-worker" });
} else {
  write({ type: "ready", protocolVersion: "v1alpha2", adapter: "document-worker" });
}

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  input += chunk;
  let index = input.indexOf("\n");
  while (index >= 0) {
    const frame = input.slice(0, index);
    input = input.slice(index + 1);
    handle(frame);
    index = input.indexOf("\n");
  }
});

function handle(frame) {
  let message;
  try {
    message = JSON.parse(frame);
  } catch {
    process.stdout.write("{bad json\n");
    return;
  }

  if (scenario === "stderr_flood") {
    process.stderr.write("x".repeat(8192));
  }
  if (scenario === "hang_after_request") {
    return;
  }
  if (scenario === "crash_after_request") {
    process.exit(3);
  }
  if (scenario === "malformed_result") {
    process.stdout.write("{\"type\":\"result\"\n");
    return;
  }

  const requestId = scenario === "wrong_request_id" ? "wrong-request" : message.requestId;
  if (scenario === "typed_error") {
    write({
      type: "error",
      protocolVersion: "v1alpha2",
      requestId,
      actionId: message.actionId,
      effectAttemptId: message.effectAttemptId,
      error: {
        code: "limit_exceeded",
        message: "controlled test limit",
        digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        detailCode: "input_too_large",
      },
    });
    return;
  }

  write({
    type: "result",
    protocolVersion: "v1alpha2",
    requestId,
    actionId: message.actionId,
    effectAttemptId: message.effectAttemptId,
    status: "succeeded",
    output: {
      format: message.capabilityId.split(".").at(-2) ?? "unknown",
      relativePath: message.relativePath,
    },
    metadata: {
      originalCount: 1,
      returnedCount: 1,
      truncated: false,
      resultDigest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      timingMs: 1,
    },
  });
}
