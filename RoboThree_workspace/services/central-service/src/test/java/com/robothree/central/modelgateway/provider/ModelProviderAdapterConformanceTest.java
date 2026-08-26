package com.robothree.central.modelgateway.provider;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.modelgateway.adapter.http.JdkModelAuthorizedHttpTransport;
import com.robothree.central.modelgateway.adapter.http.StrictModelOutboundEndpointPolicy;
import com.robothree.central.modelgateway.adapter.provider.AnthropicCompatibleModelProviderAdapter;
import com.robothree.central.modelgateway.adapter.provider.OpenAiCompatibleModelProviderAdapter;
import com.robothree.central.modelgateway.application.ModelGatewayException;
import com.robothree.central.modelgateway.application.VersionedPromptCacheMarkerPolicyRegistry;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding.ConnectionMode;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding.Protocol;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding.RecoveryMode;
import com.robothree.central.modelgateway.domain.ProviderCacheProjection;
import com.robothree.central.modelgateway.port.ModelProviderAdapter;
import com.robothree.central.modelgateway.port.ModelStreamSink;
import com.robothree.central.shared.json.CanonicalJson;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.Test;

class ModelProviderAdapterConformanceTest {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String CREDENTIAL_SENTINEL =
            "credential-sentinel-cgf2b1-never-log";
    private static final String TRACE_PARENT =
            "00-11111111111111111111111111111111-2222222222222222-01";

    @Test
    void projectsAnthropicAndOpenAiStreamsToTheSameNeutralEvents()
            throws Exception {
        try (StubProviderServer server = new StubProviderServer()) {
            server.respond(
                    "/base/chat/completions",
                    StubResponse.stream(openAiHappyStream()));
            server.respond(
                    "/base/v1/messages",
                    StubResponse.stream(anthropicHappyStream().replace("\n", "\r\n")));

            CredentialSource credentials = new CredentialSource();
            List<ModelProviderStreamEvent> openAi =
                    invoke(server, Protocol.OPENAI_COMPATIBLE, credentials);
            assertThat(credentials.lastMaterial()).containsOnly('\0');
            List<ModelProviderStreamEvent> anthropic =
                    invoke(server, Protocol.ANTHROPIC_COMPATIBLE, credentials);
            assertThat(credentials.lastMaterial()).containsOnly('\0');

            assertThat(openAi).containsExactlyElementsOf(anthropic);
            assertThat(openAi).containsExactly(
                    new ModelProviderStreamEvent.TextDelta("你好"),
                    new ModelProviderStreamEvent.ToolCallDelta(
                            0,
                            "tool-1",
                            "echo",
                            null),
                    new ModelProviderStreamEvent.ToolCallDelta(
                            0,
                            null,
                            null,
                            "{\"value\":1}"),
                    new ModelProviderStreamEvent.Usage(8, 4),
                    new ModelProviderStreamEvent.Terminal("tool_use"));
            assertThat(server.request("/base/chat/completions").method()).isEqualTo("POST");
            assertThat(server.request("/base/v1/messages").method()).isEqualTo("POST");
            assertThat(server.request("/base/chat/completions")
                            .firstHeader("Authorization"))
                    .isEqualTo("Bearer " + CREDENTIAL_SENTINEL);
            assertThat(server.request("/base/v1/messages").firstHeader("x-api-key"))
                    .isEqualTo(CREDENTIAL_SENTINEL);
            assertThat(server.request("/base/v1/messages")
                            .firstHeader("anthropic-version"))
                    .isEqualTo("2023-06-01");
            assertThat(server.request("/base/chat/completions")
                            .firstHeader("traceparent"))
                    .isEqualTo(TRACE_PARENT);
            assertThat(server.request("/base/v1/messages")
                            .firstHeader("traceparent"))
                    .isEqualTo(TRACE_PARENT);
            assertThat(server.request("/base/chat/completions").body())
                    .contains("\"stream\":true")
                    .contains("\"model\":\"model.synthetic\"");
            assertThat(server.request("/base/v1/messages").body())
                    .contains("\"stream\":true")
                    .contains("\"model\":\"model.synthetic\"");
        }
    }

    @Test
    void projectsReviewedAnthropicSystemMarkerExactlyOnceWithoutTtl()
            throws Exception {
        try (StubProviderServer server = new StubProviderServer()) {
            server.respond(
                    path(Protocol.ANTHROPIC_COMPATIBLE),
                    StubResponse.stream(anthropicHappyStream()));
            var policy = markerPolicy(
                    VersionedPromptCacheMarkerPolicyRegistry.ANTHROPIC_SYSTEM_POLICY_ID);
            ModelProviderRequest request = cacheRequest(
                    server,
                    Protocol.ANTHROPIC_COMPATIBLE,
                    ProviderCacheProjection.AnthropicExplicit.of(policy));

            adapter(Protocol.ANTHROPIC_COMPATIBLE, server, new CredentialSource())
                    .stream(request, new CollectingSink());

            ObjectNode body = JSON.readValue(
                    server.request(path(Protocol.ANTHROPIC_COMPATIBLE)).body(),
                    ObjectNode.class);
            assertThat(body.path("system").size()).isEqualTo(2);
            assertThat(body.path("system").get(0).has("cache_control")).isFalse();
            assertThat(body.path("system").get(1).path("cache_control").path("type")
                            .asText())
                    .isEqualTo("ephemeral");
            assertThat(body.toString()).containsOnlyOnce("cache_control");
            assertThat(body.toString()).doesNotContain("ttl");
            assertThat(body.path("messages").toString()).doesNotContain("cache_control");
            assertThat(body.path("tools").get(0).path("name").asText())
                    .isEqualTo("alpha");
            assertThat(body.path("tools").get(1).path("name").asText())
                    .isEqualTo("zeta");
        }
    }

    @Test
    void projectsReviewedAnthropicToolMarkerExactlyOnce() throws Exception {
        try (StubProviderServer server = new StubProviderServer()) {
            server.respond(
                    path(Protocol.ANTHROPIC_COMPATIBLE),
                    StubResponse.stream(anthropicHappyStream()));
            var policy = markerPolicy(
                    VersionedPromptCacheMarkerPolicyRegistry.ANTHROPIC_TOOL_POLICY_ID);

            adapter(Protocol.ANTHROPIC_COMPATIBLE, server, new CredentialSource())
                    .stream(
                            cacheRequest(
                                    server,
                                    Protocol.ANTHROPIC_COMPATIBLE,
                                    ProviderCacheProjection.AnthropicExplicit.of(policy)),
                            new CollectingSink());

            ObjectNode body = JSON.readValue(
                    server.request(path(Protocol.ANTHROPIC_COMPATIBLE)).body(),
                    ObjectNode.class);
            assertThat(body.path("tools").get(0).has("cache_control")).isFalse();
            assertThat(body.path("tools").get(1).path("cache_control").path("type")
                            .asText())
                    .isEqualTo("ephemeral");
            assertThat(body.toString()).containsOnlyOnce("cache_control");
            assertThat(body.path("system").toString()).doesNotContain("cache_control");
        }
    }

    @Test
    void keepsOpenAiDisabledAndAutomaticObservedBodiesCacheFieldFree()
            throws Exception {
        for (ProviderCacheProjection projection : List.of(
                ProviderCacheProjection.Disabled.of("profile_disabled"),
                ProviderCacheProjection.OpenAiAutomaticObserved.create())) {
            try (StubProviderServer server = new StubProviderServer()) {
                server.respond(
                        path(Protocol.OPENAI_COMPATIBLE),
                        StubResponse.stream(openAiHappyStream()));

                adapter(Protocol.OPENAI_COMPATIBLE, server, new CredentialSource())
                        .stream(
                                cacheRequest(
                                        server,
                                        Protocol.OPENAI_COMPATIBLE,
                                        projection),
                                new CollectingSink());

                String body = server.request(path(Protocol.OPENAI_COMPATIBLE)).body();
                assertThat(body)
                        .doesNotContain("prompt_cache_key")
                        .doesNotContain("cache_control")
                        .doesNotContain("prompt_cache_retention");
            }
        }
    }

    @Test
    void projectsOpenAiExplicitKeyAndCanonicalToolOrderWithoutRetention()
            throws Exception {
        try (StubProviderServer server = new StubProviderServer()) {
            server.respond(
                    path(Protocol.OPENAI_COMPATIBLE),
                    StubResponse.stream(openAiHappyStream()));
            var policy = markerPolicy(
                    VersionedPromptCacheMarkerPolicyRegistry.OPENAI_KEY_POLICY_ID);
            String key = "f".repeat(64);

            adapter(Protocol.OPENAI_COMPATIBLE, server, new CredentialSource())
                    .stream(
                            cacheRequest(
                                    server,
                                    Protocol.OPENAI_COMPATIBLE,
                                    ProviderCacheProjection.OpenAiPromptCacheKey.of(
                                            key,
                                            64,
                                            policy.policyRevision())),
                            new CollectingSink());

            ObjectNode body = JSON.readValue(
                    server.request(path(Protocol.OPENAI_COMPATIBLE)).body(),
                    ObjectNode.class);
            assertThat(body.path("prompt_cache_key").asText()).isEqualTo(key);
            assertThat(body.toString())
                    .doesNotContain("cache_control")
                    .doesNotContain("prompt_cache_retention");
            assertThat(body.path("tools").get(0).path("function").path("name")
                            .asText())
                    .isEqualTo("alpha");
            assertThat(body.path("tools").get(1).path("function").path("name")
                            .asText())
                    .isEqualTo("zeta");
        }
    }

    @Test
    void rejectsCacheProjectionProtocolMismatchBeforeSending() throws Exception {
        try (StubProviderServer server = new StubProviderServer()) {
            var anthropic = ProviderCacheProjection.AnthropicExplicit.of(markerPolicy(
                    VersionedPromptCacheMarkerPolicyRegistry.ANTHROPIC_SYSTEM_POLICY_ID));
            assertError(
                    adapter(Protocol.OPENAI_COMPATIBLE, server, new CredentialSource()),
                    cacheRequest(server, Protocol.OPENAI_COMPATIBLE, anthropic),
                    "model_gateway.cache_projection_invalid");
            assertThat(server.requests()).isEmpty();
        }
    }

    @Test
    void rejectsMissingReviewedAnthropicMarkerTargetWithoutFallback()
            throws Exception {
        try (StubProviderServer server = new StubProviderServer()) {
            var systemPolicy = markerPolicy(
                    VersionedPromptCacheMarkerPolicyRegistry.ANTHROPIC_SYSTEM_POLICY_ID);
            assertError(
                    adapter(Protocol.ANTHROPIC_COMPATIBLE, server, new CredentialSource()),
                    cacheRequest(
                            server,
                            Protocol.ANTHROPIC_COMPATIBLE,
                            ProviderCacheProjection.AnthropicExplicit.of(systemPolicy),
                            providerNeutralRequest()),
                    "model_gateway.cache_projection_invalid");
            assertThat(server.requests()).isEmpty();
        }
        try (StubProviderServer server = new StubProviderServer()) {
            ObjectNode withoutTools = CanonicalJson.parseObject(
                    cacheProviderNeutralRequest(),
                    4 * 1024 * 1024);
            withoutTools.putArray("tools");
            String canonical = CanonicalJson.canonicalize(withoutTools);
            var toolPolicy = markerPolicy(
                    VersionedPromptCacheMarkerPolicyRegistry.ANTHROPIC_TOOL_POLICY_ID);
            assertError(
                    adapter(Protocol.ANTHROPIC_COMPATIBLE, server, new CredentialSource()),
                    cacheRequest(
                            server,
                            Protocol.ANTHROPIC_COMPATIBLE,
                            ProviderCacheProjection.AnthropicExplicit.of(toolPolicy),
                            canonical),
                    "model_gateway.cache_projection_invalid");
            assertThat(server.requests()).isEmpty();
        }
    }

    @Test
    void validatesButDoesNotProjectAnthropicThinkingOrSignatureDeltas()
            throws Exception {
        try (StubProviderServer server = new StubProviderServer()) {
            server.respond(
                    path(Protocol.ANTHROPIC_COMPATIBLE),
                    StubResponse.stream(anthropicThinkingStream()));

            List<ModelProviderStreamEvent> events = invoke(
                    server,
                    Protocol.ANTHROPIC_COMPATIBLE,
                    new CredentialSource());

            assertThat(events).containsExactly(
                    new ModelProviderStreamEvent.TextDelta("最终答案"),
                    new ModelProviderStreamEvent.Usage(8, 6),
                    new ModelProviderStreamEvent.Terminal("stop"));
        }
    }

    @Test
    void ignoresOpenAiEmptyAndBlankContentDeltas() throws Exception {
        try (StubProviderServer server = new StubProviderServer()) {
            server.respond(
                    path(Protocol.OPENAI_COMPATIBLE),
                    StubResponse.stream(openAiEmptyAndBlankContentStream()));

            List<ModelProviderStreamEvent> events = invoke(
                    server,
                    Protocol.OPENAI_COMPATIBLE,
                    new CredentialSource());

            assertThat(events).containsExactly(
                    new ModelProviderStreamEvent.TextDelta("最终答案"),
                    new ModelProviderStreamEvent.Usage(8, 6),
                    new ModelProviderStreamEvent.Terminal("stop"));
        }
    }

    @Test
    void foldsMonotonicOpenAiUsageUpdatesIntoOneFinalUsage() throws Exception {
        try (StubProviderServer server = new StubProviderServer()) {
            server.respond(
                    path(Protocol.OPENAI_COMPATIBLE),
                    StubResponse.stream(
                            "data: {\"choices\":[],\"usage\":{\"prompt_tokens\":8,"
                                    + "\"completion_tokens\":0}}\n\n"
                                    + "data: {\"choices\":[{\"delta\":{\"content\":"
                                    + "\"最终答案\"},\"finish_reason\":null}],\"usage\":{"
                                    + "\"prompt_tokens\":8,\"completion_tokens\":1}}\n\n"
                                    + "data: {\"choices\":[{\"delta\":{},"
                                    + "\"finish_reason\":\"stop\"}],\"usage\":{"
                                    + "\"prompt_tokens\":8,\"completion_tokens\":2}}\n\n"
                                    + "data: {\"choices\":[],\"usage\":{"
                                    + "\"prompt_tokens\":8,\"completion_tokens\":2}}\n\n"
                                    + "data: [DONE]\n\n"));

            List<ModelProviderStreamEvent> events = invoke(
                    server,
                    Protocol.OPENAI_COMPATIBLE,
                    new CredentialSource());

            assertThat(events).containsExactly(
                    new ModelProviderStreamEvent.TextDelta("最终答案"),
                    new ModelProviderStreamEvent.Usage(8, 2),
                    new ModelProviderStreamEvent.Terminal("stop"));
        }
    }

    @Test
    void preservesOptionalCacheAndReasoningBreakdownsWithoutChangingNeutralTotals()
            throws Exception {
        try (StubProviderServer server = new StubProviderServer()) {
            server.respond(
                    path(Protocol.OPENAI_COMPATIBLE),
                    StubResponse.stream(openAiHappyStream().replace(
                            "\"completion_tokens\":4",
                            "\"completion_tokens\":4,\"prompt_tokens_details\":{"
                                    + "\"cached_tokens\":3},\"completion_tokens_details\":{"
                                    + "\"reasoning_tokens\":2}")));
            List<ModelProviderStreamEvent> events = invoke(
                    server,
                    Protocol.OPENAI_COMPATIBLE,
                    new CredentialSource());

            assertThat(events).filteredOn(ModelProviderStreamEvent.Usage.class::isInstance)
                    .containsExactly(new ModelProviderStreamEvent.Usage(8, 4, 3L, null, 2L));
        }
        try (StubProviderServer server = new StubProviderServer()) {
            server.respond(
                    path(Protocol.ANTHROPIC_COMPATIBLE),
                    StubResponse.stream(anthropicHappyStream().replace(
                            "{\"input_tokens\":8}",
                            "{\"input_tokens\":8,\"cache_read_input_tokens\":3,"
                                    + "\"cache_creation_input_tokens\":2}")));
            List<ModelProviderStreamEvent> events = invoke(
                    server,
                    Protocol.ANTHROPIC_COMPATIBLE,
                    new CredentialSource());

            assertThat(events).filteredOn(ModelProviderStreamEvent.Usage.class::isInstance)
                    .containsExactly(new ModelProviderStreamEvent.Usage(8, 4, 3L, 2L, null));
        }
    }

    @Test
    void usesTheLockedUpstreamModelWithoutChangingTheNeutralModelIdentity()
            throws Exception {
        for (Protocol protocol : Protocol.values()) {
            try (StubProviderServer server = new StubProviderServer()) {
                server.respond(
                        path(protocol),
                        StubResponse.stream(protocol == Protocol.OPENAI_COMPATIBLE
                                ? openAiHappyStream()
                                : anthropicHappyStream()));
                String canonical = providerNeutralRequest();
                ModelProviderRequest request = new ModelProviderRequest(
                        UUID.randomUUID(),
                        CanonicalJson.sha256(canonical),
                        canonical,
                        binding(server, protocol, "relay.upstream-model"),
                        Instant.now().plusSeconds(3),
                        Duration.ofSeconds(1));

                adapter(protocol, server, new CredentialSource())
                        .stream(request, new CollectingSink());

                assertThat(request.requestDocument()
                                .path("model")
                                .path("modelId")
                                .asText())
                        .isEqualTo("model.synthetic");
                assertThat(server.request(path(protocol)).body())
                        .contains("\"model\":\"relay.upstream-model\"")
                        .doesNotContain("\"model\":\"model.synthetic\"");
            }
        }
    }

    @Test
    void rejectsProtocolMismatchBeforeSending() throws Exception {
        try (StubProviderServer server = new StubProviderServer()) {
            ModelProviderAdapter adapter = adapter(
                    Protocol.OPENAI_COMPATIBLE,
                    server,
                    new CredentialSource());
            assertThatThrownBy(() -> adapter.stream(
                            request(server, Protocol.ANTHROPIC_COMPATIBLE, Duration.ofSeconds(1)),
                            new CollectingSink()))
                    .isInstanceOfSatisfying(
                            ModelGatewayException.class,
                            error -> assertThat(error.code())
                                    .isEqualTo("model_gateway.provider_protocol_mismatch"));
            assertThat(server.requests()).isEmpty();
        }
    }

    @Test
    void bothAdaptersRejectMalformedIncompleteAndWrongContentType()
            throws Exception {
        for (Protocol protocol : Protocol.values()) {
            try (StubProviderServer server = new StubProviderServer()) {
                server.respond(path(protocol), StubResponse.stream("data: {invalid}\n\n"));
                assertError(
                        adapter(protocol, server, new CredentialSource()),
                        request(server, protocol, Duration.ofSeconds(1)),
                        "model_gateway.provider_event_invalid");
            }
            try (StubProviderServer server = new StubProviderServer()) {
                server.respond(
                        path(protocol),
                        new StubResponse(200, "application/json", "{}".getBytes(
                                StandardCharsets.UTF_8), 0, 0));
                assertError(
                        adapter(protocol, server, new CredentialSource()),
                        request(server, protocol, Duration.ofSeconds(1)),
                        "model_gateway.provider_content_type_invalid");
            }
            try (StubProviderServer server = new StubProviderServer()) {
                String partial = protocol == Protocol.OPENAI_COMPATIBLE
                        ? "data: {\"choices\":[{\"delta\":{\"content\":\"x\"},"
                                + "\"finish_reason\":null}]}\n\n"
                        : "event: content_block_delta\n"
                                + "data: {\"type\":\"content_block_delta\",\"index\":0,"
                                + "\"delta\":{\"type\":\"text_delta\",\"text\":\"x\"}}\n\n";
                server.respond(path(protocol), StubResponse.stream(partial));
                assertError(
                        adapter(protocol, server, new CredentialSource()),
                        request(server, protocol, Duration.ofSeconds(1)),
                        "model_gateway.provider_stream_incomplete");
            }
        }
    }

    @Test
    void bothAdaptersMapHttpFailuresWithoutReadingErrorBodies()
            throws Exception {
        List<Integer> statuses = List.of(301, 302, 303, 307, 308, 401, 403, 429, 503);
        for (Protocol protocol : Protocol.values()) {
            for (int status : statuses) {
                try (StubProviderServer server = new StubProviderServer()) {
                    String expected = switch (status) {
                        case 301, 302, 303, 307, 308 ->
                                "model_gateway.provider_redirect_rejected";
                        case 401, 403 -> "model_gateway.provider_unauthorized";
                        case 429 -> "model_gateway.provider_rate_limited";
                        case 503 -> "model_gateway.provider_unavailable";
                        default -> throw new IllegalStateException("unexpected status");
                    };
                    server.respond(
                            path(protocol),
                            new StubResponse(
                                    status,
                                    "application/json",
                                    "{\"safe\":\"error\"}".getBytes(StandardCharsets.UTF_8),
                                    0,
                                    0,
                                    status >= 300 && status < 400
                                            ? Map.of("Location", server.baseUri()
                                                    + "/redirect-target")
                                            : Map.of()));
                    assertError(
                            adapter(protocol, server, new CredentialSource()),
                            request(server, protocol, Duration.ofSeconds(1)),
                            expected);
                    if (status >= 300 && status < 400) {
                        assertThat(server.request("/base/redirect-target")).isNull();
                    }
                }
            }
        }
    }

    @Test
    void rejectsOversizedFramesAndNonMonotonicUsage() throws Exception {
        try (StubProviderServer server = new StubProviderServer()) {
            server.respond(
                    path(Protocol.OPENAI_COMPATIBLE),
                    StubResponse.stream("data: " + "x".repeat(262_145) + "\n\n"));
            assertError(
                    adapter(
                            Protocol.OPENAI_COMPATIBLE,
                            server,
                            new CredentialSource()),
                    request(server, Protocol.OPENAI_COMPATIBLE, Duration.ofSeconds(1)),
                    "model_gateway.provider_frame_oversized");
        }
        try (StubProviderServer server = new StubProviderServer()) {
            server.respond(
                    path(Protocol.OPENAI_COMPATIBLE),
                    StubResponse.stream(
                            "data: {\"choices\":[],\"usage\":{\"prompt_tokens\":1,"
                                    + "\"completion_tokens\":1}}\n\n"
                                    + "data: {\"choices\":[],\"usage\":{\"prompt_tokens\":1,"
                                    + "\"completion_tokens\":0}}\n\n"));
            assertError(
                    adapter(
                            Protocol.OPENAI_COMPATIBLE,
                            server,
                            new CredentialSource()),
                    request(server, Protocol.OPENAI_COMPATIBLE, Duration.ofSeconds(1)),
                    "model_gateway.provider_usage_conflict");
        }
    }

    @Test
    void rejectsInvalidUtf8OversizedHeadersAndOversizedToolArguments()
            throws Exception {
        try (StubProviderServer server = new StubProviderServer()) {
            server.respond(
                    path(Protocol.OPENAI_COMPATIBLE),
                    new StubResponse(
                            200,
                            "text/event-stream",
                            new byte[] {'d', 'a', 't', 'a', ':', ' ', (byte) 0xc3,
                                (byte) 0x28, '\n', '\n'},
                            0,
                            0));
            assertError(
                    adapter(Protocol.OPENAI_COMPATIBLE, server, new CredentialSource()),
                    request(server, Protocol.OPENAI_COMPATIBLE, Duration.ofSeconds(1)),
                    "model_gateway.provider_stream_utf8_invalid");
        }
        try (StubProviderServer server = new StubProviderServer()) {
            server.respond(
                    path(Protocol.ANTHROPIC_COMPATIBLE),
                    new StubResponse(
                            200,
                            "text/event-stream",
                            anthropicHappyStream().getBytes(StandardCharsets.UTF_8),
                            0,
                            0,
                            Map.of("X-Bounded-Test", "x".repeat(32_768))));
            assertError(
                    adapter(Protocol.ANTHROPIC_COMPATIBLE, server, new CredentialSource()),
                    request(server, Protocol.ANTHROPIC_COMPATIBLE, Duration.ofSeconds(1)),
                    "model_gateway.provider_headers_oversized");
        }
        try (StubProviderServer server = new StubProviderServer()) {
            StringBuilder stream = new StringBuilder();
            stream.append("data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,")
                    .append("\"id\":\"tool-1\",\"function\":{\"name\":\"echo\",")
                    .append("\"arguments\":\"{\\\"value\\\":\\\"\"}}]},")
                    .append("\"finish_reason\":null}]}\n\n");
            for (int index = 0; index < 5; index++) {
                stream.append("data: {\"choices\":[{\"delta\":{\"tool_calls\":[{")
                        .append("\"index\":0,\"function\":{\"arguments\":\"")
                        .append("x".repeat(220_000))
                        .append("\"}}]},\"finish_reason\":null}]}\n\n");
            }
            server.respond(
                    path(Protocol.OPENAI_COMPATIBLE),
                    StubResponse.stream(stream.toString()));
            assertError(
                    adapter(Protocol.OPENAI_COMPATIBLE, server, new CredentialSource()),
                    request(server, Protocol.OPENAI_COMPATIBLE, Duration.ofSeconds(2)),
                    "model_gateway.provider_tool_arguments_oversized");
        }
    }

    @Test
    void rejectsMissingUsageUnknownFinishLateEventsAndInvalidToolArguments()
            throws Exception {
        for (Protocol protocol : Protocol.values()) {
            try (StubProviderServer server = new StubProviderServer()) {
                String stream = protocol == Protocol.OPENAI_COMPATIBLE
                        ? "data: {\"choices\":[{\"delta\":{},"
                                + "\"finish_reason\":\"stop\"}]}\n\n"
                                + "data: [DONE]\n\n"
                        : "event: message_delta\n"
                                + "data: {\"type\":\"message_delta\",\"delta\":"
                                + "{\"stop_reason\":\"end_turn\"}}\n\n"
                                + "event: message_stop\n"
                                + "data: {\"type\":\"message_stop\"}\n\n";
                server.respond(path(protocol), StubResponse.stream(stream));
                assertError(
                        adapter(protocol, server, new CredentialSource()),
                        request(server, protocol, Duration.ofSeconds(1)),
                        "model_gateway.provider_usage_missing");
            }
        }
        try (StubProviderServer server = new StubProviderServer()) {
            server.respond(
                    path(Protocol.OPENAI_COMPATIBLE),
                    StubResponse.stream(
                            "data: {\"choices\":[{\"delta\":{},"
                                    + "\"finish_reason\":\"unexpected\"}],\"usage\":"
                                    + "{\"prompt_tokens\":1,\"completion_tokens\":1}}\n\n"
                                    + "data: [DONE]\n\n"));
            assertError(
                    adapter(Protocol.OPENAI_COMPATIBLE, server, new CredentialSource()),
                    request(server, Protocol.OPENAI_COMPATIBLE, Duration.ofSeconds(1)),
                    "model_gateway.provider_finish_reason_unknown");
        }
        try (StubProviderServer server = new StubProviderServer()) {
            server.respond(
                    path(Protocol.OPENAI_COMPATIBLE),
                    StubResponse.stream(openAiHappyStream()
                            + "data: {\"choices\":[]}\n\n"));
            assertError(
                    adapter(Protocol.OPENAI_COMPATIBLE, server, new CredentialSource()),
                    request(server, Protocol.OPENAI_COMPATIBLE, Duration.ofSeconds(1)),
                    "model_gateway.provider_event_after_terminal");
        }
        try (StubProviderServer server = new StubProviderServer()) {
            String invalidArguments = openAiHappyStream()
                    .replace("{\\\"value\\\":1}", "{");
            server.respond(
                    path(Protocol.OPENAI_COMPATIBLE),
                    StubResponse.stream(invalidArguments));
            assertError(
                    adapter(Protocol.OPENAI_COMPATIBLE, server, new CredentialSource()),
                    request(server, Protocol.OPENAI_COMPATIBLE, Duration.ofSeconds(1)),
                    "model_gateway.provider_tool_arguments_invalid");
        }
    }

    @Test
    void bothAdaptersRejectBlankTextAndDuplicateToolCallIdentity()
            throws Exception {
        for (Protocol protocol : Protocol.values()) {
            try (StubProviderServer server = new StubProviderServer()) {
                String stream = protocol == Protocol.OPENAI_COMPATIBLE
                        ? "data: {\"choices\":[{\"delta\":{\"content\":\"   \"},"
                                + "\"finish_reason\":null}]}\n\n"
                                + "data: {\"choices\":[{\"delta\":{\"content\":\"ok\"},"
                                + "\"finish_reason\":\"stop\"}],\"usage\":{"
                                + "\"prompt_tokens\":1,\"completion_tokens\":1}}\n\n"
                                + "data: [DONE]\n\n"
                        : "event: message_start\n"
                                + "data: {\"type\":\"message_start\",\"message\":{"
                                + "\"usage\":{\"input_tokens\":1}}}\n\n"
                                + "event: content_block_delta\n"
                                + "data: {\"type\":\"content_block_delta\",\"index\":0,"
                                + "\"delta\":{\"type\":\"text_delta\",\"text\":\"   \"}}\n\n"
                                + "event: content_block_delta\n"
                                + "data: {\"type\":\"content_block_delta\",\"index\":0,"
                                + "\"delta\":{\"type\":\"text_delta\",\"text\":\"ok\"}}\n\n"
                                + "event: message_delta\n"
                                + "data: {\"type\":\"message_delta\",\"delta\":{"
                                + "\"stop_reason\":\"end_turn\"},\"usage\":{"
                                + "\"output_tokens\":1}}\n\n"
                                + "event: message_stop\n"
                                + "data: {\"type\":\"message_stop\"}\n\n";
                server.respond(path(protocol), StubResponse.stream(stream));
                assertThat(invoke(server, protocol, new CredentialSource()))
                        .containsExactly(
                                new ModelProviderStreamEvent.TextDelta("ok"),
                                new ModelProviderStreamEvent.Usage(1, 1),
                                new ModelProviderStreamEvent.Terminal("stop"));
            }
        }

        for (Protocol protocol : Protocol.values()) {
            try (StubProviderServer server = new StubProviderServer()) {
                String stream = duplicateToolCallIdentityStream(protocol);
                server.respond(path(protocol), StubResponse.stream(stream));
                assertError(
                        adapter(protocol, server, new CredentialSource()),
                        request(server, protocol, Duration.ofSeconds(1)),
                        "model_gateway.provider_tool_call_duplicate");
            }
        }
    }

    @Test
    void propagatesCancellationRequestDeadlineAndStreamIdleTimeout()
            throws Exception {
        try (StubProviderServer server = new StubProviderServer()) {
            server.respond(
                    path(Protocol.OPENAI_COMPATIBLE),
                    new StubResponse(
                            200,
                            "text/event-stream",
                            openAiHappyStream().getBytes(StandardCharsets.UTF_8),
                            0,
                            250));
            CollectingSink sink = new CollectingSink();
            sink.cancel();
            assertThatThrownBy(() -> adapter(
                                    Protocol.OPENAI_COMPATIBLE,
                                    server,
                                    new CredentialSource())
                            .stream(
                                    request(
                                            server,
                                            Protocol.OPENAI_COMPATIBLE,
                                            Duration.ofSeconds(1)),
                                    sink))
                    .isInstanceOfSatisfying(
                            ModelGatewayException.class,
                            error -> assertThat(error.code())
                                    .isEqualTo("model_gateway.provider_cancelled"));
        }
        try (StubProviderServer server = new StubProviderServer()) {
            server.respond(
                    path(Protocol.OPENAI_COMPATIBLE),
                    new StubResponse(
                            200,
                            "text/event-stream",
                            openAiHappyStream().getBytes(StandardCharsets.UTF_8),
                            250,
                            0));
            ModelProviderRequest deadline = request(
                    server,
                    Protocol.OPENAI_COMPATIBLE,
                    Duration.ofSeconds(1),
                    Instant.now().plusMillis(80));
            assertError(
                    adapter(
                            Protocol.OPENAI_COMPATIBLE,
                            server,
                            new CredentialSource()),
                    deadline,
                    "model_gateway.provider_request_timeout");
        }
        try (StubProviderServer server = new StubProviderServer()) {
            server.respond(
                    path(Protocol.ANTHROPIC_COMPATIBLE),
                    new StubResponse(
                            200,
                            "text/event-stream",
                            anthropicHappyStream().getBytes(StandardCharsets.UTF_8),
                            0,
                            250));
            ModelProviderRequest idle = request(
                    server,
                    Protocol.ANTHROPIC_COMPATIBLE,
                    Duration.ofMillis(80));
            assertError(
                    adapter(
                            Protocol.ANTHROPIC_COMPATIBLE,
                            server,
                            new CredentialSource()),
                    idle,
                    "model_gateway.provider_stream_idle_timeout");
        }
    }

    @Test
    void requestDigestMustMatchTheTransientCanonicalRequest() throws Exception {
        try (StubProviderServer server = new StubProviderServer()) {
            String canonical = providerNeutralRequest();
            assertThatThrownBy(() -> new ModelProviderRequest(
                            UUID.randomUUID(),
                            "0".repeat(64),
                            canonical,
                            binding(server, Protocol.OPENAI_COMPATIBLE),
                            Instant.now().plusSeconds(1),
                            Duration.ofSeconds(1)))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("requestDigest");
        }
    }

    private static List<ModelProviderStreamEvent> invoke(
            StubProviderServer server,
            Protocol protocol,
            CredentialSource credentials) {
        CollectingSink sink = new CollectingSink();
        adapter(protocol, server, credentials).stream(
                request(server, protocol, Duration.ofSeconds(1)),
                sink);
        return sink.events();
    }

    private static void assertError(
            ModelProviderAdapter adapter,
            ModelProviderRequest request,
            String code) {
        assertThatThrownBy(() -> adapter.stream(request, new CollectingSink()))
                .isInstanceOfSatisfying(
                        ModelGatewayException.class,
                        error -> assertThat(error.code()).isEqualTo(code));
    }

    private static ModelProviderAdapter adapter(
            Protocol protocol,
            StubProviderServer server,
            CredentialSource credentialSource) {
        JdkModelAuthorizedHttpTransport transport =
                new JdkModelAuthorizedHttpTransport(
                        HttpClient.newBuilder()
                                .followRedirects(HttpClient.Redirect.NEVER)
                                .connectTimeout(Duration.ofSeconds(1))
                                .build(),
                        credentialSource,
                        new StrictModelOutboundEndpointPolicy(
                                java.util.Set.of("127.0.0.1"),
                                host -> java.net.InetAddress.getAllByName(host),
                                true));
        return protocol == Protocol.OPENAI_COMPATIBLE
                ? new OpenAiCompatibleModelProviderAdapter(
                        transport,
                        () -> Map.of("traceparent", TRACE_PARENT))
                : new AnthropicCompatibleModelProviderAdapter(
                        transport,
                        () -> Map.of("traceparent", TRACE_PARENT));
    }

    private static ModelProviderRequest request(
            StubProviderServer server,
            Protocol protocol,
            Duration idleTimeout) {
        return request(
                server,
                protocol,
                idleTimeout,
                Instant.now().plusSeconds(3));
    }

    private static ModelProviderRequest request(
            StubProviderServer server,
            Protocol protocol,
            Duration idleTimeout,
            Instant deadline) {
        String canonical = providerNeutralRequest();
        return new ModelProviderRequest(
                UUID.randomUUID(),
                CanonicalJson.sha256(canonical),
                canonical,
                binding(server, protocol),
                deadline,
                idleTimeout);
    }

    private static ModelProviderRequest cacheRequest(
            StubProviderServer server,
            Protocol protocol,
            ProviderCacheProjection projection) {
        return cacheRequest(
                server,
                protocol,
                projection,
                cacheProviderNeutralRequest());
    }

    private static ModelProviderRequest cacheRequest(
            StubProviderServer server,
            Protocol protocol,
            ProviderCacheProjection projection,
            String canonical) {
        return new ModelProviderRequest(
                UUID.randomUUID(),
                CanonicalJson.sha256(canonical),
                canonical,
                binding(server, protocol),
                Instant.now().plusSeconds(3),
                Duration.ofSeconds(1),
                projection);
    }

    private static com.robothree.central.modelgateway.domain.PromptCacheMarkerPolicy
            markerPolicy(String policyId) {
        return VersionedPromptCacheMarkerPolicyRegistry.defaultPolicies().stream()
                .filter(value -> value.policyId().equals(policyId))
                .findFirst()
                .orElseThrow();
    }

    private static ModelEndpointBinding binding(
            StubProviderServer server,
            Protocol protocol) {
        return binding(server, protocol, "model.synthetic");
    }

    private static ModelEndpointBinding binding(
            StubProviderServer server,
            Protocol protocol,
            String upstreamModelId) {
        return new ModelEndpointBinding(
                "binding.synthetic",
                "1".repeat(64),
                "2".repeat(64),
                "model.synthetic",
                upstreamModelId,
                "3".repeat(64),
                "4".repeat(64),
                "5".repeat(64),
                ConnectionMode.DIRECT_PROVIDER,
                protocol,
                server.baseUri(),
                "credential.synthetic",
                "6".repeat(64),
                "7".repeat(64),
                "8".repeat(64),
                RecoveryMode.MANUAL_RECONCILIATION);
    }

    private static String providerNeutralRequest() {
        ObjectNode root = JSON.createObjectNode();
        root.put("snapshotId", "11111111-1111-4111-8111-111111111111");
        root.put("contextSourceDigest", "a".repeat(64));
        ObjectNode model = root.putObject("model");
        model.put("modelId", "model.synthetic");
        model.put("modelRevision", "3".repeat(64));
        model.put("configurationRevision", "4".repeat(64));
        model.put("runtimeRegistryGeneration", "5".repeat(64));
        ObjectNode message = root.putArray("messages").addObject();
        message.put("role", "user");
        message.putArray("content")
                .addObject()
                .put("type", "text")
                .put("text", "固定非敏感测试输入");
        ObjectNode tool = root.putArray("tools").addObject();
        tool.put("capabilityId", "tool.echo");
        tool.put("capabilityRevision", "b".repeat(64));
        tool.put("name", "echo");
        tool.put("description", "Echo one value.");
        tool.putObject("inputSchema")
                .put("type", "object")
                .putObject("properties")
                .putObject("value")
                .put("type", "integer");
        tool.put("inputSchemaDigest", "c".repeat(64));
        root.put("maxOutputTokens", 64);
        return CanonicalJson.canonicalize(root);
    }

    private static String cacheProviderNeutralRequest() {
        ObjectNode root = JSON.createObjectNode();
        root.put("snapshotId", "11111111-1111-4111-8111-111111111111");
        root.put("contextSourceDigest", "a".repeat(64));
        root.putObject("model")
                .put("modelId", "model.synthetic")
                .put("modelRevision", "3".repeat(64))
                .put("configurationRevision", "4".repeat(64))
                .put("runtimeRegistryGeneration", "5".repeat(64));
        var messages = root.putArray("messages");
        for (int index = 1; index <= 2; index += 1) {
            messages.addObject()
                    .put("role", "system")
                    .put("sourceId", "system." + index)
                    .put("sourceRevision", Integer.toString(index).repeat(64))
                    .put("sourceDigest", Integer.toString(index + 2).repeat(64))
                    .putArray("content")
                    .addObject()
                    .put("type", "text")
                    .put("text", "Static system " + index);
        }
        messages.addObject()
                .put("role", "user")
                .putArray("content")
                .addObject()
                .put("type", "text")
                .put("text", "Dynamic user input");
        var tools = root.putArray("tools");
        addCacheTool(tools.addObject(), "tool.zeta", "zeta", "b".repeat(64));
        addCacheTool(tools.addObject(), "tool.alpha", "alpha", "a".repeat(64));
        root.put("maxOutputTokens", 64);
        return CanonicalJson.canonicalize(root);
    }

    private static void addCacheTool(
            ObjectNode tool,
            String capabilityId,
            String name,
            String revision) {
        tool.put("capabilityId", capabilityId);
        tool.put("capabilityRevision", revision);
        tool.put("name", name);
        tool.put("description", "Synthetic " + name + " tool.");
        ObjectNode schema = tool.putObject("inputSchema").put("type", "object");
        tool.put("inputSchemaDigest", CanonicalJson.sha256(
                CanonicalJson.canonicalize(schema)));
    }

    private static String path(Protocol protocol) {
        return protocol == Protocol.OPENAI_COMPATIBLE
                ? "/base/chat/completions"
                : "/base/v1/messages";
    }

    private static String openAiHappyStream() {
        return "data: {\"choices\":[{\"delta\":{\"content\":\"你好\"},"
                + "\"finish_reason\":null}]}\n\n"
                + "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,"
                + "\"id\":\"tool-1\",\"function\":{\"name\":\"echo\"}}]},"
                + "\"finish_reason\":null}]}\n\n"
                + "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,"
                + "\"function\":{\"arguments\":\"{\\\"value\\\":1}\"}}]},"
                + "\"finish_reason\":\"tool_calls\"}],\"usage\":{\"prompt_tokens\":8,"
                + "\"completion_tokens\":4}}\n\n"
                + "data: [DONE]\n\n";
    }

    private static String openAiEmptyAndBlankContentStream() {
        return "data: {\"choices\":[{\"delta\":{\"role\":\"assistant\"," 
                + "\"content\":\"\"},\"finish_reason\":null}]}\n\n"
                + "data: {\"choices\":[{\"delta\":{\"content\":null},"
                + "\"finish_reason\":null}]}\n\n"
                + "data: {\"choices\":[{\"delta\":{\"content\":\"   \"},"
                + "\"finish_reason\":null}]}\n\n"
                + "data: {\"choices\":[{\"delta\":{},"
                + "\"finish_reason\":null}]}\n\n"
                + "data: {\"choices\":[{\"delta\":{\"content\":\"最终答案\"},"
                + "\"finish_reason\":\"stop\"}],\"usage\":{\"prompt_tokens\":8,"
                + "\"completion_tokens\":6}}\n\n"
                + "data: [DONE]\n\n";
    }

    private static String anthropicHappyStream() {
        return "event: message_start\n"
                + "data: {\"type\":\"message_start\",\"message\":{\"usage\":"
                + "{\"input_tokens\":8}}}\n\n"
                + "event: content_block_delta\n"
                + "data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":"
                + "{\"type\":\"text_delta\",\"text\":\"你好\"}}\n\n"
                + "event: content_block_start\n"
                + "data: {\"type\":\"content_block_start\",\"index\":0,"
                + "\"content_block\":{\"type\":\"tool_use\",\"id\":\"tool-1\","
                + "\"name\":\"echo\"}}\n\n"
                + "event: content_block_delta\n"
                + "data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":"
                + "{\"type\":\"input_json_delta\",\"partial_json\":\"{\\\"value\\\":1}\"}}\n\n"
                + "event: content_block_stop\n"
                + "data: {\"type\":\"content_block_stop\",\"index\":0}\n\n"
                + "event: message_delta\n"
                + "data: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"tool_use\"},"
                + "\"usage\":{\"output_tokens\":4}}\n\n"
                + "event: message_stop\n"
                + "data: {\"type\":\"message_stop\"}\n\n";
    }

    private static String anthropicThinkingStream() {
        return "event: message_start\n"
                + "data: {\"type\":\"message_start\",\"message\":{\"usage\":"
                + "{\"input_tokens\":8}}}\n\n"
                + "event: content_block_start\n"
                + "data: {\"type\":\"content_block_start\",\"index\":0,"
                + "\"content_block\":{\"type\":\"thinking\"}}\n\n"
                + "event: content_block_delta\n"
                + "data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":"
                + "{\"type\":\"thinking_delta\",\"thinking\":\"private\"}}\n\n"
                + "event: content_block_delta\n"
                + "data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":"
                + "{\"type\":\"signature_delta\",\"signature\":\"opaque\"}}\n\n"
                + "event: content_block_stop\n"
                + "data: {\"type\":\"content_block_stop\",\"index\":0}\n\n"
                + "event: content_block_start\n"
                + "data: {\"type\":\"content_block_start\",\"index\":1,"
                + "\"content_block\":{\"type\":\"text\"}}\n\n"
                + "event: content_block_delta\n"
                + "data: {\"type\":\"content_block_delta\",\"index\":1,\"delta\":"
                + "{\"type\":\"text_delta\",\"text\":\"最终答案\"}}\n\n"
                + "event: content_block_stop\n"
                + "data: {\"type\":\"content_block_stop\",\"index\":1}\n\n"
                + "event: message_delta\n"
                + "data: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":"
                + "\"end_turn\"},\"usage\":{\"output_tokens\":6}}\n\n"
                + "event: message_stop\n"
                + "data: {\"type\":\"message_stop\"}\n\n";
    }

    private static String duplicateToolCallIdentityStream(Protocol protocol) {
        if (protocol == Protocol.OPENAI_COMPATIBLE) {
            return "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,"
                    + "\"id\":\"duplicate\",\"function\":{\"name\":\"echo\","
                    + "\"arguments\":\"{\\\"value\\\":1}\"}},{\"index\":1,"
                    + "\"id\":\"duplicate\",\"function\":{\"name\":\"echo\","
                    + "\"arguments\":\"{\\\"value\\\":2}\"}}]},"
                    + "\"finish_reason\":\"tool_calls\"}],\"usage\":{"
                    + "\"prompt_tokens\":1,\"completion_tokens\":1}}\n\n"
                    + "data: [DONE]\n\n";
        }
        return "event: message_start\n"
                + "data: {\"type\":\"message_start\",\"message\":{\"usage\":{"
                + "\"input_tokens\":1}}}\n\n"
                + "event: content_block_start\n"
                + "data: {\"type\":\"content_block_start\",\"index\":0,"
                + "\"content_block\":{\"type\":\"tool_use\",\"id\":\"duplicate\","
                + "\"name\":\"echo\"}}\n\n"
                + "event: content_block_delta\n"
                + "data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{"
                + "\"type\":\"input_json_delta\",\"partial_json\":\"{\\\"value\\\":1}\"}}\n\n"
                + "event: content_block_start\n"
                + "data: {\"type\":\"content_block_start\",\"index\":1,"
                + "\"content_block\":{\"type\":\"tool_use\",\"id\":\"duplicate\","
                + "\"name\":\"echo\"}}\n\n";
    }

    private static final class CredentialSource
            implements com.robothree.central.modelgateway.port
                    .ModelCredentialMaterialSource {

        private char[] lastMaterial;

        @Override
        public char[] resolve(String reference, String revision) {
            lastMaterial = CREDENTIAL_SENTINEL.toCharArray();
            return lastMaterial;
        }

        char[] lastMaterial() {
            return lastMaterial;
        }
    }

    private static final class CollectingSink implements ModelStreamSink {

        private final List<ModelProviderStreamEvent> events = new ArrayList<>();
        private final AtomicBoolean cancelled = new AtomicBoolean();

        @Override
        public void accept(ModelProviderStreamEvent event) {
            events.add(event);
        }

        @Override
        public boolean cancellationRequested() {
            return cancelled.get();
        }

        void cancel() {
            cancelled.set(true);
        }

        List<ModelProviderStreamEvent> events() {
            return List.copyOf(events);
        }
    }

    private static final class StubProviderServer implements AutoCloseable {

        private final HttpServer server;
        private final ExecutorService executor = Executors.newCachedThreadPool();
        private final Map<String, StubResponse> responses = new ConcurrentHashMap<>();
        private final Map<String, CapturedRequest> requests = new ConcurrentHashMap<>();

        private StubProviderServer() throws IOException {
            server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.createContext("/", this::handle);
            server.setExecutor(executor);
            server.start();
        }

        URI baseUri() {
            return URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/base");
        }

        void respond(String path, StubResponse response) {
            responses.put(path, response);
        }

        CapturedRequest request(String path) {
            return requests.get(path);
        }

        Map<String, CapturedRequest> requests() {
            return Map.copyOf(requests);
        }

        private void handle(HttpExchange exchange) throws IOException {
            String path = exchange.getRequestURI().getPath();
            byte[] requestBody = exchange.getRequestBody().readAllBytes();
            requests.put(
                    path,
                    new CapturedRequest(
                            exchange.getRequestMethod(),
                            exchange.getRequestHeaders(),
                            new String(requestBody, StandardCharsets.UTF_8)));
            StubResponse response = responses.getOrDefault(
                    path,
                    new StubResponse(
                            404,
                            "application/json",
                            "{}".getBytes(StandardCharsets.UTF_8),
                            0,
                            0));
            sleep(response.delayBeforeHeadersMillis());
            exchange.getResponseHeaders().set("Content-Type", response.contentType());
            response.headers().forEach(exchange.getResponseHeaders()::set);
            exchange.sendResponseHeaders(response.status(), 0);
            if (response.delayBeforeBodyMillis() > 0) {
                sleep(response.delayBeforeBodyMillis());
            }
            try {
                int split = Math.max(1, response.body().length / 2);
                exchange.getResponseBody().write(response.body(), 0, split);
                exchange.getResponseBody().flush();
                if (response.delayBeforeBodyMillis() > 0) {
                    sleep(response.delayBeforeBodyMillis());
                }
                exchange.getResponseBody().write(
                        response.body(),
                        split,
                        response.body().length - split);
            } catch (IOException ignored) {
                // Cancellation closes the client side of the loopback stream.
            } finally {
                exchange.close();
            }
        }

        @Override
        public void close() {
            server.stop(0);
            executor.shutdownNow();
        }

        private static void sleep(long millis) {
            if (millis <= 0) {
                return;
            }
            try {
                Thread.sleep(millis);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
            }
        }
    }

    private record StubResponse(
            int status,
            String contentType,
            byte[] body,
            long delayBeforeHeadersMillis,
            long delayBeforeBodyMillis,
            Map<String, String> headers) {

        private StubResponse {
            body = body.clone();
            headers = Map.copyOf(headers);
        }

        private StubResponse(
                int status,
                String contentType,
                byte[] body,
                long delayBeforeHeadersMillis,
                long delayBeforeBodyMillis) {
            this(
                    status,
                    contentType,
                    body,
                    delayBeforeHeadersMillis,
                    delayBeforeBodyMillis,
                    Map.of());
        }

        static StubResponse stream(String body) {
            return new StubResponse(
                    200,
                    "text/event-stream; charset=utf-8",
                    body.getBytes(StandardCharsets.UTF_8),
                    0,
                    0);
        }

        @Override
        public byte[] body() {
            return body.clone();
        }
    }

    private record CapturedRequest(
            String method,
            com.sun.net.httpserver.Headers headers,
            String body) {

        String firstHeader(String name) {
            return headers.getFirst(name);
        }
    }
}
