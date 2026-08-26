package com.robothree.central.modelgateway.domain;

import static com.robothree.central.shared.domain.DomainValueChecks.digest;
import static com.robothree.central.shared.domain.DomainValueChecks.text;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

public final class ModelInvocationExecution {

    private ModelInvocationExecution() {}

    public record Request(
            UUID invocationId,
            String requestDigest,
            String modelId,
            ModelEndpointBinding binding,
            CredentialResolution credential,
            long fencingEpoch,
            Instant providerRequestDeadlineAt,
            Duration providerStreamIdleTimeout,
            PromptCacheExecutionContext promptCacheExecutionContext) {

        public Request {
            Objects.requireNonNull(invocationId, "invocationId");
            requestDigest = digest(requestDigest, "requestDigest");
            modelId = text(modelId, "modelId");
            Objects.requireNonNull(binding, "binding");
            Objects.requireNonNull(credential, "credential");
            if (fencingEpoch < 1) {
                throw new IllegalArgumentException("fencingEpoch must be positive");
            }
            Objects.requireNonNull(
                    providerRequestDeadlineAt,
                    "providerRequestDeadlineAt");
            Objects.requireNonNull(
                    providerStreamIdleTimeout,
                    "providerStreamIdleTimeout");
            if (providerStreamIdleTimeout.isZero()
                    || providerStreamIdleTimeout.isNegative()
                    || providerStreamIdleTimeout.compareTo(Duration.ofMinutes(10)) > 0) {
                throw new IllegalArgumentException(
                        "providerStreamIdleTimeout is invalid");
            }
        }

        public Request(
                UUID invocationId,
                String requestDigest,
                String modelId,
                ModelEndpointBinding binding,
                CredentialResolution credential,
                long fencingEpoch,
                Instant providerRequestDeadlineAt,
                Duration providerStreamIdleTimeout) {
            this(
                    invocationId,
                    requestDigest,
                    modelId,
                    binding,
                    credential,
                    fencingEpoch,
                    providerRequestDeadlineAt,
                    providerStreamIdleTimeout,
                    null);
        }
    }

    /** Read-only provider-neutral plan reference. Adapters must not persist or mutate it. */
    public record PromptCacheExecutionContext(
            String planDigest,
            String cacheContextDigest,
            String cacheScopeIdDigest,
            String staticSourceLockDigest,
            String staticPrefixDigest,
            String compatibilityFingerprintDigest,
            String cacheKeyDigest,
            String cachePolicyRevision,
            String bindingRevision,
            String bindingDigest,
            String profileId,
            String profileRevision,
            String profileDigest,
            String providerProjectionMode,
            boolean eligible,
            String skipReason) {

        public PromptCacheExecutionContext {
            planDigest = digest(planDigest, "planDigest");
            cacheContextDigest = digest(cacheContextDigest, "cacheContextDigest");
            cacheScopeIdDigest = digest(cacheScopeIdDigest, "cacheScopeIdDigest");
            staticSourceLockDigest = digest(staticSourceLockDigest, "staticSourceLockDigest");
            staticPrefixDigest = digest(staticPrefixDigest, "staticPrefixDigest");
            compatibilityFingerprintDigest = digest(
                    compatibilityFingerprintDigest,
                    "compatibilityFingerprintDigest");
            cacheKeyDigest = cacheKeyDigest == null
                    ? null
                    : digest(cacheKeyDigest, "cacheKeyDigest");
            cachePolicyRevision = digest(cachePolicyRevision, "cachePolicyRevision");
            bindingRevision = digest(bindingRevision, "bindingRevision");
            bindingDigest = digest(bindingDigest, "bindingDigest");
            profileId = text(profileId, "profileId");
            profileRevision = digest(profileRevision, "profileRevision");
            profileDigest = digest(profileDigest, "profileDigest");
            providerProjectionMode = text(
                    providerProjectionMode,
                    "providerProjectionMode");
            skipReason = skipReason == null ? null : text(skipReason, "skipReason");
            PromptCacheProfile.ProjectionMode mode =
                    PromptCacheProfile.ProjectionMode.fromContractValue(
                            providerProjectionMode);
            PromptCachePlan.SkipReason reason = skipReason == null
                    ? null
                    : PromptCachePlan.SkipReason.fromContractValue(skipReason);
            String expected = PromptCachePlan.computePlanDigest(
                    cacheContextDigest,
                    cacheScopeIdDigest,
                    staticSourceLockDigest,
                    staticPrefixDigest,
                    compatibilityFingerprintDigest,
                    cacheKeyDigest,
                    cachePolicyRevision,
                    bindingRevision,
                    bindingDigest,
                    profileId,
                    profileRevision,
                    profileDigest,
                    mode,
                    eligible,
                    reason);
            if (!expected.equals(planDigest)) {
                throw new IllegalArgumentException(
                        "planDigest does not match execution context facts");
            }
        }

        public static PromptCacheExecutionContext from(PromptCachePlan plan) {
            return new PromptCacheExecutionContext(
                    plan.planDigest(),
                    plan.cacheContextDigest(),
                    plan.cacheScopeIdDigest(),
                    plan.staticSourceLockDigest(),
                    plan.staticPrefixDigest(),
                    plan.compatibilityFingerprintDigest(),
                    plan.cacheKeyDigest(),
                    plan.cachePolicyRevision(),
                    plan.bindingRevision(),
                    plan.bindingDigest(),
                    plan.profileId(),
                    plan.profileRevision(),
                    plan.profileDigest(),
                    plan.providerProjectionMode().contractValue(),
                    plan.eligible(),
                    plan.skipReason() == null ? null : plan.skipReason().contractValue());
        }
    }

    public record CredentialResolution(
            String credentialReference,
            String credentialRevision) {

        public CredentialResolution {
            credentialReference = text(credentialReference, "credentialReference");
            credentialRevision = digest(credentialRevision, "credentialRevision");
        }
    }

    public record Result(
            Outcome outcome,
            Usage usage,
            String finishReason,
            String safeErrorCode,
            String safeSummary,
            List<String> ephemeralTextDeltas) {

        public Result {
            Objects.requireNonNull(outcome, "outcome");
            ephemeralTextDeltas = ephemeralTextDeltas == null
                    ? List.of()
                    : List.copyOf(ephemeralTextDeltas);
            if (ephemeralTextDeltas.size() > 256) {
                throw new IllegalArgumentException("ephemeralTextDeltas exceeds its limit");
            }
            for (String delta : ephemeralTextDeltas) {
                if (delta == null || delta.isEmpty() || delta.length() > 65_536) {
                    throw new IllegalArgumentException("ephemeral text delta is invalid");
                }
            }
            finishReason = optionalText(finishReason, "finishReason");
            safeErrorCode = optionalText(safeErrorCode, "safeErrorCode");
            safeSummary = optionalText(safeSummary, "safeSummary");
            if (outcome == Outcome.COMPLETED && finishReason == null) {
                throw new IllegalArgumentException(
                        "completed execution requires finishReason");
            }
            if ((outcome == Outcome.FAILED || outcome == Outcome.UNCERTAIN)
                    && safeErrorCode == null) {
                throw new IllegalArgumentException(
                        "failed or uncertain execution requires safeErrorCode");
            }
        }

        public static Result completed(
                long inputTokens,
                long outputTokens,
                String finishReason,
                List<String> deltas) {
            return new Result(
                    Outcome.COMPLETED,
                    new Usage(inputTokens, outputTokens),
                    finishReason,
                    null,
                    null,
                    deltas);
        }

        public static Result uncertain(String code, String summary) {
            return new Result(
                    Outcome.UNCERTAIN,
                    null,
                    null,
                    code,
                    summary,
                    List.of());
        }
    }

    public record Usage(
            long inputTokens,
            long outputTokens,
            Long cacheReadInputTokens,
            Long cacheWriteInputTokens,
            Long reasoningOutputTokens) {

        public Usage {
            if (inputTokens < 0 || outputTokens < 0) {
                throw new IllegalArgumentException("usage tokens must not be negative");
            }
            requireOptionalNonNegative(cacheReadInputTokens);
            requireOptionalNonNegative(cacheWriteInputTokens);
            requireOptionalNonNegative(reasoningOutputTokens);
            if (reasoningOutputTokens != null
                    && reasoningOutputTokens > outputTokens) {
                throw new IllegalArgumentException(
                        "reasoning output tokens must be a subset of output tokens");
            }
        }

        public Usage(long inputTokens, long outputTokens) {
            this(inputTokens, outputTokens, null, null, null);
        }

        private static void requireOptionalNonNegative(Long value) {
            if (value != null && value < 0) {
                throw new IllegalArgumentException(
                        "optional usage tokens must not be negative");
            }
        }
    }

    public record RecoveryEvidence(EvidenceType type, Result result) {

        public RecoveryEvidence {
            Objects.requireNonNull(type, "type");
            if ((type == EvidenceType.TERMINAL) != (result != null)) {
                throw new IllegalArgumentException(
                        "terminal recovery evidence must carry exactly one result");
            }
        }

        public static RecoveryEvidence terminal(Result result) {
            return new RecoveryEvidence(
                    EvidenceType.TERMINAL,
                    Objects.requireNonNull(result, "result"));
        }

        public static RecoveryEvidence notFound() {
            return new RecoveryEvidence(EvidenceType.NOT_FOUND, null);
        }

        public static RecoveryEvidence unknown() {
            return new RecoveryEvidence(EvidenceType.UNKNOWN, null);
        }
    }

    public enum Outcome {
        COMPLETED,
        FAILED,
        CANCELLED,
        TIMED_OUT,
        UNCERTAIN
    }

    public enum EvidenceType {
        TERMINAL,
        NOT_FOUND,
        UNKNOWN
    }

    private static String optionalText(String value, String name) {
        return value == null ? null : text(value, name);
    }
}
