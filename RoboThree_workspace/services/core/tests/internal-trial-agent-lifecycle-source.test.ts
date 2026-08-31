import { describe, expect, it } from "vitest";

import type { RobotDraftDetail } from
  "@robothree/contracts/agent-lifecycle/v1alpha1";
import type { PublishedRobotReleasePage } from
  "@robothree/contracts/agent-lifecycle/v1alpha1";

import { InternalTrialAgentLifecycleSource } from
  "../src/application/internal-trial-agent-lifecycle-source.js";

const revision = `sha256:${"a".repeat(64)}` as const;

describe("InternalTrialAgentLifecycleSource", () => {
  it("materializes the exact saved draft revision for the real Task pipeline", async () => {
    const source = new InternalTrialAgentLifecycleSource();
    const agent = source.registerDraft(draft());

    expect(await source.loadActiveAgent("agent.user.robot-one")).toEqual(agent);
    expect(await source.loadExactAgent("agent.user.robot-one", agent.revision)).toEqual(agent);
    expect(await source.loadExactAgent("agent.user.robot-one", revision)).toBeUndefined();
    expect(source.catalogProjection(agent, "model.default")).toMatchObject({
      agentDefinitionId: "agent.user.robot-one",
      name: "资料整理机器人",
      defaultModelId: "model.allowed",
      allowModelOverride: false,
    });
  });

  it("does not invent Skill, Tool or Knowledge authority when restrictions are empty", () => {
    const source = new InternalTrialAgentLifecycleSource();
    const agent = source.registerDraft(draft({
      modelRestriction: { enabled: false, selectedReferences: [] },
    }));
    const projection = source.catalogProjection(agent, "model.default");

    expect(projection.defaultModelId).toBe("model.default");
    expect(projection.skillReferences).toEqual([]);
    expect(projection.toolReferences).toEqual([]);
    expect(projection.knowledgeReferences).toEqual([]);
  });

  it("advances the active published release without rewriting the prior exact revision", async () => {
    const source = new InternalTrialAgentLifecycleSource();
    const first = source.registerDraft(draft());
    const second = source.registerDraft(draft({
      behaviorRules: "只依据资料回答，并明确列出无法确认的事实。",
    }));

    source.registerPublished(publishedPage(first));
    source.registerPublished(publishedPage(second));

    expect(await source.loadActiveAgent("agent.user.robot-one")).toEqual(second);
    expect(await source.loadExactAgent("agent.user.robot-one", first.revision)).toEqual(first);
    expect(await source.loadExactAgent("agent.user.robot-one", second.revision)).toEqual(second);
  });
});

function publishedPage(
  agentDefinition: ReturnType<InternalTrialAgentLifecycleSource["registerDraft"]>,
): PublishedRobotReleasePage {
  return {
    items: [{ agentPackage: { agentDefinition } }],
  } as unknown as PublishedRobotReleasePage;
}

function draft(materialOverrides: Partial<RobotDraftDetail["material"]> = {}): RobotDraftDetail {
  return {
    robotId: "agent.user.robot-one",
    draftRevision: revision,
    instructionRevision: revision,
    name: "资料整理机器人",
    description: "整理用户提供的资料",
    avatar: { source: "system", assetId: "robot-avatar.default" },
    tags: ["资料"],
    testState: "untested",
    updatedAt: "2026-08-30T12:00:00.000Z",
    material: {
      robotId: "agent.user.robot-one",
      name: "资料整理机器人",
      description: "整理用户提供的资料",
      behaviorRules: "只依据用户提供的资料回答。",
      avatar: { source: "system", assetId: "robot-avatar.default" },
      tags: ["资料"],
      modelRestriction: {
        enabled: true,
        selectedReferences: [{ modelId: "model.allowed", revision, digest: revision }],
      },
      skillRestriction: { enabled: true, selectedReferences: [] },
      toolRestriction: { enabled: true, selectedReferences: [] },
      knowledgeRestriction: { enabled: true, selectedReferences: [] },
      ...materialOverrides,
    },
  };
}
