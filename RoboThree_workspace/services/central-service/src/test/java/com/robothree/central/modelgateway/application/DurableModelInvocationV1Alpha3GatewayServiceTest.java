package com.robothree.central.modelgateway.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.robothree.central.modelgateway.application.ModelInvocationRuntime.AcceptCommand;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding;
import com.robothree.central.modelgateway.domain.ModelInvocation;
import com.robothree.central.modelgateway.domain.ModelInvocationDurableEvent;
import com.robothree.central.modelgateway.port.ModelEndpointBindingResolver;
import java.net.URI;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

final class DurableModelInvocationV1Alpha3GatewayServiceTest {
    private static final String A = "a".repeat(64);
    private static final String B = "b".repeat(64);
    private static final String C = "c".repeat(64);
    private static final String D = "d".repeat(64);

    @Test
    void centralMappingFailurePrecedesRequestRegistrationAndDurableAccept() {
        var runtime = new CountingRuntime();
        var requests = new TransientModelProviderRequestSource();
        var reasoning = new EnterpriseReasoningSecondValidator(
                (revision, digest) -> List.of());
        var service = new DurableModelInvocationV1Alpha3GatewayService(
                runtime,
                requests,
                new ModelInvocationEphemeralBuffer(16, 65_536),
                resolver(),
                reasoning,
                "central.test-node",
                16);

        assertThatThrownBy(() -> service.accept(
                "test-token",
                command(),
                "{\"messages\":[]}",
                null,
                null,
                new EnterpriseReasoningSafeIdentity.LockedMaxStrategy(
                        UUID.randomUUID(), A,
                        "reasoning.profile.fixture", B, B,
                        "reasoning.strategy.fixture", C, D,
                        A, A, "timeout.enterprise.model.v1")))
                .isInstanceOf(ModelGatewayException.class)
                .hasMessageContaining("unavailable");
        assertThat(runtime.acceptCount).isZero();
        assertThat(requests.size()).isZero();
    }

    private static AcceptCommand command() {
        return new AcceptCommand(
                UUID.randomUUID(), UUID.randomUUID(), A,
                "model.enterprise.fixture", A, B, C,
                "user_confirmed", D,
                Instant.parse("2026-08-27T12:15:00Z"), 300_000);
    }

    private static ModelEndpointBindingResolver resolver() {
        var binding = new ModelEndpointBinding(
                "binding.enterprise.fixture", A, A,
                "model.enterprise.fixture", "upstream-fixture", A, B, C,
                ModelEndpointBinding.ConnectionMode.DIRECT_PROVIDER,
                ModelEndpointBinding.Protocol.OPENAI_COMPATIBLE,
                URI.create("https://provider.invalid/v1"),
                "credential.enterprise.fixture", A, B, D,
                ModelEndpointBinding.RecoveryMode.QUERY_THEN_RETRY);
        return new ModelEndpointBindingResolver() {
            @Override public ModelEndpointBinding resolveForSelection(
                    ModelEndpointBinding.Selection selection) {
                return binding;
            }
            @Override public ModelEndpointBinding resolveDispatchDecision(String digest) {
                return binding;
            }
        };
    }

    private static final class CountingRuntime implements ModelInvocationV1Alpha3Runtime {
        private int acceptCount;
        @Override public ModelInvocation accept(String token, AcceptCommand command) {
            acceptCount++;
            throw new AssertionError("must not accept");
        }
        @Override public ModelInvocation acceptV1Alpha2(
                String token, AcceptCommand command, String session, String cache) {
            acceptCount++;
            throw new AssertionError("must not accept");
        }
        @Override public ModelInvocation execute(UUID id, String node) {
            throw new UnsupportedOperationException();
        }
        @Override public ModelInvocation recover(UUID id, String node) {
            throw new UnsupportedOperationException();
        }
        @Override public ModelInvocation requestCancel(
                String token, UUID id, long revision, String reason) {
            throw new UnsupportedOperationException();
        }
        @Override public ModelInvocation status(String token, UUID id) {
            throw new UnsupportedOperationException();
        }
        @Override public List<ModelInvocationDurableEvent> durableEvents(
                String token, UUID id, long after, int limit) {
            return List.of();
        }
    }
}
