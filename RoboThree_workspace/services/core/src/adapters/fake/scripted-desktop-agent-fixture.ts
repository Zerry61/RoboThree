import { createAgentDefinitionRevision } from "../../application/runtime-selection-revisions.js";

export const SCRIPTED_DESKTOP_FIXTURE_AGENT_ID =
  "agent.fixture.desktop-scripted" as const;

export function createScriptedDesktopAgentFixture(input: Readonly<{
  modelId: string;
  toolReferences?: readonly Readonly<{
    capabilityId: string;
    capabilityRevision: string;
  }>[];
}>) {
  return createAgentDefinitionRevision({
    schemaVersion: "v1alpha1",
    agentDefinitionId: SCRIPTED_DESKTOP_FIXTURE_AGENT_ID,
    name: "RoboThree Desktop Scripted Fixture",
    identity: "RoboThree isolated scripted desktop test fixture",
    goal: "Exercise deterministic desktop runtime paths in tests",
    instructions: "Use only deterministic scripted test capabilities.",
    defaultModelId: input.modelId,
    allowModelOverride: false,
    skillReferences: [],
    toolReferences: [...(input.toolReferences ?? [])],
    knowledgeReferences: [],
    requiredModelCapabilities: {
      inputModalities: ["text"],
      outputModalities: ["text"],
      supportsToolCalling: true,
      supportsStreaming: true,
      minimumContextWindow: 8_192,
    },
    createdAt: "2026-08-26T00:00:00.000Z",
  });
}
