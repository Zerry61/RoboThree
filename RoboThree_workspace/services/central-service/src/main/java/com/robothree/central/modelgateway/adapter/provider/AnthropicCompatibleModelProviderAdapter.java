package com.robothree.central.modelgateway.adapter.provider;

import static com.robothree.central.modelgateway.adapter.provider.ProviderAdapterSupport.JSON;
import static com.robothree.central.modelgateway.adapter.provider.ProviderAdapterSupport.MAXIMUM_FRAME_BYTES;
import static com.robothree.central.modelgateway.adapter.provider.ProviderAdapterSupport.MAXIMUM_RESPONSE_HEADER_BYTES;
import static com.robothree.central.modelgateway.adapter.provider.ProviderAdapterSupport.MAXIMUM_STREAM_BYTES;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.modelgateway.adapter.http.BoundedSseEventReader;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding.Protocol;
import com.robothree.central.modelgateway.domain.CanonicalStaticPromptMaterialPlanner;
import com.robothree.central.modelgateway.domain.ProviderCacheProjection;
import com.robothree.central.modelgateway.domain.ProviderReasoningProjection;
import com.robothree.central.modelgateway.port.ModelAuthorizedHttpTransport;
import com.robothree.central.modelgateway.port.ModelOutboundTraceContext;
import com.robothree.central.modelgateway.port.ModelProviderAdapter;
import com.robothree.central.modelgateway.port.ModelStreamSink;
import com.robothree.central.modelgateway.provider.BoundedModelStreamSink;
import com.robothree.central.modelgateway.provider.ModelProviderRequest;
import com.robothree.central.modelgateway.provider.ModelProviderStreamEvent;
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;

public final class AnthropicCompatibleModelProviderAdapter
        implements ModelProviderAdapter {

    private static final CanonicalStaticPromptMaterialPlanner STATIC_MATERIAL =
            new CanonicalStaticPromptMaterialPlanner();

    private final ModelAuthorizedHttpTransport transport;
    private final ModelOutboundTraceContext traceContext;

    public AnthropicCompatibleModelProviderAdapter(
            ModelAuthorizedHttpTransport transport) {
        this(transport, ModelOutboundTraceContext.none());
    }

    public AnthropicCompatibleModelProviderAdapter(
            ModelAuthorizedHttpTransport transport,
            ModelOutboundTraceContext traceContext) {
        this.transport = Objects.requireNonNull(transport, "transport");
        this.traceContext = Objects.requireNonNull(traceContext, "traceContext");
    }

    @Override
    public Protocol protocol() {
        return Protocol.ANTHROPIC_COMPATIBLE;
    }

    @Override
    public void stream(ModelProviderRequest request, ModelStreamSink sink) {
        requireProtocol(request);
        ObjectNode body = requestBody(
                request.requestDocument(),
                request.binding().upstreamModelId(),
                request.cacheProjection());
        projectReasoning(body, request.reasoningProjection());
        BoundedModelStreamSink bounded = new BoundedModelStreamSink(
                sink,
                4096,
                MAXIMUM_STREAM_BYTES);
        ModelAuthorizedHttpTransport.Request httpRequest =
                new ModelAuthorizedHttpTransport.Request(
                        request.binding().endpoint(),
                        "v1/messages",
                        ModelAuthorizedHttpTransport.AuthorizationScheme.ANTHROPIC_API_KEY,
                        request.binding().credentialReference(),
                        request.binding().credentialRevision(),
                        headers(),
                        ProviderAdapterSupport.bytes(body),
                        ProviderAdapterSupport.remaining(request.deadline()),
                        MAXIMUM_RESPONSE_HEADER_BYTES);
        try (ModelAuthorizedHttpTransport.Response response =
                transport.post(httpRequest)) {
            ProviderAdapterSupport.requireSuccessful(response);
            ProviderAdapterSupport.requireEventStream(response);
            StreamState state = new StreamState(bounded);
            BoundedSseEventReader.read(
                    response.body(),
                    request.streamIdleTimeout(),
                    ProviderAdapterSupport.remaining(request.deadline()),
                    MAXIMUM_FRAME_BYTES,
                    MAXIMUM_STREAM_BYTES,
                    bounded::cancellationRequested,
                    state::accept);
            state.requireTerminal();
        }
    }

    private Map<String, String> headers() {
        Map<String, String> headers = new HashMap<>(traceContext.safeHeaders());
        if (headers.put("anthropic-version", "2023-06-01") != null) {
            throw ProviderAdapterSupport.protocol(
                    "model_gateway.provider_header_conflict");
        }
        return Map.copyOf(headers);
    }

    private static ObjectNode requestBody(
            ObjectNode source,
            String upstreamModelId,
            ProviderCacheProjection projection) {
        if (projection instanceof ProviderCacheProjection.Disabled) {
            return disabledRequestBody(source, upstreamModelId);
        }
        if (!(projection instanceof ProviderCacheProjection.AnthropicExplicit explicit)) {
            throw ProviderAdapterSupport.protocol(
                    "model_gateway.cache_projection_invalid");
        }
        return enabledRequestBody(source, upstreamModelId, explicit);
    }

    private static void projectReasoning(
            ObjectNode body,
            ProviderReasoningProjection projection) {
        if (projection instanceof ProviderReasoningProjection.Omit) return;
        if (!(projection
                instanceof ProviderReasoningProjection.AnthropicThinkingBudget thinking)) {
            throw ProviderAdapterSupport.protocol(
                    "model_gateway.reasoning_projection_invalid");
        }
        int maxOutputTokens = body.path("max_tokens").asInt(-1);
        if (thinking.budgetTokens() >= maxOutputTokens) {
            throw ProviderAdapterSupport.protocol(
                    "model_gateway.reasoning_budget_conflict");
        }
        body.putObject("thinking")
                .put("type", "enabled")
                .put("budget_tokens", thinking.budgetTokens());
    }

    private static ObjectNode disabledRequestBody(
            ObjectNode source,
            String upstreamModelId) {
        ObjectNode body = JSON.createObjectNode();
        ProviderAdapterSupport.modelId(source);
        body.put("model", upstreamModelId);
        body.put("stream", true);
        body.put("max_tokens", ProviderAdapterSupport.maxOutputTokens(source));
        ArrayNode messages = body.putArray("messages");
        StringBuilder system = new StringBuilder();
        for (JsonNode message : ProviderAdapterSupport.messages(source)) {
            String role = message.path("role").asText();
            String text = ProviderAdapterSupport.joinedText(message);
            if ("system".equals(role)) {
                if (!system.isEmpty()) {
                    system.append('\n');
                }
                system.append(text);
            } else {
                messages.addObject()
                        .put("role", "tool".equals(role) ? "user" : role)
                        .put("content", text);
            }
        }
        if (!system.isEmpty()) {
            body.put("system", system.toString());
        }
        ArrayNode tools = ProviderAdapterSupport.tools(source);
        if (!tools.isEmpty()) {
            ArrayNode targetTools = body.putArray("tools");
            for (JsonNode tool : tools) {
                ObjectNode target = targetTools.addObject();
                target.put("name", tool.path("name").asText());
                target.put("description", tool.path("description").asText());
                target.set("input_schema", tool.path("inputSchema").deepCopy());
            }
        }
        return body;
    }

    private static ObjectNode enabledRequestBody(
            ObjectNode source,
            String upstreamModelId,
            ProviderCacheProjection.AnthropicExplicit projection) {
        var material = STATIC_MATERIAL.plan(source);
        if (projection.retentionPolicy()
                != ProviderCacheProjection.RetentionPolicy.PROVIDER_DEFAULT_EPHEMERAL) {
            throw ProviderAdapterSupport.protocol(
                    "model_gateway.cache_projection_invalid");
        }
        ObjectNode body = JSON.createObjectNode();
        ProviderAdapterSupport.modelId(source);
        body.put("model", upstreamModelId);
        body.put("stream", true);
        body.put("max_tokens", ProviderAdapterSupport.maxOutputTokens(source));
        ArrayNode messages = body.putArray("messages");
        boolean dynamicObserved = false;
        for (JsonNode message : ProviderAdapterSupport.messages(source)) {
            String role = message.path("role").asText();
            if ("system".equals(role)) {
                if (dynamicObserved) {
                    throw ProviderAdapterSupport.protocol(
                            "model_gateway.cache_projection_invalid");
                }
                continue;
            }
            dynamicObserved = true;
            messages.addObject()
                    .put("role", "tool".equals(role) ? "user" : role)
                    .put("content", ProviderAdapterSupport.joinedText(message));
        }
        if (!material.leadingSystems().isEmpty()) {
            ArrayNode system = body.putArray("system");
            var systems = material.leadingSystems();
            for (int index = 0; index < systems.size(); index += 1) {
                ObjectNode block = system.addObject()
                        .put("type", "text")
                        .put("text", ProviderAdapterSupport.joinedText(systems.get(index)));
                if (projection.markerTarget()
                                == ProviderCacheProjection.MarkerTarget.SYSTEM_LAST_STATIC
                        && index == systems.size() - 1) {
                    block.putObject("cache_control").put("type", "ephemeral");
                }
            }
        }
        var tools = material.sortedTools();
        if (!tools.isEmpty()) {
            ArrayNode targetTools = body.putArray("tools");
            for (int index = 0; index < tools.size(); index += 1) {
                JsonNode tool = tools.get(index);
                ObjectNode target = targetTools.addObject();
                target.put("name", tool.path("name").asText());
                target.put("description", tool.path("description").asText());
                target.set("input_schema", tool.path("inputSchema").deepCopy());
                if (projection.markerTarget()
                                == ProviderCacheProjection.MarkerTarget.TOOL_LAST_STATIC
                        && index == tools.size() - 1) {
                    target.putObject("cache_control").put("type", "ephemeral");
                }
            }
        }
        if (projection.markerTarget()
                        == ProviderCacheProjection.MarkerTarget.SYSTEM_LAST_STATIC
                && material.leadingSystems().isEmpty()) {
            throw ProviderAdapterSupport.protocol(
                    "model_gateway.cache_projection_invalid");
        }
        if (projection.markerTarget()
                        == ProviderCacheProjection.MarkerTarget.TOOL_LAST_STATIC
                && tools.isEmpty()) {
            throw ProviderAdapterSupport.protocol(
                    "model_gateway.cache_projection_invalid");
        }
        return body;
    }

    private static void requireProtocol(ModelProviderRequest request) {
        if (request.binding().protocol() != Protocol.ANTHROPIC_COMPATIBLE) {
            throw ProviderAdapterSupport.protocol(
                    "model_gateway.provider_protocol_mismatch");
        }
    }

    private static final class StreamState {

        private final BoundedModelStreamSink sink;
        private final ProviderToolCallAccumulator toolCalls;
        private long inputTokens = -1;
        private long outputTokens = -1;
        private Long cacheReadInputTokens;
        private Long cacheWriteInputTokens;
        private String finishReason;
        private boolean usageReceived;
        private boolean terminal;

        private StreamState(BoundedModelStreamSink sink) {
            this.sink = sink;
            this.toolCalls = new ProviderToolCallAccumulator(sink);
        }

        private void accept(BoundedSseEventReader.SseFrame frame) {
            if (terminal) {
                throw ProviderAdapterSupport.protocol(
                        "model_gateway.provider_event_after_terminal");
            }
            ObjectNode event = ProviderAdapterSupport.parseObject(frame.data());
            String type = event.path("type").asText(frame.event());
            switch (type) {
                case "message_start" -> {
                    JsonNode usage = event.path("message").path("usage");
                    long value = usage.path("input_tokens").asLong(-1);
                    if (value >= 0) {
                        inputTokens = value;
                    }
                    cacheReadInputTokens = optionalNonNegative(
                            usage,
                            "cache_read_input_tokens");
                    cacheWriteInputTokens = optionalNonNegative(
                            usage,
                            "cache_creation_input_tokens");
                }
                case "content_block_start" -> {
                    JsonNode block = event.path("content_block");
                    if ("tool_use".equals(block.path("type").asText())) {
                        toolCalls.accept(
                                event.path("index").asInt(-1),
                                optional(block, "id"),
                                optional(block, "name"),
                                null);
                    }
                }
                case "content_block_stop" -> {
                    // The block content is validated from its start and deltas.
                }
                case "content_block_delta" -> handleDelta(event);
                case "message_delta" -> {
                    String reason = event.path("delta").path("stop_reason")
                            .asText(null);
                    if (reason != null && !reason.isBlank()) {
                        finishReason = normalizeFinishReason(reason);
                    }
                    long value = event.path("usage").path("output_tokens")
                            .asLong(-1);
                    if (value >= 0) {
                        outputTokens = value;
                    }
                    if (inputTokens >= 0 && outputTokens >= 0) {
                        sink.accept(new ModelProviderStreamEvent.Usage(
                                inputTokens,
                                outputTokens,
                                cacheReadInputTokens,
                                cacheWriteInputTokens,
                                null));
                        usageReceived = true;
                    }
                }
                case "message_stop" -> {
                    if (finishReason == null) {
                        throw ProviderAdapterSupport.protocol(
                                "model_gateway.provider_terminal_missing");
                    }
                    if (!usageReceived) {
                        throw ProviderAdapterSupport.protocol(
                                "model_gateway.provider_usage_missing");
                    }
                    toolCalls.requireComplete(finishReason);
                    sink.accept(new ModelProviderStreamEvent.Terminal(finishReason));
                    terminal = true;
                }
                case "ping" -> {
                    // Keep-alive frame.
                }
                case "error" -> throw ProviderAdapterSupport.protocol(
                        "model_gateway.provider_error_event");
                default -> throw ProviderAdapterSupport.protocol(
                        "model_gateway.provider_event_unknown");
            }
        }

        private void handleDelta(JsonNode event) {
            JsonNode delta = event.path("delta");
            String deltaType = delta.path("type").asText();
            if ("text_delta".equals(deltaType)) {
                String text = delta.path("text").asText(null);
                if (text != null && !text.isBlank()) {
                    sink.accept(new ModelProviderStreamEvent.TextDelta(
                            ProviderAdapterSupport.boundedText(delta, "text", 65_536)));
                }
            } else if ("thinking_delta".equals(deltaType)) {
                ProviderAdapterSupport.boundedText(delta, "thinking", 65_536);
                // Provider-private reasoning is validated but never projected.
            } else if ("signature_delta".equals(deltaType)) {
                ProviderAdapterSupport.boundedText(delta, "signature", 65_536);
                // Signatures are provider protocol metadata, not assistant text.
            } else if ("input_json_delta".equals(deltaType)) {
                toolCalls.accept(
                        event.path("index").asInt(-1),
                        null,
                        null,
                        ProviderAdapterSupport.boundedText(
                                delta,
                                "partial_json",
                                65_536));
            } else {
                throw ProviderAdapterSupport.protocol(
                        "model_gateway.provider_delta_unknown");
            }
        }

        private void requireTerminal() {
            if (!terminal || !sink.terminalReceived()) {
                throw ProviderAdapterSupport.protocol(
                        "model_gateway.provider_stream_incomplete");
            }
        }

        private static String optional(JsonNode node, String field) {
            String value = node.path(field).asText(null);
            return value == null || value.isEmpty() ? null : value;
        }

        private static Long optionalNonNegative(JsonNode node, String field) {
            JsonNode value = node.path(field);
            if (value.isMissingNode() || value.isNull()) {
                return null;
            }
            if (!value.canConvertToLong() || value.asLong() < 0) {
                throw ProviderAdapterSupport.protocol(
                        "model_gateway.provider_usage_conflict");
            }
            return value.asLong();
        }

        private static String normalizeFinishReason(String reason) {
            return switch (reason) {
                case "end_turn", "stop_sequence" -> "stop";
                case "max_tokens" -> "max_tokens";
                case "tool_use" -> "tool_use";
                default -> throw ProviderAdapterSupport.protocol(
                        "model_gateway.provider_finish_reason_unknown");
            };
        }
    }
}
