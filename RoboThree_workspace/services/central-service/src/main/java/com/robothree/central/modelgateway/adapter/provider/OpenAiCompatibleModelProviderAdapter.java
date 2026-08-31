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
import com.robothree.central.shared.json.CanonicalJson;
import java.util.Objects;

public final class OpenAiCompatibleModelProviderAdapter
        implements ModelProviderAdapter {

    private static final CanonicalStaticPromptMaterialPlanner STATIC_MATERIAL =
            new CanonicalStaticPromptMaterialPlanner();

    private final ModelAuthorizedHttpTransport transport;
    private final ModelOutboundTraceContext traceContext;

    public OpenAiCompatibleModelProviderAdapter(
            ModelAuthorizedHttpTransport transport) {
        this(transport, ModelOutboundTraceContext.none());
    }

    public OpenAiCompatibleModelProviderAdapter(
            ModelAuthorizedHttpTransport transport,
            ModelOutboundTraceContext traceContext) {
        this.transport = Objects.requireNonNull(transport, "transport");
        this.traceContext = Objects.requireNonNull(traceContext, "traceContext");
    }

    @Override
    public Protocol protocol() {
        return Protocol.OPENAI_COMPATIBLE;
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
                        "chat/completions",
                        ModelAuthorizedHttpTransport.AuthorizationScheme.BEARER,
                        request.binding().credentialReference(),
                        request.binding().credentialRevision(),
                        traceContext.safeHeaders(),
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
                    MAXIMUM_FRAME_BYTES,
                    MAXIMUM_STREAM_BYTES,
                    bounded::cancellationRequested,
                    state::accept);
            state.requireTerminal();
        }
    }

    private static ObjectNode requestBody(
            ObjectNode source,
            String upstreamModelId,
            ProviderCacheProjection projection) {
        boolean explicitKey = projection
                instanceof ProviderCacheProjection.OpenAiPromptCacheKey;
        if (!(projection instanceof ProviderCacheProjection.Disabled)
                && !(projection instanceof ProviderCacheProjection.OpenAiAutomaticObserved)
                && !explicitKey) {
            throw ProviderAdapterSupport.protocol(
                    "model_gateway.cache_projection_invalid");
        }
        ObjectNode body = JSON.createObjectNode();
        ProviderAdapterSupport.modelId(source);
        body.put("model", upstreamModelId);
        body.put("stream", true);
        body.put("max_tokens", ProviderAdapterSupport.maxOutputTokens(source));
        body.putObject("stream_options").put("include_usage", true);
        if (explicitKey) {
            ProviderCacheProjection.OpenAiPromptCacheKey key =
                    (ProviderCacheProjection.OpenAiPromptCacheKey) projection;
            body.put("prompt_cache_key", key.opaqueKey());
        }
        ArrayNode messages = body.putArray("messages");
        for (JsonNode message : ProviderAdapterSupport.messages(source)) {
            messages.add(projectMessage(message));
        }
        ArrayNode sourceTools = ProviderAdapterSupport.tools(source);
        java.util.List<ObjectNode> tools = explicitKey
                ? STATIC_MATERIAL.plan(source).sortedTools()
                : java.util.stream.StreamSupport.stream(sourceTools.spliterator(), false)
                        .map(value -> ((ObjectNode) value).deepCopy())
                        .toList();
        if (!tools.isEmpty()) {
            ArrayNode targetTools = body.putArray("tools");
            for (JsonNode tool : tools) {
                ObjectNode function = targetTools.addObject()
                        .put("type", "function")
                        .putObject("function");
                function.put("name", tool.path("name").asText());
                function.put("description", tool.path("description").asText());
                function.set("parameters", tool.path("inputSchema").deepCopy());
            }
        }
        return body;
    }

    private static ObjectNode projectMessage(JsonNode source) {
        String role = source.path("role").asText();
        ObjectNode target = JSON.createObjectNode().put("role", role);
        target.put("content", ProviderAdapterSupport.joinedText(source));
        switch (role) {
            case "system", "user" -> {
                return target;
            }
            case "assistant" -> {
                JsonNode toolCallsNode = source.path("toolCalls");
                if (!(toolCallsNode instanceof ArrayNode toolCalls)) {
                    throw ProviderAdapterSupport.protocol(
                            "model_gateway.provider_request_invalid");
                }
                if (!toolCalls.isEmpty()) {
                    ArrayNode projectedCalls = target.putArray("tool_calls");
                    for (JsonNode toolCall : toolCalls) {
                        String toolCallId = requiredText(toolCall, "toolCallId");
                        String name = requiredText(toolCall, "name");
                        JsonNode arguments = toolCall.path("arguments");
                        if (!arguments.isObject()) {
                            throw ProviderAdapterSupport.protocol(
                                    "model_gateway.provider_request_invalid");
                        }
                        ObjectNode function = projectedCalls.addObject()
                                .put("id", toolCallId)
                                .put("type", "function")
                                .putObject("function");
                        function.put("name", name);
                        function.put("arguments", CanonicalJson.canonicalize(arguments));
                    }
                }
                return target;
            }
            case "tool" -> {
                target.put("tool_call_id", requiredText(source, "toolCallId"));
                return target;
            }
            default -> throw ProviderAdapterSupport.protocol(
                    "model_gateway.provider_request_invalid");
        }
    }

    private static String requiredText(JsonNode source, String field) {
        String value = source.path(field).asText(null);
        if (value == null || value.isBlank()) {
            throw ProviderAdapterSupport.protocol(
                    "model_gateway.provider_request_invalid");
        }
        return value;
    }

    private static void projectReasoning(
            ObjectNode body,
            ProviderReasoningProjection projection) {
        if (projection instanceof ProviderReasoningProjection.Omit) return;
        if (!(projection instanceof ProviderReasoningProjection.OpenAiEffort effort)) {
            throw ProviderAdapterSupport.protocol(
                    "model_gateway.reasoning_projection_invalid");
        }
        body.put(
                "reasoning_effort",
                effort.effort() == ProviderReasoningProjection.Effort.HIGH
                        ? "high"
                        : "xhigh");
    }

    private static void requireProtocol(ModelProviderRequest request) {
        if (request.binding().protocol() != Protocol.OPENAI_COMPATIBLE) {
            throw ProviderAdapterSupport.protocol(
                    "model_gateway.provider_protocol_mismatch");
        }
    }

    private static final class StreamState {

        private final BoundedModelStreamSink sink;
        private final ProviderToolCallAccumulator toolCalls;
        private String finishReason;
        private ModelProviderStreamEvent.Usage usage;
        private boolean done;

        private StreamState(BoundedModelStreamSink sink) {
            this.sink = sink;
            this.toolCalls = new ProviderToolCallAccumulator(sink);
        }

        private void accept(BoundedSseEventReader.SseFrame frame) {
            if (done) {
                throw ProviderAdapterSupport.protocol(
                        "model_gateway.provider_event_after_terminal");
            }
            if ("[DONE]".equals(frame.data())) {
                if (finishReason == null) {
                    throw ProviderAdapterSupport.protocol(
                            "model_gateway.provider_terminal_missing");
                }
                if (usage == null) {
                    throw ProviderAdapterSupport.protocol(
                            "model_gateway.provider_usage_missing");
                }
                toolCalls.requireComplete(finishReason);
                sink.accept(usage);
                sink.accept(new ModelProviderStreamEvent.Terminal(finishReason));
                done = true;
                return;
            }
            ObjectNode event = ProviderAdapterSupport.parseObject(frame.data());
            JsonNode choices = event.path("choices");
            if (choices instanceof ArrayNode array && !array.isEmpty()) {
                JsonNode choice = array.get(0);
                JsonNode delta = choice.path("delta");
                String text = delta.path("content").asText(null);
                if (text != null && !text.isBlank()) {
                    sink.accept(new ModelProviderStreamEvent.TextDelta(text));
                }
                JsonNode toolCallNodes = delta.path("tool_calls");
                if (toolCallNodes instanceof ArrayNode calls) {
                    for (JsonNode call : calls) {
                        JsonNode function = call.path("function");
                        toolCalls.accept(
                                call.path("index").asInt(-1),
                                optional(call, "id"),
                                optional(function, "name"),
                                optional(function, "arguments"));
                    }
                }
                String reason = choice.path("finish_reason").asText(null);
                if (reason != null && !reason.isBlank()) {
                    String normalized = normalizeFinishReason(reason);
                    if (finishReason != null && !finishReason.equals(normalized)) {
                        throw ProviderAdapterSupport.protocol(
                                "model_gateway.provider_terminal_conflict");
                    }
                    finishReason = normalized;
                }
            }
            JsonNode usage = event.path("usage");
            if (usage.isObject() && !usage.isEmpty()) {
                JsonNode promptDetails = usage.path("prompt_tokens_details");
                JsonNode completionDetails = usage.path("completion_tokens_details");
                acceptUsage(new ModelProviderStreamEvent.Usage(
                        usage.path("prompt_tokens").asLong(-1),
                        usage.path("completion_tokens").asLong(-1),
                        optionalNonNegative(promptDetails, "cached_tokens"),
                        null,
                        optionalNonNegative(completionDetails, "reasoning_tokens")));
            }
        }

        private void acceptUsage(ModelProviderStreamEvent.Usage next) {
            if (usage != null
                    && (next.inputTokens() < usage.inputTokens()
                            || next.outputTokens() < usage.outputTokens()
                            || regressed(next.cacheReadInputTokens(), usage.cacheReadInputTokens())
                            || regressed(next.reasoningOutputTokens(), usage.reasoningOutputTokens()))) {
                throw ProviderAdapterSupport.protocol(
                        "model_gateway.provider_usage_conflict");
            }
            usage = next;
        }

        private static boolean regressed(Long next, Long current) {
            return next != null && current != null && next < current;
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

        private void requireTerminal() {
            if (!done || !sink.terminalReceived()) {
                throw ProviderAdapterSupport.protocol(
                        "model_gateway.provider_stream_incomplete");
            }
        }

        private static String optional(JsonNode node, String field) {
            String value = node.path(field).asText(null);
            return value == null || value.isEmpty() ? null : value;
        }

        private static String normalizeFinishReason(String reason) {
            return switch (reason) {
                case "stop" -> "stop";
                case "length" -> "max_tokens";
                case "tool_calls", "function_call" -> "tool_use";
                default -> throw ProviderAdapterSupport.protocol(
                        "model_gateway.provider_finish_reason_unknown");
            };
        }
    }
}
