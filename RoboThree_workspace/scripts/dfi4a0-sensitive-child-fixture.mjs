import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { clearTimeout, setTimeout } from "node:timers";

const active = new Map();

process.on("message", (message) => {
  if (isCancel(message)) {
    const operation = active.get(message.commandId);
    if (operation !== undefined) {
      clearTimeout(operation.timer);
      active.delete(message.commandId);
      operation.secret.fill(0);
      process.send?.({
        protocolVersion: 1,
        type: "dfi4a.credential.result",
        commandId: message.commandId,
        ok: false,
        code: "cancelled",
      });
    }
    return;
  }
  if (!isRequest(message)) {
    process.send?.({
      protocolVersion: 1,
      type: "dfi4a.credential.result",
      commandId: "invalid",
      ok: false,
      code: "invalid_request",
    });
    return;
  }
  if (Date.now() >= message.deadlineAt) {
    message.secret.fill(0);
    process.send?.({
      protocolVersion: 1,
      type: "dfi4a.credential.result",
      commandId: message.commandId,
      ok: false,
      code: "deadline_exceeded",
    });
    return;
  }
  if (active.has(message.commandId)) {
    message.secret.fill(0);
    process.send?.({
      protocolVersion: 1,
      type: "dfi4a.credential.result",
      commandId: message.commandId,
      ok: false,
      code: "conflict",
    });
    return;
  }
  const secret = Buffer.from(message.secret);
  message.secret.fill(0);
  const timer = setTimeout(() => {
    active.delete(message.commandId);
    const responseSecret = Buffer.from(secret);
    const digest = createHash("sha256").update(secret).digest("hex");
    secret.fill(0);
    process.send?.({
      protocolVersion: 1,
      type: "dfi4a.credential.result",
      commandId: message.commandId,
      ok: true,
      code: "roundtrip",
      digest,
      secret: responseSecret,
    }, () => responseSecret.fill(0));
  }, message.holdMs);
  active.set(message.commandId, { timer, secret });
});

function isCancel(value) {
  return value !== null
    && typeof value === "object"
    && Object.keys(value).sort().join(",") === "commandId,protocolVersion,type"
    && value.protocolVersion === 1
    && value.type === "dfi4a.credential.cancel"
    && typeof value.commandId === "string"
    && value.commandId.length > 0;
}

function isRequest(value) {
  return value !== null
    && typeof value === "object"
    && Object.keys(value).sort().join(",")
      === "commandId,deadlineAt,holdMs,protocolVersion,secret,type"
    && value.protocolVersion === 1
    && value.type === "dfi4a.credential.request"
    && typeof value.commandId === "string"
    && value.commandId.length > 0
    && Number.isSafeInteger(value.deadlineAt)
    && Number.isInteger(value.holdMs)
    && value.holdMs >= 0
    && Buffer.isBuffer(value.secret)
    && value.secret.byteLength > 0
    && value.secret.byteLength <= 8_192;
}
