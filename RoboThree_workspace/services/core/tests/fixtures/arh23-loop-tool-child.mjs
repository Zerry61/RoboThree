import process from "node:process";

process.on("message", (message) => {
  if (message?.type === "shutdown") {
    process.exitCode = 0;
    process.disconnect();
    return;
  }
  if (message?.type !== "execute") return;
  process.send?.({
    type: "tool_result",
    requestId: message.requestId,
    output: message.arguments,
  });
});

process.send?.({ type: "ready" });
