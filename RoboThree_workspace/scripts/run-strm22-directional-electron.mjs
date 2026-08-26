import { fileURLToPath } from "node:url";
import { setTimeout } from "node:timers";
import electron from "electron";

import {
  PersonalCredentialTransportProductionController,
} from "../apps/desktop/dist/main/personal-credential-transport-controller.js";

const { app, BrowserWindow, ipcMain, MessageChannelMain } = electron;
const scenario = process.env.ROBOTHREE_STRM22_SCENARIO ?? "unknown";
const REQUEST_CHANNEL = "robothree:strm22:request";
const EVIDENCE_CHANNEL = "robothree:strm22:evidence";
const supported = new Set([
  "production_disabled",
  "mutation_completed",
  "reveal_completed",
  "broker_rejected",
]);

if (!supported.has(scenario)) {
  process.stderr.write("STRM-2.2 fixture rejected an unknown scenario\n");
  process.exit(2);
}

void app.whenReady()
  .then(run)
  .then((evidence) => {
    process.stdout.write(`${JSON.stringify(evidence)}\n`);
    app.quit();
  })
  .catch((error) => {
    process.stderr.write(`STRM-2.2 fixture failed: ${safeCode(error)}\n`);
    app.exit(1);
  });

async function run() {
  const preload = fileURLToPath(new URL("./strm22-directional-preload.cjs", import.meta.url));
  const fixturePage = fileURLToPath(new URL("./strm22-directional.html", import.meta.url));
  const broker = new ControlledBroker(scenario);
  const controller = new PersonalCredentialTransportProductionController({
    foundationEnabled: scenario !== "production_disabled",
    createMessageChannel: () => new MessageChannelMain(),
    brokerLeaseProvider: {
      current: () => ({
        runtimeInstanceId: ids.runtime,
        channelInstanceId: ids.channel,
        clientInstanceId: ids.client,
        client: broker,
      }),
    },
  });
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });
  const detach = controller.attachWebContents(window.webContents);
  const observations = [];
  let rejectionCode = "none";
  const onRequest = (event) => {
    try {
      controller.openPreparedCommand(prepared(), event);
    } catch (error) {
      rejectionCode = safeCode(error);
    }
  };
  const onEvidence = (event, input) => {
    if (event.senderFrame === event.sender.mainFrame && typeof input?.code === "string") {
      observations.push({ code: input.code, terminal: input.terminal ?? "none" });
    }
  };
  ipcMain.once(REQUEST_CHANNEL, onRequest);
  ipcMain.on(EVIDENCE_CHANNEL, onEvidence);
  try {
    await window.loadFile(fixturePage);
    if (scenario === "production_disabled") {
      await waitUntil(
        () => rejectionCode === "personal_credential_transport_unavailable",
        2_000,
        "disabled_rejection_missing",
      );
    } else if (scenario === "reveal_completed") {
      await waitUntil(
        () => observations.some((item) => item.code === "reveal_consumed")
          && controller.snapshot().sessionCount === 0,
        2_000,
        "reveal_closure_missing",
      );
    } else {
      await waitUntil(
        () => observations.some((item) => item.code === "terminal")
          && controller.snapshot().sessionCount === 0,
        2_000,
        "mutation_terminal_missing",
      );
    }
    return Object.freeze({
      status: "PASS",
      scenario,
      rejectionCode,
      executeCount: broker.executeCount,
      mutationByteLength: broker.mutationByteLength,
      revealConsumed: observations.some((item) => item.code === "reveal_consumed"),
      terminal: observations.find((item) => item.code === "terminal")?.terminal ?? "none",
      productionFeatureEnabled: false,
      productionBusinessHandlerReady: false,
      productionSensitiveTransportReady: false,
      transportBlockerClosed: false,
      snapshot: controller.snapshot(),
    });
  } finally {
    ipcMain.off(EVIDENCE_CHANNEL, onEvidence);
    detach();
    controller.close();
    if (!window.isDestroyed()) window.destroy();
  }
}

class ControlledBroker {
  channelInstanceId = ids.channel;
  clientInstanceId = ids.client;
  executeCount = 0;
  mutationByteLength = 0;

  constructor(mode) {
    this.mode = mode;
  }

  async execute(command) {
    this.executeCount += 1;
    if (command.secret instanceof Uint8Array) this.mutationByteLength = command.secret.byteLength;
    const rejected = this.mode === "broker_rejected";
    const reveal = command.commandType === "reveal" && !rejected;
    const body = reveal ? Uint8Array.from([81, 82, 83, 84]) : undefined;
    return {
      header: {
        protocolVersion: "personal-credential-broker.v1",
        channelInstanceId: ids.channel,
        commandId: command.commandId,
        transportRequestId: ids.transport,
        status: rejected ? "rejected" : "completed",
        ...(rejected ? { typedErrorCode: "credential_store_unavailable" } : {}),
        secretByteLength: body?.byteLength ?? 0,
      },
      ...(body === undefined ? {} : { secret: body }),
    };
  }
}

const ids = Object.freeze({
  runtime: "019f9d00-0000-4000-8000-000000000001",
  client: "019f9d00-0000-4000-8000-000000000002",
  command: "019f9d00-0000-4000-8000-000000000003",
  correlation: "019f9d00-0000-4000-8000-000000000004",
  channel: "019f9d00-0000-4000-8000-000000000005",
  transport: "019f9d00-0000-4000-8000-000000000006",
});

function prepared() {
  const reveal = scenario === "reveal_completed";
  return {
    schemaVersion: "personal-credential-transport-prepared-command.v1",
    runtimeInstanceId: ids.runtime,
    clientInstanceId: ids.client,
    commandId: ids.command,
    correlationId: ids.correlation,
    operationType: reveal ? "reveal" : "create",
    personalModelId: "model.personal.strm22",
    expectedConfigurationRevision: `sha256:${"a".repeat(64)}`,
    ...(reveal
      ? { expectedExecutionDefinitionDigest: `sha256:${"c".repeat(64)}` }
      : {}),
    requestDigest: `sha256:${"b".repeat(64)}`,
    deadlineAt: new Date(Date.now() + 4_000).toISOString(),
  };
}

async function waitUntil(predicate, timeoutMs, code) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
  }
  throw new Error(code);
}

function safeCode(error) {
  if (typeof error === "object" && error !== null && typeof error.code === "string") {
    return error.code.replaceAll(/[^a-z0-9_.-]/giu, "_").slice(0, 96);
  }
  if (error instanceof Error) {
    return error.message.replaceAll(/[^a-z0-9_.-]/giu, "_").slice(0, 96);
  }
  return "unknown_failure";
}
