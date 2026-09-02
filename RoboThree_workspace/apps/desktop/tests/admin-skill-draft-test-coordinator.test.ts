import { describe, expect, it, vi } from "vitest";

import { AdminSkillDraftTestCoordinator } from
  "../src/main/admin-skill-draft-test-coordinator.js";
import type { CorePrivateSupervisor } from "../src/main/core-private-supervisor.js";
import type { SkillInstallationService } from "../src/main/skill-installation-service.js";

const request = Object.freeze({
  pending: true as const,
  operationId: "11111111-1111-4111-8111-111111111111",
  correlationId: "22222222-2222-4222-8222-222222222222",
  skillId: "skill.enterprise.admin-test",
  draftRevision: `sha256:${"a".repeat(64)}`,
  packageDigest: `sha256:${"b".repeat(64)}`,
  manifestDigest: `sha256:${"c".repeat(64)}`,
  skillMarkdownDigest: `sha256:${"d".repeat(64)}`,
});

describe("RSL-2 Admin Skill draft test coordinator", () => {
  it("restarts after private materialization before starting the real Task", async () => {
    const start = vi.fn();
    const client = { pollAdminSkillDraftTestV1Alpha1: vi.fn(async () => ({
      ok: true as const, value: request })), startAdminSkillDraftTestV1Alpha1: start };
    const prepare = vi.fn(async () => "materialized" as const);
    const coordinator = new AdminSkillDraftTestCoordinator({
      core: core(client), installations: installations(prepare),
    });

    await coordinator.runOnce();

    expect(prepare).toHaveBeenCalledOnce();
    expect(start).not.toHaveBeenCalled();
  });

  it("starts only after the exact test material is visible to the restarted Core", async () => {
    const start = vi.fn(async () => ({ ok: true as const, value: { taskId: "task-1" } }));
    const client = { pollAdminSkillDraftTestV1Alpha1: vi.fn(async () => ({
      ok: true as const, value: request })), startAdminSkillDraftTestV1Alpha1: start };
    const coordinator = new AdminSkillDraftTestCoordinator({
      core: core(client), installations: installations(vi.fn(async () => "ready" as const)),
    });

    await coordinator.runOnce();

    expect(start).toHaveBeenCalledWith(request.operationId);
  });

  it("cleans terminal private material when Central has no accepted request", async () => {
    const cleanup = vi.fn(async () => true);
    const client = { pollAdminSkillDraftTestV1Alpha1: vi.fn(async () => ({
      ok: true as const, value: { pending: false as const } })) };
    const installationService = { cleanupFinishedAdminDraftTests: cleanup } as unknown as
      SkillInstallationService;
    const coordinator = new AdminSkillDraftTestCoordinator({
      core: core(client),
      installations: installationService,
    });

    await coordinator.runOnce();

    expect(cleanup).toHaveBeenCalledWith(client);
  });
});

function core(client: object): CorePrivateSupervisor {
  return { snapshot: () => ({ runtimeState: "ready" }), client,
    clientInstanceId: "33333333-3333-4333-8333-333333333333" } as unknown as CorePrivateSupervisor;
}

function installations(prepare: ReturnType<typeof vi.fn>): SkillInstallationService {
  return { prepareAdminDraftTest: prepare,
    cleanupFinishedAdminDraftTests: vi.fn(async () => false) } as unknown as SkillInstallationService;
}
