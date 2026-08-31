package com.robothree.central.modelgateway.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.robothree.central.modelgateway.domain.ModelEndpointBinding;
import com.robothree.central.modelgateway.domain.ProviderReasoningProjection;
import java.net.URI;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

final class EnterpriseReasoningSecondValidatorTest {
    private static final String A = "a".repeat(64);
    private static final String B = "b".repeat(64);
    private static final String C = "c".repeat(64);
    private static final String D = "d".repeat(64);
    private static final String E = "e".repeat(64);
    private static final String STRATEGY =
            "a3479d06260f9c6f556473d29c53a5050b7a84b248f36e334f2d6c84cf047f3c";
    private static final String PROFILE =
            "aa6319d484d81ff59cdfcc9f22dd4967ae7b0704a1bbccdf7a8be5f6e8add07a";
    private static final String MAPPING =
            "af786b55908f98209a17a94ce5e8a47e400c1d16a07812e56f0b533c5c730d5b";

    @Test
    void resolves_one_exact_release_and_keeps_default_lookup_free() {
        var release = release();
        var recalculated = EnterpriseReasoningMappingDigests.calculate(release);
        assertThat(recalculated.strategyDigest()).isEqualTo(STRATEGY);
        assertThat(recalculated.profileDigest()).isEqualTo(PROFILE);
        assertThat(recalculated.mappingDigest()).isEqualTo(MAPPING);
        var source = new CountingSource(List.of(release));
        var validator = new EnterpriseReasoningSecondValidator(source);

        assertThat(validator.validate(
                new EnterpriseReasoningSafeIdentity.DefaultPassthrough(
                        UUID.randomUUID(), A),
                binding(ModelEndpointBinding.Protocol.OPENAI_COMPATIBLE)))
                .isInstanceOf(ProviderReasoningProjection.Omit.class);
        assertThat(source.loads).isZero();
        assertThat(validator.validate(max(), binding(
                ModelEndpointBinding.Protocol.OPENAI_COMPATIBLE)))
                .isEqualTo(release.projection());
        assertThat(source.loads).isOne();
    }

    @Test
    void fails_closed_on_missing_duplicate_or_binding_drift() {
        assertThatThrownBy(() -> new EnterpriseReasoningSecondValidator(
                (revision, digest) -> List.of()).validate(
                        max(), binding(ModelEndpointBinding.Protocol.OPENAI_COMPATIBLE)))
                .isInstanceOf(ModelGatewayException.class)
                .hasMessageContaining("unavailable");
        var release = release();
        assertThatThrownBy(() -> new EnterpriseReasoningSecondValidator(
                (revision, digest) -> List.of(release, release)).validate(
                        max(), binding(ModelEndpointBinding.Protocol.OPENAI_COMPATIBLE)))
                .isInstanceOf(ModelGatewayException.class);
        assertThatThrownBy(() -> new EnterpriseReasoningSecondValidator(
                (revision, digest) -> List.of(release)).validate(
                        max(), binding(ModelEndpointBinding.Protocol.ANTHROPIC_COMPATIBLE)))
                .isInstanceOf(ModelGatewayException.class);
    }

    private static EnterpriseReasoningSafeIdentity.LockedMaxStrategy max() {
        return new EnterpriseReasoningSafeIdentity.LockedMaxStrategy(
                UUID.randomUUID(), A, "reasoning.profile.fixture-max", PROFILE, PROFILE,
                "reasoning.strategy.fixture-max", "3".repeat(64), STRATEGY, MAPPING, MAPPING,
                "timeout.policy.fixture-max");
    }

    private static EnterpriseReasoningMappingRelease release() {
        return new EnterpriseReasoningMappingRelease(
                "reasoning.mapping.fixture-openai", "central_enterprise",
                "enterprise_openai", "effort_level",
                ModelEndpointBinding.Protocol.OPENAI_COMPATIBLE,
                "model.fixture-max", "1".repeat(64),
                "adapter.model.fixture-max", "2".repeat(64),
                "reasoning.profile.fixture-max", PROFILE, PROFILE,
                "reasoning.strategy.fixture-max", "3".repeat(64), STRATEGY, MAPPING, MAPPING,
                "timeout.policy.fixture-max", "timeout.policy.fixture-max.v1", "4".repeat(64),
                "5".repeat(64), "6".repeat(64),
                new ProviderReasoningProjection.OpenAiEffort(
                        MAPPING, MAPPING, ProviderReasoningProjection.Effort.XHIGH),
                true);
    }

    private static ModelEndpointBinding binding(ModelEndpointBinding.Protocol protocol) {
        return new ModelEndpointBinding(
                "binding.enterprise.model", A, A,
                "model.fixture-max", "upstream-model", "1".repeat(64), B, C,
                ModelEndpointBinding.ConnectionMode.DIRECT_PROVIDER,
                protocol, URI.create("https://provider.invalid/v1"),
                "credential.enterprise.model", A, PROFILE, "4".repeat(64),
                ModelEndpointBinding.RecoveryMode.QUERY_THEN_RETRY);
    }

    private static final class CountingSource
            implements com.robothree.central.modelgateway.port.EnterpriseReasoningMappingSource {
        private final List<EnterpriseReasoningMappingRelease> values;
        private int loads;
        private CountingSource(List<EnterpriseReasoningMappingRelease> values) {
            this.values = values;
        }
        @Override public List<EnterpriseReasoningMappingRelease> loadExact(
                String revision, String digest) {
            loads++;
            return values;
        }
    }
}
