import { describe, expect, it } from "vitest";

import {
  ENTERPRISE_AGENT_TURN_TIMEOUT_MS,
  ENTERPRISE_MODEL_INVOCATION_TIMEOUT_MS,
  clampEnterpriseInvocationDeadline,
  enterpriseAgentTurnDeadlineAt,
} from "../src/index.js";

describe("enterprise Agent Turn timeout policy", () => {
  it("uses a wide hard deadline while bounding each model invocation", () => {
    const turnStartedAt = "2026-08-31T07:00:00.000Z";
    const turnDeadlineAt = enterpriseAgentTurnDeadlineAt(turnStartedAt);

    expect(ENTERPRISE_MODEL_INVOCATION_TIMEOUT_MS).toBe(900_000);
    expect(ENTERPRISE_AGENT_TURN_TIMEOUT_MS).toBe(1_800_000);
    expect(turnDeadlineAt).toBe("2026-08-31T07:30:00.000Z");
    expect(clampEnterpriseInvocationDeadline(
      "2026-08-31T07:00:00.000Z",
      turnDeadlineAt,
    )).toBe("2026-08-31T07:15:00.000Z");
  });

  it("never lets a later model round renew the turn budget", () => {
    const turnDeadlineAt = "2026-08-31T07:30:00.000Z";

    expect(clampEnterpriseInvocationDeadline(
      "2026-08-31T07:00:00.000Z",
      turnDeadlineAt,
    )).toBe("2026-08-31T07:15:00.000Z");
    expect(clampEnterpriseInvocationDeadline(
      "2026-08-31T07:20:00.000Z",
      turnDeadlineAt,
    )).toBe(turnDeadlineAt);
  });
});
