package com.robothree.central.shared.json;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;

public final class CanonicalJson {

    private static final ObjectMapper JSON = new ObjectMapper();

    private CanonicalJson() {}

    public static ObjectNode parseObject(String documentJson, int maximumBytes) {
        if (documentJson == null
                || documentJson.getBytes(StandardCharsets.UTF_8).length > maximumBytes) {
            throw new IllegalArgumentException("JSON document is missing or exceeds its limit");
        }
        try {
            JsonNode parsed = JSON.readTree(documentJson);
            if (!(parsed instanceof ObjectNode object)) {
                throw new IllegalArgumentException("JSON document must be an object");
            }
            return object;
        } catch (JsonProcessingException exception) {
            throw new IllegalArgumentException("JSON document is invalid", exception);
        }
    }

    public static String canonicalize(JsonNode value) {
        try {
            return JSON.writeValueAsString(sorted(value));
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("canonical JSON serialization failed", exception);
        }
    }

    public static String digestExcluding(ObjectNode document, String excludedField) {
        ObjectNode copy = document.deepCopy();
        copy.remove(excludedField);
        return sha256(canonicalize(copy));
    }

    public static String sha256(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private static JsonNode sorted(JsonNode value) {
        if (value.isObject()) {
            ObjectNode result = JSON.createObjectNode();
            List<Map.Entry<String, JsonNode>> fields =
                    new ArrayList<>(value.properties());
            fields.stream()
                    .sorted(Comparator.comparing(Map.Entry::getKey))
                    .forEach(entry -> result.set(entry.getKey(), sorted(entry.getValue())));
            return result;
        }
        if (value.isArray()) {
            ArrayNode result = JSON.createArrayNode();
            value.forEach(item -> result.add(sorted(item)));
            return result;
        }
        return value.deepCopy();
    }
}
