import { describe, expect, it } from "vitest";

import {
  BUILT_IN_GENERAL_AGENT_ID,
  BUILT_IN_GENERAL_AGENT_REVISION,
  BuiltInGeneralAgentSource,
  hasValidAgentDefinitionRevisionV1Alpha2,
} from "../src/index.js";
import {
  SCRIPTED_DESKTOP_FIXTURE_AGENT_ID,
  createScriptedDesktopAgentFixture,
} from "../src/adapters/fake/scripted-desktop-agent-fixture.js";

const digest = (marker: string) => `sha256:${marker.repeat(64)}`;

describe("R2D-3.2 code-owned agent.general", () => {
  const source = new BuiltInGeneralAgentSource();

  it("reproduces the frozen stable identity and exact digest", () => {
    const agent = source.loadDefault();
    expect(agent.agentDefinitionId).toBe("agent.general");
    expect(agent.agentDefinitionId).toBe(BUILT_IN_GENERAL_AGENT_ID);
    expect(agent.revision).toBe(BUILT_IN_GENERAL_AGENT_REVISION);
    expect(agent.digest).toBe(BUILT_IN_GENERAL_AGENT_REVISION);
    expect(hasValidAgentDefinitionRevisionV1Alpha2(agent)).toBe(true);
  });

  it("keeps the exact Chinese instruction material byte-for-byte", () => {
    const agent = source.loadDefault();
    expect(agent.name).toBe("RoboThree 通用助手");
    expect(agent.identity).toBe("你是 RoboThree 通用任务助手，帮助用户处理分析、写作、信息整理和当前能力允许的工作空间任务。");
    expect(agent.goal).toBe("准确理解用户目标，以尽量少的阻塞完成任务，并交付真实、清晰、可验证的结果。");
    expect(agent.instructions).toBe("- 优先解决用户当前问题。\n- 不预设行业角色或专业立场。\n- 只使用当前任务真实启用的 Skill、Tool 和参考资料。\n- 不编造未提供的能力、文件、来源或执行结果。");
    expect(agent.instructions.endsWith("\n")).toBe(false);
    expect(agent.instructions.split("\n").some((line) => /\s$/u.test(line))).toBe(false);
  });

  it("is system-owned, unrestricted and has no default Model field", () => {
    const agent = source.loadDefault();
    expect(agent.managementClass).toBe("system_builtin");
    expect(agent.modelRestriction).toEqual({ mode: "unrestricted" });
    expect(agent.skillRestriction).toEqual({ mode: "unrestricted" });
    expect(agent.toolRestriction).toEqual({ mode: "unrestricted" });
    expect(agent.knowledgeRestriction).toEqual({ mode: "unrestricted" });
    expect("defaultModelId" in agent).toBe(false);
    expect(JSON.stringify(agent)).not.toContain("model.desktop-scripted");
  });

  it("loads only the exact frozen revision", async () => {
    expect(await source.loadExactAgent(BUILT_IN_GENERAL_AGENT_ID,
      BUILT_IN_GENERAL_AGENT_REVISION)).toEqual(source.loadDefault());
    expect(await source.loadExactAgent(BUILT_IN_GENERAL_AGENT_ID, digest("f")))
      .toBeUndefined();
    expect(await source.loadExactAgent("agent.other", BUILT_IN_GENERAL_AGENT_REVISION))
      .toBeUndefined();
  });

  it("returns defensive copies", () => {
    const first = source.loadDefault();
    const second = source.loadDefault();
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
  });
});

describe("R2D-3.2 scripted fixture isolation", () => {
  it("uses a distinct exact fixture identity and source", () => {
    const fixture = createScriptedDesktopAgentFixture({
      modelId: "model.desktop-scripted",
    });
    expect(fixture.agentDefinitionId).toBe(SCRIPTED_DESKTOP_FIXTURE_AGENT_ID);
    expect(fixture.agentDefinitionId).not.toBe(BUILT_IN_GENERAL_AGENT_ID);
    expect(fixture.defaultModelId).toBe("model.desktop-scripted");
    expect(fixture.schemaVersion).toBe("v1alpha1");
  });

  it("never shares code-owned material with agent.general", () => {
    const fixture = createScriptedDesktopAgentFixture({
      modelId: "model.desktop-scripted",
    });
    const builtIn = new BuiltInGeneralAgentSource().loadDefault();
    expect(fixture.identity).not.toBe(builtIn.identity);
    expect(fixture.instructions).not.toBe(builtIn.instructions);
    expect(fixture.revision).not.toBe(builtIn.revision);
  });
});
