import process from "node:process";

const mode = process.argv[2];
let calls = 0;

process.on("message", (message) => {
  if (message?.type !== "summarize") return;
  calls += 1;
  if (mode === "accepted_without_output" && calls === 1) {
    process.send?.({
      type: "response",
      requestId: message.requestId,
      error: { code: "model_stream_resume_unavailable", outputStarted: false },
    });
    return;
  }
  if (mode === "partial_output_unreplayable" || mode === "full_output_unreplayable") {
    process.send?.({
      type: "response",
      requestId: message.requestId,
      error: { code: "model_stream_resume_unavailable", outputStarted: true },
    });
    return;
  }
  process.send?.({
    type: "response",
    requestId: message.requestId,
    summary: {
      summary: "Recovered summary from the same controlled logical invocation.",
      summarySchemaVersion: "v1alpha1",
      summarizerModelRef: "model.arh23-process-provider",
      summarizerPromptRevision: `sha256:${"6".repeat(64)}`,
      estimatedTokensBefore: 480,
      estimatedTokensAfter: 44,
    },
  });
});

process.send?.({ type: "ready" });
