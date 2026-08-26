package com.robothree.central.modelgateway.adapter.runtime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.robothree.central.modelgateway.domain.ModelEndpointBinding;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding.ConnectionMode;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding.Protocol;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding.RecoveryMode;
import java.net.URI;
import org.junit.jupiter.api.Test;

class CustomRelayBindingSeedTest {

    @Test
    void locksRelayIdentityUpstreamModelAndManualRecoveryIndependently() {
        ModelEndpointBinding relay = CustomRelayBindingSeed.create(
                URI.create("https://relay.example/gateway"),
                Protocol.OPENAI_COMPATIBLE,
                "model.robothree",
                "model.relay-upstream");

        assertThat(relay.bindingId()).isEqualTo("binding.cgf2b3.custom-relay");
        assertThat(relay.connectionMode()).isEqualTo(ConnectionMode.CUSTOM_RELAY);
        assertThat(relay.protocol()).isEqualTo(Protocol.OPENAI_COMPATIBLE);
        assertThat(relay.modelId()).isEqualTo("model.robothree");
        assertThat(relay.upstreamModelId()).isEqualTo("model.relay-upstream");
        assertThat(relay.credentialReference())
                .isEqualTo("credential.cgf2b3.custom-relay");
        assertThat(relay.recoveryMode())
                .isEqualTo(RecoveryMode.MANUAL_RECONCILIATION);
        assertThat(relay.bindingRevision()).matches("^[0-9a-f]{64}$");
        assertThat(relay.bindingDigest()).matches("^[0-9a-f]{64}$");

        ModelEndpointBinding changedUpstream = CustomRelayBindingSeed.create(
                relay.endpoint(),
                relay.protocol(),
                relay.modelId(),
                "model.relay-upstream-v2");
        assertThat(changedUpstream.bindingRevision())
                .isNotEqualTo(relay.bindingRevision());
        assertThat(changedUpstream.bindingDigest())
                .isNotEqualTo(relay.bindingDigest());
    }

    @Test
    void rejectsMissingUpstreamModelBeforeAnyProviderCall() {
        assertThatThrownBy(() -> CustomRelayBindingSeed.create(
                        URI.create("https://relay.example/gateway"),
                        Protocol.ANTHROPIC_COMPATIBLE,
                        "model.robothree",
                        " "))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("upstreamModelId");
    }
}
