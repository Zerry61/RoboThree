import type { ModelRequest } from "@robothree/contracts";

import type { TokenEstimator } from "../ports/token-estimator.js";
import type { ContextBudgetPolicy } from "./context-budget-policy.js";
import { ContextAssembler } from "./context-assembler.js";
import { ContextReducer } from "./context-reducer.js";
import type {
  ContextAssemblyReceipt,
  ContextPipelineInput,
} from "./context-types.js";
import { DynamicRequestFactsError } from "./dynamic-request-facts.js";
import { ModelMessageConverter } from "./model-message-converter.js";

export type ContextPipelineResult = Readonly<{
  request: ModelRequest;
  receipt: ContextAssemblyReceipt;
}>;

export type ContextPipelineAssessment = Readonly<{
  candidate: ContextPipelineResult;
  estimatedBeforeBoundedPreviewTokens: number;
  boundedPreviewApplied: boolean;
  exceedsAvailableInput: boolean;
}>;

export class ContextPipeline {
  readonly #assembler: ContextAssembler;
  readonly #defaultBudgetPolicy: ContextBudgetPolicy;
  readonly #reducer: ContextReducer;
  readonly #converter: ModelMessageConverter;
  readonly #estimator: TokenEstimator;

  constructor(input: {
    budgetPolicy: ContextBudgetPolicy;
    estimator: TokenEstimator;
    assembler?: ContextAssembler;
    converter?: ModelMessageConverter;
  }) {
    this.#assembler = input.assembler ?? new ContextAssembler();
    this.#defaultBudgetPolicy = input.budgetPolicy;
    this.#converter = input.converter ?? new ModelMessageConverter();
    this.#estimator = input.estimator;
    this.#reducer = new ContextReducer({
      estimator: this.#estimator,
      converter: this.#converter,
    });
  }

  run(input: ContextPipelineInput): ContextPipelineResult {
    const assessment = this.#execute(input, true);
    return assessment.candidate;
  }

  assess(input: ContextPipelineInput): ContextPipelineAssessment {
    return this.#execute(input, false);
  }

  #execute(
    input: ContextPipelineInput,
    enforceAvailableInput: boolean,
  ): ContextPipelineAssessment {
    const assembled = this.#assembler.assemble({
      snapshot: input.snapshot,
      conversationMessages: input.conversationMessages,
      ...(input.instructions === undefined ? {} : { instructions: input.instructions }),
      ...(input.selectedSkills === undefined ? {} : { selectedSkills: input.selectedSkills }),
      ...(input.toolCandidates === undefined ? {} : { toolCandidates: input.toolCandidates }),
      ...(input.compactionSummary === undefined
        ? {}
        : { compactionSummary: input.compactionSummary }),
      ...(input.lockedInstructionBundle === undefined
        ? {}
        : { lockedInstructionBundle: input.lockedInstructionBundle }),
      ...(input.dynamicRequestFacts === undefined
        ? {}
        : { dynamicRequestFacts: input.dynamicRequestFacts }),
    });
    const budget = (input.budgetPolicy ?? this.#defaultBudgetPolicy).decision();
    if (
      input.lockedInstructionBundle !== undefined
      && (
        input.lockedInstructionBundle.budgetPolicyDigest !== budget.policyDigest
        || input.lockedInstructionBundle.availableInputTokens !== budget.availableInputTokens
      )
    ) {
      throw new Error("Locked instruction budget does not match the Context Pipeline policy");
    }
    const conversion = {
      requestId: input.requestId,
      model: input.model,
      maxOutputTokens: budget.reservedOutputTokens,
    };
    const reduced = this.#reducer.reduce(
      assembled,
      conversion,
      budget,
      input.toolCallBatches,
      { enforceAvailableInput },
    );
    const request = this.#converter.convert(reduced.context, conversion);
    const finalGuard = this.#estimator.estimate(
      this.#converter.measurementValue(reduced.context, conversion),
    );
    if (finalGuard !== reduced.finalEstimatedInputTokens) {
      throw new Error("Context pre-call budget guard did not match the reduced ModelRequest");
    }
    if (enforceAvailableInput && finalGuard > budget.availableInputTokens) {
      if (input.dynamicRequestFacts !== undefined) {
        throw new DynamicRequestFactsError(
          "context.dynamic_facts_budget_exceeded",
          "The controlled request facts exceed the available context budget",
        );
      }
      throw new Error("Context pre-call ModelRequest exceeds its available input budget");
    }
    const candidate = Object.freeze({
      request,
      receipt: Object.freeze({
        phase: input.phase,
        snapshotId: input.snapshot.snapshotId,
        snapshotSourceDigest: input.snapshot.sourceDigest,
        contextSourceDigest: reduced.context.contextSourceDigest,
        ...(reduced.context.compactionSummaryEvidence === undefined
          ? {}
          : { compactionSummaryEvidence: reduced.context.compactionSummaryEvidence }),
        ...(reduced.context.instructionBundleEvidence === undefined
          ? {}
          : { instructionBundleEvidence: reduced.context.instructionBundleEvidence }),
        ...(reduced.context.dynamicRequestFactsEvidence === undefined
          ? {}
          : {
            dynamicRequestFactsEvidence: reduced.context.dynamicRequestFactsEvidence,
            requestScopedSystemMessageDigest:
              reduced.context.requestScopedSystemMessageDigest,
          }),
        policyDigest: budget.policyDigest,
        includedSegments: reduced.context.segments,
        excludedSources: reduced.context.exclusions,
        reducedSegmentIds: reduced.reducedSegmentIds,
        initialEstimatedInputTokens: reduced.initialEstimatedInputTokens,
        finalEstimatedInputTokens: finalGuard,
        modelContextWindow: budget.modelContextWindow,
        reservedOutputTokens: budget.reservedOutputTokens,
        availableInputTokens: budget.availableInputTokens,
        compactionThresholdTokens: budget.compactionThresholdTokens,
        reductionApplied: reduced.reducedSegmentIds.length > 0
          || reduced.context.artifacts.some((artifact) => artifact.truncated),
        modelRequestDigest: request.requestDigest,
      }),
    });
    return Object.freeze({
      candidate,
      estimatedBeforeBoundedPreviewTokens: reduced.estimatedBeforeBoundedPreviewTokens,
      boundedPreviewApplied: reduced.boundedPreviewApplied,
      exceedsAvailableInput: finalGuard > budget.availableInputTokens,
    });
  }
}
