package com.robothree.central.modelgateway.domain;

import static com.robothree.central.shared.domain.DomainValueChecks.digest;

import com.robothree.central.modelgateway.domain.ModelEndpointBinding.Protocol;

/** Sealed, content-free bridge from an exact private release to one Provider body. */
public sealed interface ProviderReasoningProjection
        permits ProviderReasoningProjection.Omit,
                ProviderReasoningProjection.OpenAiEffort,
                ProviderReasoningProjection.AnthropicThinkingBudget {

    record Omit() implements ProviderReasoningProjection {
        private static final Omit INSTANCE = new Omit();
        public static Omit instance() { return INSTANCE; }
    }

    record OpenAiEffort(
            String mappingRevision,
            String mappingDigest,
            Effort effort) implements ProviderReasoningProjection {
        public OpenAiEffort {
            mappingRevision = digest(mappingRevision, "mappingRevision");
            mappingDigest = digest(mappingDigest, "mappingDigest");
            if (!mappingRevision.equals(mappingDigest)) {
                throw new IllegalArgumentException("mapping revision and digest must match");
            }
            if (effort == null) throw new NullPointerException("effort");
        }
    }

    record AnthropicThinkingBudget(
            String mappingRevision,
            String mappingDigest,
            int budgetTokens) implements ProviderReasoningProjection {
        public AnthropicThinkingBudget {
            mappingRevision = digest(mappingRevision, "mappingRevision");
            mappingDigest = digest(mappingDigest, "mappingDigest");
            if (!mappingRevision.equals(mappingDigest)) {
                throw new IllegalArgumentException("mapping revision and digest must match");
            }
            if (budgetTokens < 1_024 || budgetTokens > 131_072) {
                throw new IllegalArgumentException("thinking budget is outside its limit");
            }
        }
    }

    enum Effort { HIGH, XHIGH }

    static void requireProtocol(
            ProviderReasoningProjection projection,
            Protocol protocol) {
        if (projection instanceof Omit) return;
        if (projection instanceof OpenAiEffort
                && protocol == Protocol.OPENAI_COMPATIBLE) return;
        if (projection instanceof AnthropicThinkingBudget
                && protocol == Protocol.ANTHROPIC_COMPATIBLE) return;
        throw new IllegalArgumentException("reasoning projection does not match Provider protocol");
    }
}

