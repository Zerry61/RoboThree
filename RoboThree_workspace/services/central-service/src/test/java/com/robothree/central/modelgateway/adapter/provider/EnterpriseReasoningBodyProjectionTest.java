package com.robothree.central.modelgateway.adapter.provider;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.modelgateway.domain.ProviderReasoningProjection;
import com.robothree.central.modelgateway.application.ModelGatewayException;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import org.junit.jupiter.api.Test;

final class EnterpriseReasoningBodyProjectionTest {
    private static final String E = "e".repeat(64);

    @Test
    void default_omits_all_reasoning_fields_and_openai_adds_only_effort() throws Exception {
        ObjectNode omitted = body(8192);
        invoke(OpenAiCompatibleModelProviderAdapter.class, omitted,
                ProviderReasoningProjection.Omit.instance());
        assertThat(omitted.toString()).doesNotContain(
                "reasoning", "effort", "thinking", "budget");

        ObjectNode applied = body(8192);
        invoke(OpenAiCompatibleModelProviderAdapter.class, applied,
                new ProviderReasoningProjection.OpenAiEffort(
                        E, E, ProviderReasoningProjection.Effort.XHIGH));
        assertThat(applied.path("reasoning_effort").asText()).isEqualTo("xhigh");
        assertThat(applied.size()).isEqualTo(2);
    }

    @Test
    void anthropic_adds_bounded_thinking_and_rejects_budget_not_below_output() throws Exception {
        ObjectNode applied = body(8192);
        invoke(AnthropicCompatibleModelProviderAdapter.class, applied,
                new ProviderReasoningProjection.AnthropicThinkingBudget(E, E, 4096));
        assertThat(applied.path("thinking").path("type").asText()).isEqualTo("enabled");
        assertThat(applied.path("thinking").path("budget_tokens").asInt()).isEqualTo(4096);

        assertThatThrownBy(() -> invoke(
                AnthropicCompatibleModelProviderAdapter.class,
                body(4096),
                new ProviderReasoningProjection.AnthropicThinkingBudget(E, E, 4096)))
                .isInstanceOf(InvocationTargetException.class)
                .hasCauseInstanceOf(ModelGatewayException.class);
    }

    private static ObjectNode body(int maxTokens) {
        return ProviderAdapterSupport.JSON.createObjectNode().put("max_tokens", maxTokens);
    }

    private static void invoke(
            Class<?> adapter,
            ObjectNode body,
            ProviderReasoningProjection projection) throws Exception {
        Method method = adapter.getDeclaredMethod(
                "projectReasoning", ObjectNode.class, ProviderReasoningProjection.class);
        method.setAccessible(true);
        method.invoke(null, body, projection);
    }
}
