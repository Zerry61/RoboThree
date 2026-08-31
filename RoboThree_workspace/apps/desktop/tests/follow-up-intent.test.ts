import { beforeEach, describe, expect, it } from "vitest";

import {
  consumeFollowUpIntent,
  setFollowUpIntent,
} from "../src/renderer/pages/workbench/follow-up-intent.js";

describe("MVP-VS3 Workbench follow-up intent", () => {
  beforeEach(() => {
    consumeFollowUpIntent();
  });

  it("moves one bounded intent through Renderer memory exactly once", () => {
    setFollowUpIntent({
      sessionId: "session:one",
      originTaskId: "task:one",
      candidateAgentId: "agent:presentation",
      candidateModelId: "model:gpt",
      previousArtifact: {
        displayName: "项目汇报.pptx",
        relativePath: "成果/项目汇报.pptx",
      },
    });

    expect(consumeFollowUpIntent()).toEqual({
      sessionId: "session:one",
      originTaskId: "task:one",
      candidateAgentId: "agent:presentation",
      candidateModelId: "model:gpt",
      previousArtifact: {
        displayName: "项目汇报.pptx",
        relativePath: "成果/项目汇报.pptx",
      },
    });
    expect(consumeFollowUpIntent()).toBeUndefined();
  });

  it("rejects missing authority ids and oversized safe display material", () => {
    expect(() => setFollowUpIntent({
      sessionId: "",
      originTaskId: "task:one",
      candidateAgentId: "",
      candidateModelId: "",
    })).toThrow("Invalid Workbench follow-up intent sessionId");
    expect(() => setFollowUpIntent({
      sessionId: "session:one",
      originTaskId: "task:one",
      candidateAgentId: "",
      candidateModelId: "",
      previousArtifact: {
        displayName: "x".repeat(513),
        relativePath: "项目汇报.pptx",
      },
    })).toThrow("Invalid Workbench follow-up intent previousArtifact.displayName");
  });
});
