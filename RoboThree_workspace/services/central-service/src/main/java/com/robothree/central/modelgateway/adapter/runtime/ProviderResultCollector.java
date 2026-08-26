package com.robothree.central.modelgateway.adapter.runtime;

import com.robothree.central.modelgateway.application.ModelGatewayException;
import com.robothree.central.modelgateway.domain.ModelInvocationExecution.Result;
import com.robothree.central.modelgateway.domain.ModelInvocationExecution.Usage;
import com.robothree.central.modelgateway.port.ModelInvocationEphemeralPublisher;
import com.robothree.central.modelgateway.port.ModelStreamSink;
import com.robothree.central.modelgateway.provider.ModelProviderStreamEvent;
import com.robothree.central.shared.json.CanonicalJson;
import java.nio.charset.StandardCharsets;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.BooleanSupplier;

final class ProviderResultCollector implements ModelStreamSink {

    private final UUID invocationId;
    private final ModelInvocationEphemeralPublisher publisher;
    private final BooleanSupplier cancellationRequested;
    private Usage usage;
    private String finishReason;
    private boolean terminal;
    private int deltaCount;
    private final Map<Integer, ToolCallState> toolCalls = new HashMap<>();
    private final Map<String, Integer> providerIdOwners = new HashMap<>();

    ProviderResultCollector(
            UUID invocationId,
            ModelInvocationEphemeralPublisher publisher,
            BooleanSupplier cancellationRequested) {
        this.invocationId = Objects.requireNonNull(invocationId, "invocationId");
        this.publisher = Objects.requireNonNull(publisher, "publisher");
        this.cancellationRequested = Objects.requireNonNull(
                cancellationRequested,
                "cancellationRequested");
    }

    @Override
    public synchronized void accept(ModelProviderStreamEvent event) {
        Objects.requireNonNull(event, "event");
        if (terminal) {
            throw protocol("model_gateway.provider_event_after_terminal");
        }
        if (event instanceof ModelProviderStreamEvent.TextDelta text) {
            try {
                publisher.publishText(invocationId, text.text());
            } catch (RuntimeException ignored) {
                // Ephemeral delivery is lossy and cannot change durable completion.
            }
            deltaCount++;
            if (cancellationRequested.getAsBoolean()) {
                throw ModelGatewayException.unavailable(
                        "model_gateway.provider_cancelled",
                        "The model provider request was cancelled.");
            }
            return;
        }
        if (event instanceof ModelProviderStreamEvent.Usage providerUsage) {
            if (usage != null) {
                throw protocol("model_gateway.provider_usage_duplicate");
            }
            usage = new Usage(
                    providerUsage.inputTokens(),
                    providerUsage.outputTokens(),
                    providerUsage.cacheReadInputTokens(),
                    providerUsage.cacheWriteInputTokens(),
                    providerUsage.reasoningOutputTokens());
            return;
        }
        if (event instanceof ModelProviderStreamEvent.Terminal providerTerminal) {
            if (usage == null) {
                throw protocol("model_gateway.provider_usage_missing");
            }
            finishReason = providerTerminal.finishReason();
            publishCompleteToolCalls();
            terminal = true;
            return;
        }
        if (event instanceof ModelProviderStreamEvent.ToolCallDelta toolCall) {
            acceptToolCall(toolCall);
            return;
        }
        throw protocol("model_gateway.provider_event_unknown");
    }

    @Override
    public boolean cancellationRequested() {
        return cancellationRequested.getAsBoolean();
    }

    synchronized Result completedResult() {
        if (!terminal || usage == null || finishReason == null) {
            throw protocol("model_gateway.provider_stream_incomplete");
        }
        return new Result(
                com.robothree.central.modelgateway.domain
                        .ModelInvocationExecution.Outcome.COMPLETED,
                usage,
                finishReason,
                null,
                null,
                List.of());
    }

    synchronized int deltaCount() {
        return deltaCount;
    }

    private void acceptToolCall(ModelProviderStreamEvent.ToolCallDelta delta) {
        ToolCallState state = toolCalls.get(delta.index());
        if (state == null) {
            if (delta.providerToolCallId() == null || delta.name() == null) {
                throw protocol("model_gateway.provider_tool_call_start_missing");
            }
            Integer existingIndex = providerIdOwners.putIfAbsent(
                    delta.providerToolCallId(),
                    delta.index());
            if (existingIndex != null && existingIndex != delta.index()) {
                throw protocol("model_gateway.provider_tool_call_duplicate");
            }
            state = new ToolCallState(delta.providerToolCallId(), delta.name());
            toolCalls.put(delta.index(), state);
        } else if ((delta.providerToolCallId() != null
                && !delta.providerToolCallId().equals(state.providerToolCallId))
                || (delta.name() != null && !delta.name().equals(state.name))) {
            throw protocol("model_gateway.provider_tool_call_conflict");
        }
        if (delta.argumentsFragment() != null) {
            state.arguments.append(delta.argumentsFragment());
            if (state.arguments.toString().getBytes(StandardCharsets.UTF_8).length
                    > 1_048_576) {
                throw protocol("model_gateway.provider_tool_arguments_oversized");
            }
        }
    }

    private void publishCompleteToolCalls() {
        toolCalls.entrySet().stream()
                .sorted(Comparator.comparingInt(Map.Entry::getKey))
                .forEach(entry -> {
                    ToolCallState state = entry.getValue();
                    String canonicalArguments;
                    try {
                        canonicalArguments = CanonicalJson.canonicalize(
                                CanonicalJson.parseObject(
                                        state.arguments.toString(),
                                        1_048_576));
                    } catch (IllegalArgumentException exception) {
                        throw protocol("model_gateway.provider_tool_arguments_invalid");
                    }
                    UUID toolCallId = UUID.nameUUIDFromBytes((
                            invocationId + ":" + entry.getKey() + ":"
                                    + state.providerToolCallId)
                            .getBytes(StandardCharsets.UTF_8));
                    try {
                        publisher.publishToolCall(
                                invocationId,
                                toolCallId,
                                state.name,
                                canonicalArguments,
                                CanonicalJson.sha256(canonicalArguments));
                    } catch (RuntimeException ignored) {
                        // Ephemeral delivery remains lossy and cannot alter terminal facts.
                    }
                });
    }

    private static ModelGatewayException protocol(String code) {
        return ModelGatewayException.validation(
                code,
                "The provider stream violated the runtime bridge contract.");
    }

    private static final class ToolCallState {
        private final String providerToolCallId;
        private final String name;
        private final StringBuilder arguments = new StringBuilder();

        private ToolCallState(String providerToolCallId, String name) {
            this.providerToolCallId = providerToolCallId;
            this.name = name;
        }
    }
}
