package com.robothree.central.modelgateway.provider;

import java.util.Objects;

public sealed interface ModelProviderStreamEvent
        permits ModelProviderStreamEvent.TextDelta,
                ModelProviderStreamEvent.ToolCallDelta,
                ModelProviderStreamEvent.Usage,
                ModelProviderStreamEvent.Terminal {

    record TextDelta(String text) implements ModelProviderStreamEvent {

        public TextDelta {
            text = com.robothree.central.shared.domain.DomainValueChecks.text(
                    text,
                    "text");
        }
    }

    record ToolCallDelta(
            int index,
            String providerToolCallId,
            String name,
            String argumentsFragment)
            implements ModelProviderStreamEvent {

        public ToolCallDelta {
            if (index < 0 || index > 31) {
                throw new IllegalArgumentException("tool call index is invalid");
            }
            providerToolCallId = optionalText(
                    providerToolCallId,
                    "providerToolCallId");
            name = optionalText(name, "name");
            argumentsFragment = optionalFragment(argumentsFragment);
            if (providerToolCallId == null && name == null && argumentsFragment == null) {
                throw new IllegalArgumentException("tool call delta is empty");
            }
        }
    }

    record Usage(
            long inputTokens,
            long outputTokens,
            Long cacheReadInputTokens,
            Long cacheWriteInputTokens,
            Long reasoningOutputTokens)
            implements ModelProviderStreamEvent {

        public Usage {
            if (inputTokens < 0 || outputTokens < 0) {
                throw new IllegalArgumentException("usage tokens must not be negative");
            }
            requireOptionalNonNegative(cacheReadInputTokens);
            requireOptionalNonNegative(cacheWriteInputTokens);
            requireOptionalNonNegative(reasoningOutputTokens);
        }

        public Usage(long inputTokens, long outputTokens) {
            this(inputTokens, outputTokens, null, null, null);
        }

        private static void requireOptionalNonNegative(Long value) {
            if (value != null && value < 0) {
                throw new IllegalArgumentException(
                        "optional usage tokens must not be negative");
            }
        }
    }

    record Terminal(String finishReason) implements ModelProviderStreamEvent {

        public Terminal {
            finishReason =
                    com.robothree.central.shared.domain.DomainValueChecks.text(
                            finishReason,
                            "finishReason");
        }
    }

    private static String optionalText(String value, String name) {
        return value == null
                ? null
                : com.robothree.central.shared.domain.DomainValueChecks.text(
                        value,
                        name);
    }

    private static String optionalFragment(String value) {
        return value == null || value.isEmpty() ? null : value;
    }
}
