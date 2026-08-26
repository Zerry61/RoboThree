package com.robothree.central.modelgateway.domain;

import com.robothree.central.modelgateway.domain.ModelEndpointBinding.Protocol;
import com.robothree.central.modelgateway.domain.ModelInvocationExecution.Usage;
import com.robothree.central.modelgateway.domain.ProviderUsageFact.AttemptDisposition;
import com.robothree.central.shared.json.CanonicalJson;
import java.time.Instant;
import java.util.UUID;

public final class ProviderUsageFacts {

    public static final String ANTHROPIC_REPORTING_SEMANTICS_REVISION =
            CanonicalJson.sha256("anthropic-compatible-provider-usage-v1");
    public static final String OPENAI_REPORTING_SEMANTICS_REVISION =
            CanonicalJson.sha256("openai-compatible-provider-usage-v1");

    private ProviderUsageFacts() {}

    public static String attemptKey(
            UsageAuthority authority,
            UUID invocationId,
            long fencingEpoch) {
        return CanonicalJson.sha256(bound(
                authority.contractValue(),
                invocationId.toString(),
                Long.toString(fencingEpoch)));
    }

    public static ProviderUsageFact create(
            UUID usageFactId,
            UsageAuthority authority,
            UUID invocationId,
            long fencingEpoch,
            Protocol protocol,
            Usage usage,
            AttemptDisposition disposition,
            Instant recordedAt) {
        String sourceProtocol = switch (protocol) {
            case ANTHROPIC_COMPATIBLE -> "anthropic_compatible";
            case OPENAI_COMPATIBLE -> "openai_compatible";
        };
        String semantics = switch (protocol) {
            case ANTHROPIC_COMPATIBLE -> ANTHROPIC_REPORTING_SEMANTICS_REVISION;
            case OPENAI_COMPATIBLE -> OPENAI_REPORTING_SEMANTICS_REVISION;
        };
        long normalizedInput = normalizedInput(protocol, usage);
        String attemptKey = attemptKey(authority, invocationId, fencingEpoch);
        String usageDigest = usageDigest(
                authority.contractValue(),
                invocationId.toString(),
                attemptKey,
                Long.toString(fencingEpoch),
                sourceProtocol,
                semantics,
                Long.toString(usage.inputTokens()),
                Long.toString(usage.outputTokens()),
                optional(usage.cacheReadInputTokens()),
                optional(usage.cacheWriteInputTokens()),
                optional(usage.reasoningOutputTokens()),
                Long.toString(normalizedInput),
                disposition.contractValue());
        return new ProviderUsageFact(
                usageFactId,
                authority,
                invocationId,
                attemptKey,
                fencingEpoch,
                usageDigest,
                sourceProtocol,
                semantics,
                usage.inputTokens(),
                usage.outputTokens(),
                usage.cacheReadInputTokens(),
                usage.cacheWriteInputTokens(),
                usage.reasoningOutputTokens(),
                normalizedInput,
                disposition,
                recordedAt);
    }

    static void validate(
            UsageAuthority authority,
            UUID invocationId,
            String providerAttemptKey,
            long fencingEpoch,
            String usageDigest,
            String sourceProtocol,
            String reportingSemanticsRevision,
            long providerInputTokens,
            long providerOutputTokens,
            Long cacheReadInputTokens,
            Long cacheWriteInputTokens,
            Long reasoningOutputTokens,
            long normalizedTotalInputTokens,
            AttemptDisposition disposition) {
        Protocol protocol = switch (sourceProtocol) {
            case "anthropic_compatible" -> Protocol.ANTHROPIC_COMPATIBLE;
            case "openai_compatible" -> Protocol.OPENAI_COMPATIBLE;
            default -> throw new IllegalArgumentException("unknown Usage source protocol");
        };
        String expectedSemantics = switch (protocol) {
            case ANTHROPIC_COMPATIBLE -> ANTHROPIC_REPORTING_SEMANTICS_REVISION;
            case OPENAI_COMPATIBLE -> OPENAI_REPORTING_SEMANTICS_REVISION;
        };
        if (!expectedSemantics.equals(reportingSemanticsRevision)) {
            throw new IllegalArgumentException("Provider Usage reporting semantics drifted");
        }
        String expectedAttempt = attemptKey(authority, invocationId, fencingEpoch);
        if (!expectedAttempt.equals(providerAttemptKey)) {
            throw new IllegalArgumentException("Provider attempt key mismatch");
        }
        Usage usage = new Usage(
                providerInputTokens,
                providerOutputTokens,
                cacheReadInputTokens,
                cacheWriteInputTokens,
                reasoningOutputTokens);
        long expectedNormalizedInput = normalizedInput(protocol, usage);
        if (expectedNormalizedInput != normalizedTotalInputTokens) {
            throw new IllegalArgumentException("Provider Usage normalized input drifted");
        }
        String expectedDigest = usageDigest(
                authority.contractValue(),
                invocationId.toString(),
                providerAttemptKey,
                Long.toString(fencingEpoch),
                sourceProtocol,
                reportingSemanticsRevision,
                Long.toString(providerInputTokens),
                Long.toString(providerOutputTokens),
                optional(cacheReadInputTokens),
                optional(cacheWriteInputTokens),
                optional(reasoningOutputTokens),
                Long.toString(normalizedTotalInputTokens),
                disposition.contractValue());
        if (!expectedDigest.equals(usageDigest)) {
            throw new IllegalArgumentException("Provider Usage digest mismatch");
        }
    }

    private static long normalizedInput(Protocol protocol, Usage usage) {
        if (protocol == Protocol.OPENAI_COMPATIBLE) {
            if (usage.cacheReadInputTokens() != null
                    && usage.cacheReadInputTokens() > usage.inputTokens()) {
                throw new IllegalArgumentException(
                        "OpenAI cached input must be a subset of input tokens");
            }
            return usage.inputTokens();
        }
        return Math.addExact(
                usage.inputTokens(),
                Math.addExact(
                        usage.cacheReadInputTokens() == null
                                ? 0
                                : usage.cacheReadInputTokens(),
                        usage.cacheWriteInputTokens() == null
                                ? 0
                                : usage.cacheWriteInputTokens()));
    }

    private static String optional(Long value) {
        return value == null ? "unknown" : Long.toString(value);
    }

    private static String usageDigest(String... values) {
        return CanonicalJson.sha256(bound(values));
    }

    private static String bound(String... values) {
        StringBuilder input = new StringBuilder();
        for (String value : values) {
            input.append(value.length()).append(':').append(value).append('|');
        }
        return input.toString();
    }
}
