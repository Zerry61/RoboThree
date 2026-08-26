import type {
  AgentDefinitionRevision,
  ModelDefinition,
  RequiredModelCapabilities,
} from "@robothree/contracts";

export type ModelLiveEligibility = Readonly<{
  modelId: string;
  userAllowed: boolean;
  enabled: boolean;
  credentialAvailable: boolean;
  callable: boolean;
}>;

export type ModelEligibilityResult =
  | { eligible: true; model: ModelDefinition }
  | { eligible: false; model: ModelDefinition; reasons: readonly string[] };

export class ModelEligibilityEvaluator {
  evaluate(input: {
    agent: AgentDefinitionRevision;
    model: ModelDefinition;
    live: ModelLiveEligibility;
    inputRequirements?: Partial<RequiredModelCapabilities>;
  }): ModelEligibilityResult {
    const reasons: string[] = [];
    if (input.live.modelId !== input.model.modelId) reasons.push("model.live_subject_mismatch");
    if (!input.live.userAllowed) reasons.push("model.permission_denied");
    if (!input.live.enabled) reasons.push("model.disabled");
    if (!input.live.credentialAvailable) reasons.push("model.credential_unavailable");
    if (!input.live.callable) reasons.push("model.not_callable");
    const required = mergeRequirements(
      input.agent.requiredModelCapabilities,
      input.inputRequirements,
    );
    if (!containsAll(input.model.capabilities.inputModalities, required.inputModalities)) {
      reasons.push("model.input_modality_missing");
    }
    if (!containsAll(input.model.capabilities.outputModalities, required.outputModalities)) {
      reasons.push("model.output_modality_missing");
    }
    if (required.supportsToolCalling && !input.model.capabilities.supportsToolCalling) {
      reasons.push("model.tool_calling_missing");
    }
    if (required.supportsStreaming && !input.model.capabilities.supportsStreaming) {
      reasons.push("model.streaming_missing");
    }
    if (
      required.minimumContextWindow !== undefined
      && input.model.capabilities.contextWindow < required.minimumContextWindow
    ) reasons.push("model.context_window_too_small");
    return reasons.length === 0
      ? { eligible: true, model: input.model }
      : { eligible: false, model: input.model, reasons };
  }
}

function mergeRequirements(
  base: RequiredModelCapabilities,
  extra?: Partial<RequiredModelCapabilities>,
): RequiredModelCapabilities {
  return {
    inputModalities: [...new Set([
      ...base.inputModalities,
      ...(extra?.inputModalities ?? []),
    ])],
    outputModalities: [...new Set([
      ...base.outputModalities,
      ...(extra?.outputModalities ?? []),
    ])],
    supportsToolCalling: base.supportsToolCalling || (extra?.supportsToolCalling ?? false),
    supportsStreaming: base.supportsStreaming || (extra?.supportsStreaming ?? false),
    ...(Math.max(
      base.minimumContextWindow ?? 0,
      extra?.minimumContextWindow ?? 0,
    ) === 0
      ? {}
      : {
        minimumContextWindow: Math.max(
          base.minimumContextWindow ?? 0,
          extra?.minimumContextWindow ?? 0,
        ),
      }),
  };
}

function containsAll(actual: readonly string[], required: readonly string[]): boolean {
  const values = new Set(actual);
  return required.every((value) => values.has(value));
}
