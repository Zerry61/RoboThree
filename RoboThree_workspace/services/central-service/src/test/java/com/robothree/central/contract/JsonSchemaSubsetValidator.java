package com.robothree.central.contract;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

final class JsonSchemaSubsetValidator {

    private static final String CANONICAL_CONTRACT_PREFIX =
            "https://robothree.local/contracts/";
    private static final String SAFE_EIPC_SEMANTICS_RESOURCE =
            "enterprise-identity-composition/v1alpha1/schemas/authority-semantics.schema.json";

    private final ObjectMapper objectMapper;
    private final String resourceRoot;

    JsonSchemaSubsetValidator(ObjectMapper objectMapper) {
        this(objectMapper, "v1alpha1");
    }

    JsonSchemaSubsetValidator(ObjectMapper objectMapper, String contractVersion) {
        this(objectMapper, "enterprise-gateway", contractVersion);
    }

    JsonSchemaSubsetValidator(
            ObjectMapper objectMapper,
            String contractFamily,
            String contractVersion) {
        this.objectMapper = objectMapper;
        boolean supported = switch (contractFamily) {
            case "enterprise-gateway" -> Set.of(
                    "v1alpha1", "v1alpha2", "v1alpha3").contains(contractVersion);
            case "enterprise-identity-composition", "enterprise-session" ->
                    "v1alpha1".equals(contractVersion);
            default -> false;
        };
        if (!supported) {
            throw new IllegalArgumentException("Unsupported test Contract version");
        }
        this.resourceRoot = "/" + contractFamily + "/" + contractVersion + "/";
    }

    JsonNode readResource(String relativePath) throws IOException {
        try (InputStream input = getClass().getResourceAsStream(resourceRoot + relativePath)) {
            if (input == null) {
                throw new IOException("Missing canonical resource: " + relativePath);
            }
            return objectMapper.readTree(input);
        }
    }

    String readTextResource(String relativePath) throws IOException {
        try (InputStream input = getClass().getResourceAsStream(resourceRoot + relativePath)) {
            if (input == null) {
                throw new IOException("Missing canonical resource: " + relativePath);
            }
            return new String(input.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    List<String> validate(String schemaName, JsonNode value) throws IOException {
        JsonNode schema = readResource("schemas/" + schemaName + ".schema.json");
        return validate(schema, value, schema);
    }

    List<String> validateDefinition(String schemaName, String definition, JsonNode value)
            throws IOException {
        JsonNode schema = readResource("schemas/" + schemaName + ".schema.json");
        return validate(schema.path("$defs").path(definition), value, schema);
    }

    private List<String> validate(JsonNode schema, JsonNode value, JsonNode rootSchema)
            throws IOException {
        if (schema == null || !schema.isObject()) {
            return List.of("schema is not an object");
        }

        JsonNode reference = schema.get("$ref");
        if (reference != null && reference.isTextual()) {
            String ref = reference.textValue();
            if (ref.startsWith("#")) {
                return validate(rootSchema.at(ref.substring(1)), value, rootSchema);
            }
            if (ref.startsWith(CANONICAL_CONTRACT_PREFIX)) {
                return validateQualifiedCanonicalReference(ref, value);
            }
            String[] parts = ref.split("#", 2);
            JsonNode externalSchema = readResource("schemas/" + parts[0]);
            JsonNode target = parts.length == 1
                    ? externalSchema
                    : externalSchema.at(parts[1]);
            return validate(target, value, externalSchema);
        }

        JsonNode oneOf = schema.get("oneOf");
        if (oneOf != null && oneOf.isArray()) {
            int matches = 0;
            for (JsonNode candidate : oneOf) {
                if (validate(candidate, value, rootSchema).isEmpty()) {
                    matches++;
                }
            }
            return matches == 1 ? List.of() : List.of("oneOf matched " + matches + " branches");
        }

        List<String> errors = new ArrayList<>();

        if (schema.has("const") && !schema.get("const").equals(value)) {
            errors.add("const mismatch");
        }
        JsonNode enumValues = schema.get("enum");
        if (enumValues != null && enumValues.isArray()) {
            boolean matched = false;
            for (JsonNode enumValue : enumValues) {
                if (enumValue.equals(value)) {
                    matched = true;
                    break;
                }
            }
            if (!matched) {
                errors.add("enum mismatch");
            }
        }

        String type = schema.path("type").asText("");
        if (!type.isEmpty() && !matchesType(type, value)) {
            errors.add("expected " + type);
            return errors;
        }

        if (value.isTextual()) {
            validateString(schema, value.textValue(), errors);
        } else if (value.isNumber()) {
            validateNumber(schema, value, errors);
        } else if (value.isArray()) {
            validateArray(schema, value, rootSchema, errors);
        } else if (value.isObject()) {
            validateObject(schema, value, rootSchema, errors);
        }

        if (schema.has("x-robothree-maxDocumentBytes")) {
            int maxBytes = schema.get("x-robothree-maxDocumentBytes").asInt();
            if (objectMapper.writeValueAsBytes(value).length > maxBytes) {
                errors.add("document byte limit exceeded");
            }
        }

        return errors;
    }

    private List<String> validateQualifiedCanonicalReference(String ref, JsonNode value)
            throws IOException {
        String qualified = ref.substring(CANONICAL_CONTRACT_PREFIX.length());
        String[] parts = qualified.split("#", 2);
        if (!SAFE_EIPC_SEMANTICS_RESOURCE.equals(parts[0])) {
            throw new IOException("Unsupported family-qualified canonical reference");
        }
        JsonNode externalSchema = readAbsoluteResource("/" + parts[0]);
        JsonNode target = parts.length == 1
                ? externalSchema
                : externalSchema.at(parts[1]);
        return validate(target, value, externalSchema);
    }

    private JsonNode readAbsoluteResource(String absolutePath) throws IOException {
        try (InputStream input = getClass().getResourceAsStream(absolutePath)) {
            if (input == null) {
                throw new IOException("Missing family-qualified canonical resource");
            }
            return objectMapper.readTree(input);
        }
    }

    private boolean matchesType(String type, JsonNode value) {
        return switch (type) {
            case "object" -> value.isObject();
            case "array" -> value.isArray();
            case "string" -> value.isTextual();
            case "boolean" -> value.isBoolean();
            case "integer" -> value.isIntegralNumber();
            case "number" -> value.isNumber();
            default -> false;
        };
    }

    private void validateString(JsonNode schema, String value, List<String> errors) {
        if (schema.has("minLength") && value.codePointCount(0, value.length()) < schema.get("minLength").asInt()) {
            errors.add("string below minLength");
        }
        if (schema.has("maxLength") && value.codePointCount(0, value.length()) > schema.get("maxLength").asInt()) {
            errors.add("string exceeds maxLength");
        }
        if (schema.has("pattern") && !Pattern.compile(schema.get("pattern").asText()).matcher(value).find()) {
            errors.add("pattern mismatch");
        }
        if (schema.has("x-robothree-maxUtf8Bytes")
                && value.getBytes(StandardCharsets.UTF_8).length
                        > schema.get("x-robothree-maxUtf8Bytes").asInt()) {
            errors.add("UTF-8 byte limit exceeded");
        }
        String format = schema.path("format").asText("");
        if ("uuid".equals(format)) {
            try {
                UUID.fromString(value);
            } catch (IllegalArgumentException exception) {
                errors.add("invalid uuid");
            }
        }
        if ("date-time".equals(format)) {
            try {
                OffsetDateTime.parse(value);
            } catch (DateTimeParseException exception) {
                errors.add("invalid date-time");
            }
        }
    }

    private void validateNumber(JsonNode schema, JsonNode value, List<String> errors) {
        if (schema.has("minimum") && value.asDouble() < schema.get("minimum").asDouble()) {
            errors.add("number below minimum");
        }
        if (schema.has("maximum") && value.asDouble() > schema.get("maximum").asDouble()) {
            errors.add("number exceeds maximum");
        }
    }

    private void validateArray(
            JsonNode schema,
            JsonNode value,
            JsonNode rootSchema,
            List<String> errors) throws IOException {
        if (schema.has("minItems") && value.size() < schema.get("minItems").asInt()) {
            errors.add("array below minItems");
        }
        if (schema.has("maxItems") && value.size() > schema.get("maxItems").asInt()) {
            errors.add("array exceeds maxItems");
        }
        if (schema.path("uniqueItems").asBoolean(false)) {
            Set<JsonNode> unique = new HashSet<>();
            value.forEach(unique::add);
            if (unique.size() != value.size()) {
                errors.add("array items are not unique");
            }
        }
        JsonNode itemSchema = schema.get("items");
        if (itemSchema != null) {
            for (int index = 0; index < value.size(); index++) {
                for (String error : validate(itemSchema, value.get(index), rootSchema)) {
                    errors.add("[" + index + "] " + error);
                }
            }
        }
    }

    private void validateObject(
            JsonNode schema,
            JsonNode value,
            JsonNode rootSchema,
            List<String> errors) throws IOException {
        JsonNode properties = schema.path("properties");
        JsonNode required = schema.get("required");
        if (required != null && required.isArray()) {
            for (JsonNode field : required) {
                if (!value.has(field.asText())) {
                    errors.add("missing required " + field.asText());
                }
            }
        }
        JsonNode dependentRequired = schema.get("dependentRequired");
        if (dependentRequired != null && dependentRequired.isObject()) {
            Iterator<String> triggers = dependentRequired.fieldNames();
            while (triggers.hasNext()) {
                String trigger = triggers.next();
                if (!value.has(trigger)) continue;
                for (JsonNode dependency : dependentRequired.path(trigger)) {
                    if (!value.has(dependency.asText())) {
                        errors.add("missing dependent " + dependency.asText());
                    }
                }
            }
        }
        if (schema.path("additionalProperties").isBoolean()
                && !schema.path("additionalProperties").asBoolean()) {
            Iterator<String> fields = value.fieldNames();
            while (fields.hasNext()) {
                String field = fields.next();
                if (!properties.has(field)) {
                    errors.add("unknown property " + field);
                }
            }
        }
        if (schema.has("maxProperties") && value.size() > schema.get("maxProperties").asInt()) {
            errors.add("object exceeds maxProperties");
        }
        if (properties.isObject()) {
            Iterator<String> names = properties.fieldNames();
            while (names.hasNext()) {
                String field = names.next();
                if (value.has(field)) {
                    for (String error : validate(properties.get(field), value.get(field), rootSchema)) {
                        errors.add(field + ": " + error);
                    }
                }
            }
        }
    }
}
