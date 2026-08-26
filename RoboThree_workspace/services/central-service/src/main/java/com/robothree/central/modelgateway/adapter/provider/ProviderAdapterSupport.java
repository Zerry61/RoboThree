package com.robothree.central.modelgateway.adapter.provider;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.modelgateway.application.ModelGatewayException;
import com.robothree.central.modelgateway.port.ModelAuthorizedHttpTransport;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Map;

final class ProviderAdapterSupport {

    static final ObjectMapper JSON = new ObjectMapper();
    static final int MAXIMUM_RESPONSE_HEADER_BYTES = 32_768;
    static final int MAXIMUM_FRAME_BYTES = 262_144;
    static final long MAXIMUM_STREAM_BYTES = 8_388_608;

    private ProviderAdapterSupport() {}

    static Duration remaining(Instant deadline) {
        Duration remaining = Duration.between(Instant.now(), deadline);
        if (remaining.isNegative() || remaining.isZero()) {
            throw ModelGatewayException.unavailable(
                    "model_gateway.provider_request_timeout",
                    "The model provider request timed out.");
        }
        return remaining.compareTo(Duration.ofMinutes(10)) > 0
                ? Duration.ofMinutes(10)
                : remaining;
    }

    static void requireEventStream(ModelAuthorizedHttpTransport.Response response) {
        String contentType = firstHeader(response.headers(), "content-type");
        if (contentType == null
                || !contentType.toLowerCase(Locale.ROOT).startsWith("text/event-stream")) {
            throw protocol("model_gateway.provider_content_type_invalid");
        }
    }

    static void requireSuccessful(ModelAuthorizedHttpTransport.Response response) {
        int status = response.statusCode();
        if (status >= 200 && status < 300) {
            return;
        }
        if (status >= 300 && status < 400) {
            throw protocol("model_gateway.provider_redirect_rejected");
        }
        if (status == 401 || status == 403) {
            throw new ModelGatewayException(
                    "model_gateway.provider_unauthorized",
                    false,
                    "The model provider rejected the credential.");
        }
        if (status == 429) {
            throw new ModelGatewayException(
                    "model_gateway.provider_rate_limited",
                    true,
                    "The model provider rate limited the request.");
        }
        if (status >= 500) {
            throw ModelGatewayException.unavailable(
                    "model_gateway.provider_unavailable",
                    "The model provider is unavailable.");
        }
        throw protocol("model_gateway.provider_response_invalid");
    }

    static ObjectNode parseObject(String json) {
        try {
            JsonNode parsed = JSON.readTree(json);
            if (!(parsed instanceof ObjectNode object)) {
                throw protocol("model_gateway.provider_event_invalid");
            }
            return object;
        } catch (JsonProcessingException exception) {
            throw protocol("model_gateway.provider_event_invalid");
        }
    }

    static byte[] bytes(JsonNode value) {
        try {
            return JSON.writeValueAsBytes(value);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("provider request serialization failed", exception);
        }
    }

    static String modelId(ObjectNode request) {
        String model = request.path("model").path("modelId").asText(null);
        if (model == null || model.isBlank()) {
            throw protocol("model_gateway.provider_request_invalid");
        }
        return model;
    }

    static int maxOutputTokens(ObjectNode request) {
        int value = request.path("maxOutputTokens").asInt(-1);
        if (value < 1 || value > 262_144) {
            throw protocol("model_gateway.provider_request_invalid");
        }
        return value;
    }

    static ArrayNode messages(ObjectNode request) {
        JsonNode messages = request.path("messages");
        if (!(messages instanceof ArrayNode array) || array.isEmpty()) {
            throw protocol("model_gateway.provider_request_invalid");
        }
        return array;
    }

    static ArrayNode tools(ObjectNode request) {
        JsonNode tools = request.path("tools");
        if (tools instanceof ArrayNode array) {
            return array;
        }
        throw protocol("model_gateway.provider_request_invalid");
    }

    static String joinedText(JsonNode message) {
        JsonNode content = message.path("content");
        if (!(content instanceof ArrayNode parts)) {
            throw protocol("model_gateway.provider_request_invalid");
        }
        StringBuilder text = new StringBuilder();
        for (JsonNode part : parts) {
            if (!"text".equals(part.path("type").asText())) {
                throw protocol("model_gateway.provider_request_invalid");
            }
            text.append(part.path("text").asText());
        }
        return text.toString();
    }

    static String firstHeader(Map<String, List<String>> headers, String name) {
        return headers.entrySet().stream()
                .filter(entry -> entry.getKey().equalsIgnoreCase(name))
                .flatMap(entry -> entry.getValue().stream())
                .findFirst()
                .orElse(null);
    }

    static String boundedText(JsonNode node, String field, int maximumBytes) {
        String value = node.path(field).asText(null);
        if (value == null
                || value.isBlank()
                || value.getBytes(StandardCharsets.UTF_8).length > maximumBytes) {
            throw protocol("model_gateway.provider_event_invalid");
        }
        return value;
    }

    static ModelGatewayException protocol(String code) {
        return ModelGatewayException.validation(
                code,
                "The model provider response violated the protocol.");
    }
}
