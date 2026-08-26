import { ipcRenderer } from "electron";

import {
  PersonalCredentialTransportPreloadReceiver,
  type PersonalCredentialTransportPortOfferEvent,
} from "../apps/desktop/src/preload/personal-credential-transport-receiver.js";

const REQUEST_CHANNEL = "robothree:strm23:request";
const EVENT_CHANNEL = "robothree:strm23:event";
const scenario = process.env.ROBOTHREE_STRM23_SCENARIO ?? "unknown";

const readyOnlyScenarios = new Set([
  "s3_mutation",
  "s8_navigation",
  "s8_reload",
  "s8_renderer_crash",
  "s8_main_close",
]);
const mutationScenarios = new Set([
  "s4_mutation",
  "s5_mutation",
  "s6_mutation",
  "s7_mutation",
]);

let lastCommandId: string | undefined;
const receiver = new PersonalCredentialTransportPreloadReceiver({
  foundationEnabled: true,
  subscribe: (channel, listener) => {
    const wrapped = (event: Electron.IpcRendererEvent, value: unknown): void => {
      if (scenario === "s8_profile_change") {
        acceptWrongProfile(event, value);
        return;
      }
      listener(
        { ports: event.ports as unknown[] } satisfies PersonalCredentialTransportPortOfferEvent,
        value,
      );
      const commandId = readCommandId(value);
      lastCommandId = commandId;
      queueMicrotask(() => {
        if (readyOnlyScenarios.has(scenario)) {
          ipcRenderer.send(EVENT_CHANNEL, {
            type: "barrier",
            phase: "port_ready_secret_not_sent",
            direction: "mutation",
          });
          return;
        }
        if (mutationScenarios.has(scenario) && commandId !== undefined) {
          const caller = Uint8Array.from([83, 84, 82, 77, 50, 51]);
          void receiver.submitMutationSecret(commandId, caller)
            .then((terminal) => {
              ipcRenderer.send(EVENT_CHANNEL, {
                type: "terminal",
                terminal: terminal.terminal,
                typedErrorCode: terminal.typedErrorCode,
                callerZeroized: caller.every((value) => value === 0),
              });
            })
            .catch((error: unknown) => {
              ipcRenderer.send(EVENT_CHANNEL, {
                type: "terminal_error",
                typedErrorCode: safeCode(error),
                callerZeroized: caller.every((value) => value === 0),
              });
            });
        }
      });
    };
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
  revealConsumer: async (secret) => {
    const byteLength = secret.byteLength;
    if (scenario === "s7_reveal") {
      ipcRenderer.send(EVENT_CHANNEL, {
        type: "barrier",
        phase: "reveal_frame_received_before_ack",
        direction: "reveal",
        byteLength,
      });
      return new Promise<void>(() => undefined);
    }
    ipcRenderer.send(EVENT_CHANNEL, {
      type: "reveal_consumed",
      byteLength,
    });
  },
  processDiagnostics: {
    onPhase(input) {
      if (scenario === "s4_mutation" && input.phase === "mutation_frame_posted") {
        ipcRenderer.send(EVENT_CHANNEL, {
          type: "barrier",
          phase: "preload_posted_before_main_receive",
          direction: "mutation",
        });
      }
      if (scenario === "s4_mutation" && input.phase === "receiver_message_rejected") {
        ipcRenderer.send(EVENT_CHANNEL, {
          type: "terminal_error",
          typedErrorCode: input.typedErrorCode,
        });
      }
    },
  },
});
receiver.start();

ipcRenderer.on("robothree:strm23:snapshot", () => {
  ipcRenderer.send(EVENT_CHANNEL, {
    type: "preload_snapshot",
    snapshot: receiver.snapshot(),
    commandPresent: lastCommandId !== undefined,
  });
});

globalThis.addEventListener("unload", () => receiver.close(), { once: true });

if (scenario.startsWith("s1_")) {
  ipcRenderer.send(EVENT_CHANNEL, {
    type: "barrier",
    phase: "before_safe_prepare",
    direction: scenario.endsWith("reveal") ? "reveal" : "mutation",
  });
} else {
  ipcRenderer.send(REQUEST_CHANNEL, { scenario });
}

function acceptWrongProfile(event: Electron.IpcRendererEvent, input: unknown): void {
  const port = event.ports[0];
  const value = input as Readonly<Record<string, unknown>>;
  const ticket = value.ticket as Readonly<Record<string, unknown>> | undefined;
  const readyControl = value.readyControl;
  if (event.ports.length !== 1 || port === undefined || ticket === undefined) {
    ipcRenderer.send(EVENT_CHANNEL, { type: "terminal_error", typedErrorCode: "invalid_offer" });
    return;
  }
  port.onmessage = (messageEvent) => {
    const message = messageEvent.data as Readonly<Record<string, unknown>>;
    if (message.controlType === "terminal_ack") {
      ipcRenderer.send(EVENT_CHANNEL, {
        type: "barrier",
        phase: "profile_mismatch_rejected",
        direction: "mutation",
        terminal: message.terminal,
        typedErrorCode: message.typedErrorCode,
      });
    }
  };
  port.start();
  port.postMessage(readyControl);
  port.postMessage({
    schemaVersion: "personal-credential-transport-frame-authorization-request.v1",
    protocolVersion: "personal-credential-transport.v1",
    transportProfileRevision: "personal-credential.route-a.invalid.v9",
    commandId: ticket.commandId,
    correlationId: ticket.correlationId,
    direction: "mutation_to_main",
    frameType: "mutation_secret",
    bodyLength: 6,
  });
}

function readCommandId(input: unknown): string | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  const ticket = Reflect.get(input, "ticket");
  if (typeof ticket !== "object" || ticket === null) return undefined;
  const value = Reflect.get(ticket, "commandId");
  return typeof value === "string" ? value : undefined;
}

function safeCode(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const code = Reflect.get(error, "code");
    if (typeof code === "string") return code.slice(0, 96);
  }
  return "transport_error";
}
