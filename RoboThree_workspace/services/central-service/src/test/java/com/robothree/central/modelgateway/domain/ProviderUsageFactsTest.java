package com.robothree.central.modelgateway.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.robothree.central.modelgateway.domain.ModelEndpointBinding.Protocol;
import com.robothree.central.modelgateway.domain.ModelInvocationExecution.Usage;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ProviderUsageFactsTest {

    private static final UUID INVOCATION =
            UUID.fromString("00000000-0000-4000-8000-00000000a301");
    private static final Instant NOW = Instant.parse("2026-08-13T08:00:00Z");

    @Test
    void namespacesAttemptsByAuthorityAndExcludesTransportIdentity() {
        String enterprise = ProviderUsageFacts.attemptKey(
                UsageAuthority.CENTRAL_ENTERPRISE, INVOCATION, 1);
        String personal = ProviderUsageFacts.attemptKey(
                UsageAuthority.LOCAL_PERSONAL, INVOCATION, 1);

        assertThat(enterprise).hasSize(64).isNotEqualTo(personal);
        assertThat(ProviderUsageFacts.attemptKey(
                UsageAuthority.CENTRAL_ENTERPRISE, INVOCATION, 1))
                .isEqualTo(enterprise);
        assertThat(ProviderUsageFacts.attemptKey(
                UsageAuthority.CENTRAL_ENTERPRISE, INVOCATION, 2))
                .isNotEqualTo(enterprise);
    }

    @Test
    void sharesTheExecutionLocationNeutralUsageDigestFormulaWithCore() {
        UUID invocation = UUID.fromString("019f7447-a784-77b2-a716-000000009702");
        ProviderUsageFact fact = ProviderUsageFacts.create(
                UUID.fromString("00000000-0000-4000-8000-00000000a303"),
                UsageAuthority.CENTRAL_ENTERPRISE,
                invocation,
                1,
                Protocol.OPENAI_COMPATIBLE,
                new Usage(8, 3, 4L, null, 2L),
                ProviderUsageFact.AttemptDisposition.TERMINAL_WINNER,
                NOW);

        assertThat(fact.usageDigest())
                .isEqualTo("9b2b6d1b4425bf2763a894d0583237df154188343512c7745ea1c5993bbc774a");
    }

    @Test
    void preservesProtocolSpecificInputSemanticsAndOptionalUnknowns() {
        ProviderUsageFact anthropic = create(
                Protocol.ANTHROPIC_COMPATIBLE,
                new Usage(5, 4, 2L, 3L, null));
        ProviderUsageFact partialAnthropic = create(
                Protocol.ANTHROPIC_COMPATIBLE,
                new Usage(5, 4, null, 3L, null));
        ProviderUsageFact openAi = create(
                Protocol.OPENAI_COMPATIBLE,
                new Usage(12, 4, 7L, null, 2L));

        assertThat(anthropic.normalizedTotalInputTokens()).isEqualTo(10);
        assertThat(partialAnthropic.normalizedTotalInputTokens()).isEqualTo(8);
        assertThat(openAi.normalizedTotalInputTokens()).isEqualTo(12);
        assertThat(openAi.cacheWriteInputTokens()).isNull();
        assertThat(openAi.reportingSemanticsRevision()).hasSize(64);
    }

    @Test
    void rejectsProtocolInvalidSubsetsAndNegativeBreakdowns() {
        assertThatThrownBy(() -> create(
                        Protocol.OPENAI_COMPATIBLE,
                        new Usage(3, 1, 4L, null, null)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("subset");
        assertThatThrownBy(() -> new Usage(1, 1, -1L, null, null))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new Usage(1, 1, null, null, 2L))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsPersistedFactsWhoseAttemptSemanticsNormalizedValueOrDigestDrifted() {
        ProviderUsageFact exact = create(
                Protocol.ANTHROPIC_COMPATIBLE,
                new Usage(5, 4, 2L, 3L, null));

        assertThatThrownBy(() -> copy(exact, "0".repeat(64),
                        exact.reportingSemanticsRevision(),
                        exact.normalizedTotalInputTokens(),
                        exact.usageDigest()))
                .hasMessageContaining("attempt key");
        assertThatThrownBy(() -> copy(exact, exact.providerAttemptKey(),
                        ProviderUsageFacts.OPENAI_REPORTING_SEMANTICS_REVISION,
                        exact.normalizedTotalInputTokens(),
                        exact.usageDigest()))
                .hasMessageContaining("semantics");
        assertThatThrownBy(() -> copy(exact, exact.providerAttemptKey(),
                        exact.reportingSemanticsRevision(),
                        5,
                        exact.usageDigest()))
                .hasMessageContaining("normalized input");
        assertThatThrownBy(() -> copy(exact, exact.providerAttemptKey(),
                        exact.reportingSemanticsRevision(),
                        exact.normalizedTotalInputTokens(),
                        "1".repeat(64)))
                .hasMessageContaining("digest");
    }

    private static ProviderUsageFact create(Protocol protocol, Usage usage) {
        return ProviderUsageFacts.create(
                UUID.fromString("00000000-0000-4000-8000-00000000a302"),
                UsageAuthority.CENTRAL_ENTERPRISE,
                INVOCATION,
                1,
                protocol,
                usage,
                ProviderUsageFact.AttemptDisposition.TERMINAL_WINNER,
                NOW);
    }

    private static ProviderUsageFact copy(
            ProviderUsageFact fact,
            String attemptKey,
            String semantics,
            long normalizedInput,
            String usageDigest) {
        return new ProviderUsageFact(
                fact.usageFactId(),
                fact.usageAuthority(),
                fact.authorityInvocationId(),
                attemptKey,
                fact.fencingEpoch(),
                usageDigest,
                fact.sourceProtocol(),
                semantics,
                fact.providerInputTokens(),
                fact.providerOutputTokens(),
                fact.cacheReadInputTokens(),
                fact.cacheWriteInputTokens(),
                fact.reasoningOutputTokens(),
                normalizedInput,
                fact.attemptDisposition(),
                fact.recordedAt());
    }
}
