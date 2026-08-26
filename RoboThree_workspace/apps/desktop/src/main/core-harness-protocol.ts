import { FOUNDATION_FIXTURE_SCHEMA } from "../shared/foundation-api.js";

export interface CoreHarnessBootMessage {
  readonly type: "fixture.boot";
  readonly fixtureSchema: typeof FOUNDATION_FIXTURE_SCHEMA;
  readonly authorizationToken: string;
}

export interface CoreHarnessShutdownMessage {
  readonly type: "fixture.shutdown";
}

export interface CoreHarnessReadyMessage {
  readonly type: "fixture.ready";
  readonly fixtureSchema: typeof FOUNDATION_FIXTURE_SCHEMA;
  readonly host: "127.0.0.1";
  readonly port: number;
}

export interface CoreHarnessFailureMessage {
  readonly type: "fixture.failed";
  readonly fixtureSchema: typeof FOUNDATION_FIXTURE_SCHEMA;
  readonly reason: string;
}

export type CoreHarnessParentMessage = CoreHarnessBootMessage | CoreHarnessShutdownMessage;
export type CoreHarnessChildMessage = CoreHarnessReadyMessage | CoreHarnessFailureMessage;

export function isCoreHarnessChildMessage(value: unknown): value is CoreHarnessChildMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  if (candidate.fixtureSchema !== FOUNDATION_FIXTURE_SCHEMA) {
    return false;
  }
  if (candidate.type === "fixture.ready") {
    return candidate.host === "127.0.0.1"
      && typeof candidate.port === "number"
      && Number.isInteger(candidate.port)
      && candidate.port > 0
      && candidate.port <= 65_535;
  }
  return candidate.type === "fixture.failed" && typeof candidate.reason === "string";
}
