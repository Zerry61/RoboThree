import { createServer, type Server } from "node:http";

import { afterEach, describe, expect, it } from "vitest";

import { HttpSkillLifecycleClient } from
  "../src/adapters/http/http-skill-lifecycle-client.js";
import type { InternalTrialSkillLifecycleAccessToken } from
  "../src/adapters/environment/internal-trial-skill-lifecycle-access-token.js";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => {
    server.closeAllConnections();
    server.close(() => resolve());
  })));
});

describe("RSL-2 private Skill lifecycle completion receipt", () => {
  it.each(["test_passed", "test_failed"] as const)(
    "accepts the private %s state without widening the public Contract",
    async (state) => {
      const client = await clientReturning(state);
      await expect(client.completeTest(command(state === "test_passed" ? "passed" : "failed")))
        .resolves.toMatchObject({ state });
    },
  );

  it("rejects a state outside the exact private completion union", async () => {
    const client = await clientReturning("published");
    await expect(client.completeTest(command("passed"))).rejects.toThrow();
  });
});

async function clientReturning(state: string): Promise<HttpSkillLifecycleClient> {
  const server = createServer((_request, response) => {
    const body = JSON.stringify({
      contractVersion: "skill-lifecycle.v1alpha1",
      commandId: "11111111-1111-4111-8111-111111111111",
      correlationId: "22222222-2222-4222-8222-222222222222",
      skillId: "skill.personal.receipt-test",
      currentRevision: digest("a"),
      state,
    });
    response.writeHead(200, {
      "content-type": "application/json",
      "content-length": Buffer.byteLength(body),
    }).end(body);
  });
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("test_server_missing");
  const token = { bearer: () => "test-only-token" } as unknown as
    InternalTrialSkillLifecycleAccessToken;
  return new HttpSkillLifecycleClient({
    baseUrl: `http://127.0.0.1:${address.port}`,
    token,
    allowInsecureLoopback: true,
  });
}

function command(result: "passed" | "failed") {
  return {
    contractVersion: "skill-lifecycle.v1alpha1" as const,
    kind: "complete_skill_draft_test" as const,
    commandId: "11111111-1111-4111-8111-111111111111",
    correlationId: "22222222-2222-4222-8222-222222222222",
    skillId: "skill.personal.receipt-test",
    expectedDraftRevision: digest("a"),
    taskId: "task:33333333-3333-4333-8333-333333333333",
    result,
    ...(result === "failed" ? { safeReason: "测试未通过。" } : {}),
    resultDigest: digest("b"),
  };
}

function digest(character: string): string {
  return `sha256:${character.repeat(64)}`;
}
