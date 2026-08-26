import process from "node:process";

const taskId = "019f8d20-0000-7000-8000-000000000002";

process.on("message", (message) => {
  if (message?.type === "shutdown") {
    process.exitCode = 0;
    process.disconnect();
    return;
  }
  if (message?.type !== "stream" || !Number.isInteger(message.round)) return;
  if (message.purpose === "compaction_summary") {
    process.send?.({
      type: "stream_result",
      requestId: message.requestId,
      events: [
        { type: "started" },
        { type: "text_delta", delta: "Closed Tool cycles completed in exact ordinal order." },
        { type: "completed", finishReason: "stop" },
      ],
    });
    return;
  }
  const round = message.round;
  const events = round <= 50
    ? [
      { type: "started" },
      {
        type: "tool_call",
        call: {
          toolCallId: uuid(4_000 + (round - 1) * 2),
          taskId,
          actionId: uuid(4_001 + (round - 1) * 2),
          capabilityId: "tool.echo",
          arguments: {
            ordinal: round - 1,
            boundedPayload: "x".repeat(160),
          },
        },
      },
      { type: "completed", finishReason: "tool_calls" },
    ]
    : [
      { type: "started" },
      { type: "text_delta", delta: "bounded-complete" },
      { type: "completed", finishReason: "stop" },
    ];
  process.send?.({ type: "stream_result", requestId: message.requestId, events });
});

process.send?.({ type: "ready" });

function uuid(value) {
  return `019f8d20-0000-7000-8000-${String(value).padStart(12, "0")}`;
}
