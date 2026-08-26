import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { FOUNDATION_FIXTURE_SCHEMA } from "../../shared/foundation-api.js";
import type {
  CoreHarnessBootMessage,
  CoreHarnessChildMessage,
  CoreHarnessParentMessage,
} from "../core-harness-protocol.js";

let server: Server | undefined;
let authorizationToken: string | undefined;
let shuttingDown = false;

process.on("message", (message: unknown) => {
  void handleParentMessage(message);
});

process.on("disconnect", () => {
  void shutdown();
});

async function handleParentMessage(message: unknown): Promise<void> {
  if (!isParentMessage(message)) {
    send({
      type: "fixture.failed",
      fixtureSchema: FOUNDATION_FIXTURE_SCHEMA,
      reason: "invalid_parent_message",
    });
    return;
  }

  if (message.type === "fixture.shutdown") {
    await shutdown();
    return;
  }

  if (server !== undefined || authorizationToken !== undefined) {
    send({
      type: "fixture.failed",
      fixtureSchema: FOUNDATION_FIXTURE_SCHEMA,
      reason: "duplicate_boot",
    });
    return;
  }

  authorizationToken = message.authorizationToken;
  server = createServer((request, response) => {
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.setHeader("cache-control", "no-store");

    if (request.headers.authorization !== `Bearer ${authorizationToken}`) {
      response.writeHead(401);
      response.end(JSON.stringify({ error: "fixture.unauthorized" }));
      return;
    }

    if (request.method !== "GET") {
      response.writeHead(405);
      response.end(JSON.stringify({ error: "fixture.method_not_allowed" }));
      return;
    }

    if (request.url === "/fixture/readiness") {
      response.writeHead(200);
      response.end(JSON.stringify({
        fixtureSchema: FOUNDATION_FIXTURE_SCHEMA,
        status: "ready",
      }));
      return;
    }

    if (request.url === "/fixture/compatibility") {
      response.writeHead(200);
      response.end(JSON.stringify({
        fixtureSchema: FOUNDATION_FIXTURE_SCHEMA,
        compatible: true,
        foundation: "dcf-0",
      }));
      return;
    }

    response.writeHead(404);
    response.end(JSON.stringify({ error: "fixture.not_found" }));
  });

  server.on("error", () => {
    send({
      type: "fixture.failed",
      fixtureSchema: FOUNDATION_FIXTURE_SCHEMA,
      reason: "loopback_server_error",
    });
  });

  server.listen({ host: "127.0.0.1", port: 0, exclusive: true }, () => {
    const address = server?.address() as AddressInfo | null;
    if (address === null) {
      send({
        type: "fixture.failed",
        fixtureSchema: FOUNDATION_FIXTURE_SCHEMA,
        reason: "missing_loopback_address",
      });
      return;
    }
    send({
      type: "fixture.ready",
      fixtureSchema: FOUNDATION_FIXTURE_SCHEMA,
      host: "127.0.0.1",
      port: address.port,
    });
  });
}

function isParentMessage(value: unknown): value is CoreHarnessParentMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  if (candidate.type === "fixture.shutdown") {
    return true;
  }
  return candidate.type === "fixture.boot"
    && candidate.fixtureSchema === FOUNDATION_FIXTURE_SCHEMA
    && typeof candidate.authorizationToken === "string"
    && candidate.authorizationToken.length >= 32;
}

function send(message: CoreHarnessChildMessage): void {
  if (process.connected) {
    process.send?.(message);
  }
}

async function shutdown(): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  authorizationToken = undefined;

  await new Promise<void>((resolve) => {
    if (server === undefined) {
      resolve();
      return;
    }
    server.close(() => resolve());
    server.closeAllConnections();
  });

  process.disconnect();
}

const _bootMessageTypeCheck: CoreHarnessBootMessage["type"] = "fixture.boot";
void _bootMessageTypeCheck;
