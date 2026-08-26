import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";

import {
  PersonalCredentialBrokerServer,
} from "../services/core/dist/adapters/credential/personal-credential-broker-server.js";

const scenario = process.env.ROBOTHREE_STRM23_SCENARIO ?? "unknown";
let server;
let starting = false;
let shuttingDown = false;
let runtimeInstanceId;

process.on("message", (message) => {
  void handleMessage(message);
});
process.once("SIGTERM", () => void shutdown(0));
process.once("SIGINT", () => void shutdown(0));
process.once("disconnect", () => void shutdown(0));

async function handleMessage(message) {
  if (message?.type === "desktop.core.shutdown") {
    await shutdown(0);
    return;
  }
  if (message?.type === "strm23.resource_snapshot") {
    process.send?.({
      type: "strm23.core_resources",
      scenario,
      snapshot: server?.resourceSnapshot() ?? { inflight: 0, mutations: 0, closed: true },
    });
    return;
  }
  if (message?.type !== "desktop.core.boot" || server !== undefined || starting) return;
  starting = true;
  try {
    runtimeInstanceId = randomUUID();
    const request = createReadStream("/dev/null", { fd: 4, autoClose: false });
    const response = createWriteStream("/dev/null", { fd: 5, autoClose: false });
    server = new PersonalCredentialBrokerServer({
      request,
      response,
      channelInstanceId: message.sensitiveChannelInstanceId,
      clientInstanceId: message.clientInstanceId,
      handler: controlledHandler,
    });
    server.start();
    process.send?.({
      type: "desktop.core.ready",
      host: "127.0.0.1",
      port: 1,
      runtimeInstanceId,
      coreVersion: "0.0.0-strm.2.3-fixture",
    });
  } catch {
    process.send?.({ type: "desktop.core.failed", reason: "controlled_core_start_failed" });
    await shutdown(1);
  } finally {
    starting = false;
  }
}

async function controlledHandler(header) {
  process.send?.({
    type: "strm23.broker_request",
    scenario,
    direction: header.commandType === "reveal" ? "reveal" : "mutation",
  });
  if (scenario === "s6_mutation"
    || scenario === "s6_reveal"
    || scenario === "s8_core_restart") {
    process.send?.({
      type: "strm23.core_barrier",
      scenario,
      window: scenario.startsWith("s6_") ? "S6" : "S8",
      direction: header.commandType === "reveal" ? "reveal" : "mutation",
      phase: "after_broker_dispatch_before_result",
      brokerInflightCount: server?.resourceSnapshot().inflight ?? 0,
    });
    return new Promise(() => undefined);
  }
  if (header.commandType === "reveal") {
    return {
      status: "completed",
      secret: Uint8Array.from([83, 84, 82, 77, 50, 51]),
    };
  }
  return { status: "completed" };
}

async function shutdown(exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;
  server?.close();
  server = undefined;
  runtimeInstanceId = undefined;
  process.exit(exitCode);
}
