import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { CoreHarnessSupervisor } from "../src/main/core-harness-supervisor.js";

const supervisors: CoreHarnessSupervisor[] = [];

afterEach(async () => {
  await Promise.all(supervisors.splice(0).map(async (supervisor) => supervisor.stop()));
});

describe("CoreHarnessSupervisor", () => {
  it("starts one authenticated loopback fixture and shuts it down cleanly", async () => {
    const supervisor = createSupervisor();
    supervisors.push(supervisor);

    await supervisor.start();
    const status = await supervisor.probe();

    expect(status).toMatchObject({
      compatible: true,
      coreReady: true,
      fixtureOnly: true,
      runtimeState: "ready",
    });
    expect(status).not.toHaveProperty("authorizationToken");
    expect(status).not.toHaveProperty("port");
    expect(status).not.toHaveProperty("pid");

    const baseUrl = supervisor.loopbackBaseUrl();
    expect(baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/u);
    const unauthenticated = await fetch(`${baseUrl}/fixture/readiness`);
    expect(unauthenticated.status).toBe(401);

    await supervisor.stop();
    expect(supervisor.snapshot().runtimeState).toBe("stopped");
  });

  it("coalesces concurrent starts into one fixture", async () => {
    const supervisor = createSupervisor();
    supervisors.push(supervisor);

    await Promise.all([supervisor.start(), supervisor.start(), supervisor.start()]);

    expect(supervisor.snapshot()).toMatchObject({
      coreReady: true,
      unexpectedRestartCount: 0,
    });
  });
});

function createSupervisor(): CoreHarnessSupervisor {
  return new CoreHarnessSupervisor({
    entryPath: fileURLToPath(new URL("../dist/main/fixtures/fake-core-process.js", import.meta.url)),
    maxUnexpectedRestarts: 1,
  });
}
