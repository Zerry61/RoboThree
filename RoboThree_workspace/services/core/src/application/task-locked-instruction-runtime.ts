import type { Sha256Digest } from "@robothree/contracts";
import { JsonValueSchema } from "@robothree/contracts";
import type { ReadableTaskRuntimeSelectionV1Alpha4 } from
  "@robothree/contracts/runtime-selection/v1alpha4";

import {
  CpcInstructionFoundationError,
} from "./instruction-bundle-domain.js";
import type {
  TaskInstructionBundleMaterializer,
  CompiledInstructionBundleV1,
} from "./instruction-bundle-compiler.js";
import { PLATFORM_PROMPT_V1_REVISION } from "./platform-prompt-source.js";
import { parseReadableTaskRuntimeSelectionV1Alpha4 } from
  "./runtime-selection-revisions.js";
import { sha256CanonicalJson } from "../persistence/digest.js";
import type { ReadableAgentDefinitionRevision } from "./agent-definition-v1alpha2.js";

export const LEGACY_DESKTOP_PROMPT_REVISION =
  "sha256:9999999999999999999999999999999999999999999999999999999999999999" as Sha256Digest;

export const CPC_INSTRUCTION_RUNTIME_DEFAULT_ENABLED = false as const;

export function platformPromptRevisionForNewTask(
  enabled: boolean = CPC_INSTRUCTION_RUNTIME_DEFAULT_ENABLED,
): Sha256Digest {
  return enabled ? PLATFORM_PROMPT_V1_REVISION : LEGACY_DESKTOP_PROMPT_REVISION;
}

export type TaskLockedInstructionRuntimeMaterial =
  | Readonly<{
    mode: "legacy";
    instruction: string;
    instructionDigest: Sha256Digest;
  }>
  | Readonly<{
    mode: "cpc_v1";
    bundle: CompiledInstructionBundleV1;
  }>;

export class TaskLockedInstructionRuntimeResolver {
  readonly #materializer: TaskInstructionBundleMaterializer;
  readonly #enabled: boolean;

  public constructor(input: Readonly<{
    materializer: TaskInstructionBundleMaterializer;
    enabled?: boolean;
  }>) {
    this.#materializer = input.materializer;
    this.#enabled = input.enabled ?? CPC_INSTRUCTION_RUNTIME_DEFAULT_ENABLED;
  }

  public async resolve(input: Readonly<{
    runtimeSelection: ReadableTaskRuntimeSelectionV1Alpha4;
    submitTurnBundleDigest: string;
    agent: ReadableAgentDefinitionRevision;
  }>): Promise<TaskLockedInstructionRuntimeMaterial> {
    let selection: ReadableTaskRuntimeSelectionV1Alpha4;
    try {
      selection = parseReadableTaskRuntimeSelectionV1Alpha4(input.runtimeSelection);
    } catch {
      throw new CpcInstructionFoundationError(
        "context.instruction_binding_invalid",
        "Task runtime selection cannot prove an exact instruction binding",
      );
    }
    if (selection.platformPromptRevision === LEGACY_DESKTOP_PROMPT_REVISION) {
      const instruction = [
        `Identity: ${input.agent.identity}`,
        `Goal: ${input.agent.goal}`,
        input.agent.instructions,
      ].join("\n\n");
      return Object.freeze({
        mode: "legacy" as const,
        instruction,
        instructionDigest: legacyInstructionDigest(instruction),
      });
    }
    if (selection.platformPromptRevision !== PLATFORM_PROMPT_V1_REVISION) {
      throw new CpcInstructionFoundationError(
        "context.platform_prompt_unavailable",
        "The locked Platform Prompt revision is unavailable",
      );
    }
    if (!this.#enabled) {
      throw new CpcInstructionFoundationError(
        "context.instruction_runtime_unavailable",
        "CPC instruction runtime is not enabled for this Core release",
      );
    }
    return Object.freeze({
      mode: "cpc_v1" as const,
      bundle: await this.#materializer.materializeValidated({
        runtimeSelection: selection,
        submitTurnBundleDigest: input.submitTurnBundleDigest,
        agent: input.agent,
      }),
    });
  }
}

function legacyInstructionDigest(instruction: string): Sha256Digest {
  // Kept byte-identical with the pre-CPC Agent Loop materialization.
  return sha256CanonicalJson(JsonValueSchema.parse(instruction));
}
