package com.robothree.central.modelgateway.provider;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.assertThatCode;

import com.robothree.central.modelgateway.adapter.http.JdkModelAuthorizedHttpTransport;
import com.robothree.central.modelgateway.adapter.http.StrictModelOutboundEndpointPolicy;
import com.robothree.central.modelgateway.application.ModelGatewayException;
import com.robothree.central.modelgateway.port.ModelAuthorizedHttpTransport;
import java.net.InetAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

class ModelProviderTransportSecurityTest {

    @Test
    void directAndRelayBindingsUseIndependentEndpointPolicies() {
        StrictModelOutboundEndpointPolicy directProviderPolicy =
                new StrictModelOutboundEndpointPolicy(
                        Set.of("direct-provider.example"),
                        host -> new InetAddress[] {
                            InetAddress.getByName("203.0.113.10")
                        },
                        false);
        StrictModelOutboundEndpointPolicy customRelayPolicy =
                new StrictModelOutboundEndpointPolicy(
                        Set.of("custom-relay.example"),
                        host -> new InetAddress[] {
                            InetAddress.getByName("203.0.113.11")
                        },
                        false);

        assertThatCode(() -> directProviderPolicy.validate(
                        URI.create("https://direct-provider.example/v1")))
                .doesNotThrowAnyException();
        assertThatCode(() -> customRelayPolicy.validate(
                        URI.create("https://custom-relay.example/gateway")))
                .doesNotThrowAnyException();
        assertCode(
                () -> directProviderPolicy.validate(
                        URI.create("https://custom-relay.example/gateway")),
                "model_gateway.endpoint_not_allowed");
        assertCode(
                () -> customRelayPolicy.validate(
                        URI.create("https://direct-provider.example/v1")),
                "model_gateway.endpoint_not_allowed");
    }

    @Test
    void productionPolicyRejectsPrivateAndUnapprovedDestinations() {
        StrictModelOutboundEndpointPolicy privatePolicy =
                new StrictModelOutboundEndpointPolicy(
                        Set.of("provider.example"),
                        host -> new InetAddress[] {
                            InetAddress.getByName("10.0.0.8")
                        },
                        false);
        assertCode(
                () -> privatePolicy.validate(URI.create("https://provider.example/v1")),
                "model_gateway.endpoint_not_allowed");

        StrictModelOutboundEndpointPolicy allowlist =
                new StrictModelOutboundEndpointPolicy(
                        Set.of("approved.example"),
                        host -> new InetAddress[] {
                            InetAddress.getByName("203.0.113.10")
                        },
                        false);
        assertCode(
                () -> allowlist.validate(URI.create("https://other.example/v1")),
                "model_gateway.endpoint_not_allowed");
        assertCode(
                () -> allowlist.validate(URI.create("http://approved.example/v1")),
                "model_gateway.endpoint_not_allowed");
        assertCode(
                () -> allowlist.validate(URI.create(
                        "https://user@approved.example/v1")),
                "model_gateway.endpoint_not_allowed");
        assertCode(
                () -> allowlist.validate(URI.create(
                        "https://approved.example/base/../admin")),
                "model_gateway.endpoint_not_allowed");
    }

    @Test
    void endpointPolicyRejectsAmbiguousAndReboundableDestinations() {
        StrictModelOutboundEndpointPolicy allowlist =
                new StrictModelOutboundEndpointPolicy(
                        Set.of("approved.example"),
                        host -> new InetAddress[] {
                            InetAddress.getByName("203.0.113.10")
                        },
                        false);
        for (URI endpoint : java.util.List.of(
                URI.create("https://approved.example/v1?target=other"),
                URI.create("https://approved.example/v1#fragment"),
                URI.create("https://approved.example/" + "x".repeat(1_001)))) {
            assertCode(
                    () -> allowlist.validate(endpoint),
                    "model_gateway.endpoint_not_allowed");
        }

        for (String address : java.util.List.of(
                "127.0.0.1",
                "169.254.1.1",
                "10.0.0.8",
                "224.0.0.1")) {
            StrictModelOutboundEndpointPolicy restricted =
                    new StrictModelOutboundEndpointPolicy(
                            Set.of("approved.example"),
                            host -> new InetAddress[] {
                                InetAddress.getByName(address)
                            },
                            false);
            assertCode(
                    () -> restricted.validate(
                            URI.create("https://approved.example/v1")),
                    "model_gateway.endpoint_not_allowed");
        }

        StrictModelOutboundEndpointPolicy emptyResolution =
                new StrictModelOutboundEndpointPolicy(
                        Set.of("approved.example"),
                        host -> new InetAddress[0],
                        false);
        assertCode(
                () -> emptyResolution.validate(
                        URI.create("https://approved.example/v1")),
                "model_gateway.endpoint_not_allowed");
    }

    @Test
    void transportRejectsRedirectFollowingClientsAndUnsafeHeaders() {
        assertThatThrownBy(() -> new JdkModelAuthorizedHttpTransport(
                        HttpClient.newBuilder()
                                .followRedirects(HttpClient.Redirect.ALWAYS)
                                .build(),
                        (reference, revision) -> "fixture".toCharArray(),
                        endpoint -> {}))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("redirects");

        JdkModelAuthorizedHttpTransport transport =
                new JdkModelAuthorizedHttpTransport(
                        HttpClient.newBuilder()
                                .followRedirects(HttpClient.Redirect.NEVER)
                                .build(),
                        (reference, revision) -> "fixture".toCharArray(),
                        endpoint -> {});
        ModelAuthorizedHttpTransport.Request request =
                new ModelAuthorizedHttpTransport.Request(
                        URI.create("https://provider.example/base"),
                        "v1/messages",
                        ModelAuthorizedHttpTransport.AuthorizationScheme.BEARER,
                        "credential.fixture",
                        "a".repeat(64),
                        Map.of("Authorization", "forbidden"),
                        "{}".getBytes(java.nio.charset.StandardCharsets.UTF_8),
                        Duration.ofSeconds(1),
                        1024);
        assertCode(
                () -> transport.post(request),
                "model_gateway.provider_header_invalid");

        for (Map<String, String> headers : java.util.List.of(
                Map.of("X-Arbitrary", "not-allowed"),
                Map.of("traceparent", "invalid"),
                Map.of("tracestate", "line1\r\nInjected: true"))) {
            ModelAuthorizedHttpTransport.Request unsafe =
                    new ModelAuthorizedHttpTransport.Request(
                            URI.create("https://provider.example/base"),
                            "v1/messages",
                            ModelAuthorizedHttpTransport.AuthorizationScheme.BEARER,
                            "credential.fixture",
                            "a".repeat(64),
                            headers,
                            "{}".getBytes(java.nio.charset.StandardCharsets.UTF_8),
                            Duration.ofSeconds(1),
                            1024);
            assertCode(
                    () -> transport.post(unsafe),
                    "model_gateway.provider_header_invalid");
        }
    }

    @Test
    void transportRejectsArbitraryRelativeRoutes() {
        JdkModelAuthorizedHttpTransport transport =
                new JdkModelAuthorizedHttpTransport(
                        HttpClient.newBuilder()
                                .followRedirects(HttpClient.Redirect.NEVER)
                                .build(),
                        (reference, revision) -> "fixture".toCharArray(),
                        endpoint -> {});
        for (String route : java.util.List.of(
                "/absolute",
                "../escape",
                "%2e%2e/escape",
                "safe/%2fescape",
                "safe\\escape",
                "v1/messages?target=other",
                "v1/messages#fragment")) {
            ModelAuthorizedHttpTransport.Request request =
                    new ModelAuthorizedHttpTransport.Request(
                            URI.create("https://provider.example/base"),
                            route,
                            ModelAuthorizedHttpTransport.AuthorizationScheme.BEARER,
                            "credential.fixture",
                            "a".repeat(64),
                            Map.of(),
                            "{}".getBytes(java.nio.charset.StandardCharsets.UTF_8),
                            Duration.ofSeconds(1),
                            1024);
            assertCode(
                    () -> transport.post(request),
                    "model_gateway.provider_route_invalid");
        }
    }

    @Test
    void transportRejectsUnavailableCredentialMaterialBeforeNetwork() {
        for (char[] credential : java.util.List.of(
                new char[0],
                "line\nbreak".toCharArray(),
                "x".repeat(16_385).toCharArray())) {
            JdkModelAuthorizedHttpTransport transport =
                    new JdkModelAuthorizedHttpTransport(
                            HttpClient.newBuilder()
                                    .followRedirects(HttpClient.Redirect.NEVER)
                                    .build(),
                            (reference, revision) -> credential.clone(),
                            endpoint -> {});
            ModelAuthorizedHttpTransport.Request request =
                    new ModelAuthorizedHttpTransport.Request(
                            URI.create("https://provider.example/base"),
                            "v1/messages",
                            ModelAuthorizedHttpTransport.AuthorizationScheme.BEARER,
                            "credential.fixture",
                            "a".repeat(64),
                            Map.of(),
                            "{}".getBytes(java.nio.charset.StandardCharsets.UTF_8),
                            Duration.ofSeconds(1),
                            1024);
            assertCode(
                    () -> transport.post(request),
                    "model_gateway.credential_unavailable");
        }
    }

    private static void assertCode(Runnable action, String code) {
        assertThatThrownBy(action::run)
                .isInstanceOfSatisfying(
                        ModelGatewayException.class,
                        error -> org.assertj.core.api.Assertions.assertThat(error.code())
                                .isEqualTo(code));
    }
}
