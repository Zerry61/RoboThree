package com.robothree.central.modelgateway.adapter.provider;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.modelgateway.provider.BoundedModelStreamSink;
import com.robothree.central.modelgateway.provider.ModelProviderStreamEvent;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

final class ProviderToolCallAccumulator {

    private static final int MAXIMUM_ARGUMENT_BYTES = 1_048_576;

    private final BoundedModelStreamSink sink;
    private final Map<Integer, ToolCallState> calls = new HashMap<>();
    private final Map<String, Integer> providerIdOwners = new HashMap<>();

    ProviderToolCallAccumulator(BoundedModelStreamSink sink) {
        this.sink = sink;
    }

    void accept(
            int index,
            String providerToolCallId,
            String name,
            String argumentsFragment) {
        ToolCallState state = calls.get(index);
        if (state == null) {
            if (providerToolCallId == null || name == null) {
                throw invalid("model_gateway.provider_tool_call_start_missing");
            }
            Integer existingIndex = providerIdOwners.putIfAbsent(
                    providerToolCallId,
                    index);
            if (existingIndex != null && existingIndex != index) {
                throw invalid("model_gateway.provider_tool_call_duplicate");
            }
            state = new ToolCallState(providerToolCallId, name);
            calls.put(index, state);
        } else {
            if (providerToolCallId != null
                    && !providerToolCallId.equals(state.providerToolCallId)) {
                throw invalid("model_gateway.provider_tool_call_conflict");
            }
            if (name != null && !name.equals(state.name)) {
                throw invalid("model_gateway.provider_tool_call_conflict");
            }
        }
        if (argumentsFragment != null) {
            state.arguments.append(argumentsFragment);
            state.argumentBytes +=
                    argumentsFragment.getBytes(StandardCharsets.UTF_8).length;
            if (state.argumentBytes > MAXIMUM_ARGUMENT_BYTES) {
                throw invalid("model_gateway.provider_tool_arguments_oversized");
            }
        }
        if (providerToolCallId != null || name != null || argumentsFragment != null) {
            sink.accept(new ModelProviderStreamEvent.ToolCallDelta(
                    index,
                    providerToolCallId,
                    name,
                    argumentsFragment));
        }
    }

    void requireComplete(String finishReason) {
        if ("tool_use".equals(finishReason) != !calls.isEmpty()) {
            throw invalid("model_gateway.provider_tool_finish_mismatch");
        }
        for (ToolCallState state : calls.values()) {
            if (state.arguments.isEmpty()) {
                throw invalid("model_gateway.provider_tool_arguments_incomplete");
            }
            JsonNode arguments;
            try {
                arguments = ProviderAdapterSupport.JSON.readTree(
                        state.arguments.toString());
            } catch (com.fasterxml.jackson.core.JsonProcessingException exception) {
                throw invalid("model_gateway.provider_tool_arguments_invalid");
            }
            if (!(arguments instanceof ObjectNode)) {
                throw invalid("model_gateway.provider_tool_arguments_invalid");
            }
        }
    }

    private static com.robothree.central.modelgateway.application.ModelGatewayException
            invalid(String code) {
        return ProviderAdapterSupport.protocol(code);
    }

    private static final class ToolCallState {

        private final String providerToolCallId;
        private final String name;
        private final StringBuilder arguments = new StringBuilder();
        private int argumentBytes;

        private ToolCallState(String providerToolCallId, String name) {
            this.providerToolCallId = providerToolCallId;
            this.name = name;
        }
    }
}
