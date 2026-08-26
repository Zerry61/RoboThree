package com.robothree.central.contract;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

class EnterpriseContractConformanceTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final JsonSchemaSubsetValidator validator =
            new JsonSchemaSubsetValidator(objectMapper);

    @Test
    void javaAcceptsAndRejectsTheCanonicalSharedFixtureCorpus() throws IOException {
        JsonNode manifest = validator.readResource("fixtures/manifest.json");
        assertThat(manifest.path("contractVersion").asText()).isEqualTo("v1alpha1");

        for (JsonNode fixtureCase : manifest.path("cases")) {
            String schemaName = fixtureCase.path("schema").asText();
            String fixtureFile = fixtureCase.path("file").asText();
            boolean expectedValid = fixtureCase.path("valid").asBoolean();
            JsonNode fixture = validator.readResource("fixtures/" + fixtureFile);
            List<String> errors = validator.validate(schemaName, fixture);
            assertThat(errors.isEmpty())
                    .as(fixtureFile + ": " + String.join("; ", errors))
                    .isEqualTo(expectedValid);
        }
    }

    @Test
    void canonicalSchemasRemainStrictAndUseDraft202012() throws IOException {
        List<String> schemaNames = List.of(
                "access-token-claims",
                "compatibility",
                "configuration-snapshot",
                "descriptor",
                "device-challenge",
                "enrollment",
                "error",
                "exact-package-read",
                "model-invocation-recovery",
                "model-invocation",
                "package-document",
                "token");

        for (String schemaName : schemaNames) {
            JsonNode schema = validator.readResource("schemas/" + schemaName + ".schema.json");
            assertThat(schema.path("$schema").asText())
                    .as(schemaName)
                    .isEqualTo("https://json-schema.org/draft/2020-12/schema");
            assertThat(containsStrictObject(schema))
                    .as(schemaName + " must contain a strict object boundary")
                    .isTrue();
        }
    }

    @Test
    void javaMatchesCanonicalJsonAndSha256Fixture()
            throws IOException, NoSuchAlgorithmException {
        JsonNode manifest = validator.readResource("fixtures/manifest.json");
        JsonNode digestFixture = manifest.path("canonicalDigest");
        String canonical = canonicalJson(digestFixture.path("value"));
        String digest = HexFormat.of().formatHex(
                MessageDigest.getInstance("SHA-256")
                        .digest(canonical.getBytes(StandardCharsets.UTF_8)));

        assertThat(canonical).isEqualTo(digestFixture.path("canonicalJson").asText());
        assertThat(digest).isEqualTo(digestFixture.path("sha256").asText());
    }

    @Test
    void clientConfigurationNeverContainsEnterpriseCredentialReference() throws IOException {
        JsonNode descriptor = validator.readResource("fixtures/valid/model-descriptor.json");
        JsonNode snapshot =
                validator.readResource("fixtures/valid/configuration-snapshot.json");

        assertThat(containsField(descriptor, "credentialRef")).isFalse();
        assertThat(containsField(snapshot, "credentialRef")).isFalse();
        assertThat(validator.validate("descriptor", descriptor)).isEmpty();
        assertThat(validator.validate("configuration-snapshot", snapshot)).isEmpty();
    }

    @Test
    void identityProtocolRequiresBoundDeviceClaimsAndRejectsPrivateKeyLeakage() throws IOException {
        JsonNode tokenRequest = validator.readResource("fixtures/valid/token-request.json");
        JsonNode claims = validator.readResource("fixtures/valid/access-token-claims.json");
        JsonNode missingDevice =
                validator.readResource("fixtures/invalid/access-token-claims-missing-device.json");
        JsonNode privateKeyLeak =
                validator.readResource("fixtures/invalid/token-private-key-leak.json");

        assertThat(validator.validate("token", tokenRequest)).isEmpty();
        assertThat(validator.validate("access-token-claims", claims)).isEmpty();
        assertThat(validator.validate("access-token-claims", missingDevice)).isNotEmpty();
        assertThat(validator.validate("token", privateKeyLeak)).isNotEmpty();
        assertThat(containsField(tokenRequest, "privateKey")).isFalse();
        assertThat(containsField(tokenRequest, "keychainHandle")).isFalse();
        assertThat(containsField(tokenRequest, "providerReference")).isFalse();
        assertThat(claims.has("enterpriseId")).isTrue();
        assertThat(claims.has("userId")).isTrue();
        assertThat(claims.has("deviceId")).isTrue();
        assertThat(claims.has("clientInstanceId")).isTrue();
        assertThat(claims.has("tokenId")).isTrue();
    }

    @Test
    void compatibilityAndFixtureCorpusPublishDeviceTrustAndAntiReplaySemantics()
            throws IOException {
        JsonNode compatibility = validator.readResource("fixtures/valid/compatibility.json");
        Set<String> features = new HashSet<>();
        compatibility.path("features").forEach(item -> features.add(item.asText()));
        assertThat(features).contains(
                "enterprise_identity",
                "managed_device_trust",
                "manual_device_enrollment",
                "enterprise_model_gateway");
        assertThat(features).doesNotContain("enterprise_sso");

        Set<String> expectedCodes = Set.of(
                "device_not_managed",
                "device_not_compliant",
                "device_access_denied",
                "device_challenge_expired",
                "device_challenge_replayed",
                "device_signature_invalid",
                "device_context_mismatch");
        JsonNode manifest = validator.readResource("fixtures/manifest.json");
        Set<String> actualCodes = new HashSet<>();
        for (JsonNode fixtureCase : manifest.path("cases")) {
            if (fixtureCase.path("valid").asBoolean()
                    && "error".equals(fixtureCase.path("schema").asText())
                    && fixtureCase.path("file").asText().contains("device-")) {
                JsonNode fixture =
                        validator.readResource("fixtures/" + fixtureCase.path("file").asText());
                actualCodes.add(fixture.path("code").asText());
            }
        }
        assertThat(actualCodes).containsExactlyInAnyOrderElementsOf(expectedCodes);
    }

    @Test
    void packageUtf8ContentHasANonBypassableByteLimit() throws IOException {
        JsonNode fixture = validator.readResource("fixtures/valid/skill-package.json");
        JsonNode oversized = fixture.deepCopy();
        String content = "界".repeat(174_763);
        ((ObjectNode) oversized.path("files").get(0)).put("utf8Content", content);

        assertThat(content.getBytes(StandardCharsets.UTF_8).length).isGreaterThan(524_288);
        assertThat(validator.validate("package-document", fixture)).isEmpty();
        assertThat(validator.validate("package-document", oversized))
                .anyMatch(error -> error.contains("UTF-8 byte limit exceeded"));
    }

    @Test
    void exactPackageReadIsSnapshotBoundAndNeverAcceptsLatestOrUnknownFields()
            throws IOException {
        JsonNode exactReference =
                validator.readResource("fixtures/valid/exact-package-read.json");
        JsonNode latestReference =
                validator.readResource("fixtures/invalid/exact-package-read-latest.json");
        JsonNode unknownField =
                validator.readResource("fixtures/invalid/exact-package-read-unknown-field.json");

        assertThat(validator.validate("exact-package-read", exactReference)).isEmpty();
        assertThat(validator.validate("exact-package-read", latestReference)).isNotEmpty();
        assertThat(validator.validate("exact-package-read", unknownField)).isNotEmpty();
        assertThat(exactReference.has("snapshotId")).isTrue();
        assertThat(exactReference.has("snapshotRevision")).isTrue();
        assertThat(exactReference.has("snapshotDigest")).isTrue();
        assertThat(exactReference.path("packageRevision").asText()).isNotEqualTo("latest");
    }

    @Test
    void modelInvocationHttpSurfaceIsGetPostOnlyAndBindsExactSchemaBranches()
            throws IOException {
        String openApi = validator.readTextResource("openapi.yaml");
        assertThat(openApi).contains(
                "/v1alpha1/model-invocations:",
                "/v1alpha1/model-invocations/{invocationId}:",
                "/v1alpha1/model-invocations/{invocationId}/cancel:",
                "/v1alpha1/model-invocations/{invocationId}/events:",
                "acceptModelInvocation",
                "getModelInvocation",
                "cancelModelInvocation",
                "streamModelInvocationEvents",
                "model-invocation.schema.json#/$defs/acceptRequest",
                "model-invocation.schema.json#/$defs/acceptedResponse",
                "model-invocation.schema.json#/$defs/statusResponse",
                "model-invocation.schema.json#/$defs/cancelRequest",
                "model-invocation.schema.json#/$defs/eventEnvelope",
                "text/event-stream");
        assertThat(openApi).doesNotContain("\n    put:", "\n    patch:", "\n    delete:");
    }

    @Test
    void modelAcceptRequestCannotSelfDeclareIdentityCredentialsEndpointsOrRecoveryLease()
            throws IOException {
        for (String fixtureFile : List.of(
                "valid/model-invocation-accept-synthetic.json",
                "valid/model-invocation-accept-user-confirmed.json")) {
            JsonNode fixture = validator.readResource("fixtures/" + fixtureFile);
            assertThat(validator.validate("model-invocation", fixture)).isEmpty();
            assertThat(fixture.path("audience").asText())
                    .isEqualTo("enterprise-model-gateway");
            assertThat(fixture.path("requiredPermission").asText())
                    .isEqualTo("model.use");
            for (String forbidden : List.of(
                    "enterpriseId",
                    "userId",
                    "deviceId",
                    "credentialRef",
                    "apiKey",
                    "accessToken",
                    "providerEndpoint",
                    "leaseTtlMillis",
                    "recoveryQueryDeadlineMillis")) {
                assertThat(containsField(fixture, forbidden))
                        .as(fixtureFile + ": " + forbidden)
                        .isFalse();
            }
        }
    }

    @Test
    void modelEventsSeparateDurableFactsFromEphemeralDeltasAndMatchLifecycleStatus()
            throws IOException {
        JsonNode durable =
                validator.readResource("fixtures/valid/model-invocation-event-durable.json");
        JsonNode ephemeral =
                validator.readResource("fixtures/valid/model-invocation-event-text-delta.json");
        assertThat(durable.path("eventClass").asText()).isEqualTo("durable");
        assertThat(durable.has("durableSequence")).isTrue();
        assertThat(durable.has("durableCursor")).isTrue();
        assertThat(durable.has("streamSequence")).isFalse();
        assertThat(ephemeral.path("eventClass").asText()).isEqualTo("ephemeral");
        assertThat(ephemeral.has("streamSequence")).isTrue();
        assertThat(ephemeral.has("durableSequence")).isFalse();
        assertThat(ephemeral.has("durableCursor")).isFalse();
        assertThat(lifecycleEventMatchesPayload(durable)).isTrue();

        ObjectNode mismatch = durable.deepCopy();
        ((ObjectNode) mismatch.path("eventPayload")).put("status", "completed");
        assertThat(lifecycleEventMatchesPayload(mismatch)).isFalse();
    }

    @Test
    void modelContentAndStreamDeltaUtf8LimitsCannotBeBypassed() throws IOException {
        ObjectNode accept = validator
                .readResource("fixtures/valid/model-invocation-accept-synthetic.json")
                .deepCopy();
        ObjectNode textPart = (ObjectNode) accept
                .path("modelRequest")
                .path("messages")
                .path(1)
                .path("content")
                .path(0);
        textPart.put("text", "界".repeat(174_763));
        assertThat(validator.validateDefinition("model-invocation", "textPart", textPart))
                .anyMatch(error -> error.contains("UTF-8 byte limit exceeded"));

        ObjectNode event = validator
                .readResource("fixtures/valid/model-invocation-event-text-delta.json")
                .deepCopy();
        ((ObjectNode) event.path("eventPayload")).put("delta", "界".repeat(43_691));
        assertThat(validator.validateDefinition(
                        "model-invocation", "ephemeralTextDeltaEvent", event))
                .anyMatch(error -> error.contains("UTF-8 byte limit exceeded"));
    }

    @Test
    void recoveryPolicyIsServerOwnedAndEveryDurableCommitIsFenced() throws IOException {
        JsonNode policy =
                validator.readResource("fixtures/valid/model-invocation-recovery-policy.json");
        JsonNode lease =
                validator.readResource("fixtures/valid/model-invocation-recovery-lease.json");
        JsonNode commit = validator.readResource(
                "fixtures/valid/model-invocation-recovery-fenced-commit.json");
        assertThat(validator.validate("model-invocation-recovery", policy)).isEmpty();
        assertThat(validator.validate("model-invocation-recovery", lease)).isEmpty();
        assertThat(validator.validate("model-invocation-recovery", commit)).isEmpty();
        assertThat(policy.has("leaseTtlMillis")).isTrue();
        assertThat(policy.has("recoveryQueryDeadlineMillis")).isTrue();
        assertThat(policy.has("providerRequestDeadlineAt")).isFalse();
        assertThat(policy.has("providerStreamIdleTimeoutMillis")).isFalse();
        assertThat(lease.path("fencingEpoch").asLong()).isPositive();
        assertThat(commit.path("fencingEpoch").asLong()).isPositive();
        assertThat(commit.has("expectedStatusRevision")).isTrue();
        assertThat(commit.has("nextDurableSequence")).isTrue();
    }

    @Test
    void anthropicAndOpenAiStubFramesNormalizeToTheSameProviderNeutralProjection()
            throws IOException {
        JsonNode expected = validator.readResource(
                "fixtures/provider-stubs/provider-neutral-projection.json");
        JsonNode anthropic = validator.readResource(
                "fixtures/provider-stubs/anthropic-compatible-stream.json");
        JsonNode openAi = validator.readResource(
                "fixtures/provider-stubs/openai-compatible-stream.json");
        assertThat(normalizeProviderStub(anthropic)).isEqualTo(expected.path("events"));
        assertThat(normalizeProviderStub(openAi)).isEqualTo(expected.path("events"));
    }

    @Test
    void javaEvaluatesSharedSequenceIdempotencyTimeoutAndFencingScenarios()
            throws IOException {
        JsonNode sequenceFixture = validator.readResource(
                "fixtures/conformance/model-invocation-sequences.json");
        for (JsonNode scenario : sequenceFixture.path("scenarios")) {
            String currentStatus = null;
            int expectedSequence = 1;
            Map<String, String> eventIds = new HashMap<>();
            boolean valid = true;
            for (JsonNode event : scenario.path("events")) {
                if (event.path("durableSequence").asInt() != expectedSequence++) {
                    valid = false;
                    break;
                }
                String eventId = event.path("eventId").asText();
                if (eventIds.putIfAbsent(eventId, event.path("eventDigest").asText()) != null) {
                    valid = false;
                    break;
                }
                String expectedStatus = switch (event.path("eventType").asText()) {
                    case "accepted" -> "accepted";
                    case "dispatch_decided" -> "running";
                    case "completed" -> "completed";
                    case "failed" -> "failed";
                    case "cancelled" -> "cancelled";
                    case "timed_out" -> "timed_out";
                    case "uncertain" -> "uncertain";
                    default -> "";
                };
                String nextStatus = event.path("status").asText();
                if (!expectedStatus.equals(nextStatus)
                        || !transitionAllowed(currentStatus, nextStatus)) {
                    valid = false;
                    break;
                }
                currentStatus = nextStatus;
            }
            assertThat(valid)
                    .as(scenario.path("name").asText())
                    .isEqualTo(scenario.path("expectedValid").asBoolean());
        }

        JsonNode decisions = validator.readResource(
                "fixtures/conformance/model-invocation-decisions.json");
        for (JsonNode item : decisions.path("idempotency")) {
            String decision;
            if (!item.path("existingClientRequestId")
                    .equals(item.path("candidateClientRequestId"))) {
                decision = "accept";
            } else if (item.path("existingDigest").equals(item.path("candidateDigest"))) {
                decision = "replay";
            } else {
                decision = "conflict";
            }
            assertThat(decision)
                    .as(item.path("name").asText())
                    .isEqualTo(item.path("expectedDecision").asText());
        }
        for (JsonNode item : decisions.path("outcomes")) {
            String status;
            if (!item.path("dispatchPersisted").asBoolean()) {
                status = "timed_out";
            } else if (item.path("trustedProviderTimeout").asBoolean()) {
                status = "timed_out";
            } else if (!item.path("providerOutcomeKnown").asBoolean()
                    && item.path("recoveryEvidenceExhausted").asBoolean()) {
                status = "uncertain";
            } else {
                status = "running";
            }
            assertThat(status)
                    .as(item.path("name").asText())
                    .isEqualTo(item.path("expectedStatus").asText());
        }
        for (JsonNode item : decisions.path("recovery")) {
            String decision = "rejected";
            int currentEpoch = item.path("currentEpoch").asInt();
            int resultEpoch = currentEpoch;
            int expectedEpoch = item.path("expectedEpoch").asInt();
            switch (item.path("claimType").asText()) {
                case "acquire" -> {
                    if (currentEpoch == 0 && expectedEpoch == 0) {
                        decision = "acquired";
                        resultEpoch = 1;
                    }
                }
                case "renew" -> {
                    if (currentEpoch == expectedEpoch && item.path("ownerMatches").asBoolean()) {
                        decision = "renewed";
                    }
                }
                case "takeover" -> {
                    if (currentEpoch == expectedEpoch && item.path("leaseExpired").asBoolean()) {
                        decision = "taken_over";
                        resultEpoch = currentEpoch + 1;
                    }
                }
                case "commit" -> {
                    if (currentEpoch != expectedEpoch
                            || !item.path("ownerMatches").asBoolean()) {
                        decision = "fencing_conflict";
                    }
                }
                default -> {
                }
            }
            assertThat(decision)
                    .as(item.path("name").asText())
                    .isEqualTo(item.path("expectedDecision").asText());
            assertThat(resultEpoch)
                    .as(item.path("name").asText())
                    .isEqualTo(item.path("resultEpoch").asInt());
        }
    }

    private boolean transitionAllowed(String currentStatus, String nextStatus) {
        if (currentStatus == null) {
            return "accepted".equals(nextStatus);
        }
        if ("accepted".equals(currentStatus)) {
            return Set.of("running", "failed", "cancelled", "timed_out")
                    .contains(nextStatus);
        }
        if ("running".equals(currentStatus)) {
            return Set.of("completed", "failed", "cancelled", "timed_out", "uncertain")
                    .contains(nextStatus);
        }
        return false;
    }

    private boolean lifecycleEventMatchesPayload(JsonNode event) {
        if (!"durable".equals(event.path("eventClass").asText())) {
            return false;
        }
        String expectedStatus = switch (event.path("eventType").asText()) {
            case "accepted" -> "accepted";
            case "dispatch_decided" -> "running";
            case "completed" -> "completed";
            case "failed" -> "failed";
            case "cancelled" -> "cancelled";
            case "timed_out" -> "timed_out";
            case "uncertain" -> "uncertain";
            default -> "";
        };
        return !expectedStatus.isEmpty()
                && expectedStatus.equals(event.path("eventPayload").path("status").asText());
    }

    private ArrayNode normalizeProviderStub(JsonNode fixture) {
        ArrayNode events = objectMapper.createArrayNode();
        String protocol = fixture.path("protocol").asText();
        for (JsonNode frame : fixture.path("frames")) {
            if ("anthropic_compatible".equals(protocol)) {
                normalizeAnthropicFrame(events, frame);
            } else if ("openai_compatible".equals(protocol)) {
                normalizeOpenAiFrame(events, frame);
            } else {
                throw new IllegalArgumentException("unsupported test protocol");
            }
        }
        return events;
    }

    private void normalizeAnthropicFrame(ArrayNode events, JsonNode frame) {
        if ("message_start".equals(frame.path("type").asText())) {
            events.add(event("started", objectMapper.createObjectNode()));
        } else if ("content_block_delta".equals(frame.path("type").asText())
                && "text_delta".equals(frame.path("delta").path("type").asText())) {
            ObjectNode payload = objectMapper.createObjectNode();
            payload.put("delta", frame.path("delta").path("text").asText());
            events.add(event("text_delta", payload));
        } else if ("message_delta".equals(frame.path("type").asText())) {
            ObjectNode payload = objectMapper.createObjectNode();
            payload.put(
                    "finishReason",
                    "end_turn".equals(frame.path("stop_reason").asText())
                            ? "stop"
                            : frame.path("stop_reason").asText());
            payload.set("usage", usage(
                    frame.path("usage").path("input_tokens").asInt(),
                    frame.path("usage").path("output_tokens").asInt()));
            events.add(event("completed", payload));
        }
    }

    private void normalizeOpenAiFrame(ArrayNode events, JsonNode frame) {
        JsonNode choice = frame.path("choices").path(0);
        JsonNode delta = choice.path("delta");
        if ("assistant".equals(delta.path("role").asText())) {
            events.add(event("started", objectMapper.createObjectNode()));
        }
        if (delta.path("content").isTextual()) {
            ObjectNode payload = objectMapper.createObjectNode();
            payload.put("delta", delta.path("content").asText());
            events.add(event("text_delta", payload));
        }
        if (choice.path("finish_reason").isTextual()) {
            ObjectNode payload = objectMapper.createObjectNode();
            payload.put("finishReason", choice.path("finish_reason").asText());
            payload.set("usage", usage(
                    frame.path("usage").path("prompt_tokens").asInt(),
                    frame.path("usage").path("completion_tokens").asInt()));
            events.add(event("completed", payload));
        }
    }

    private ObjectNode event(String eventType, JsonNode payload) {
        ObjectNode event = objectMapper.createObjectNode();
        event.put("eventType", eventType);
        event.set("payload", payload);
        return event;
    }

    private ObjectNode usage(int inputTokens, int outputTokens) {
        ObjectNode usage = objectMapper.createObjectNode();
        usage.put("inputTokens", inputTokens);
        usage.put("outputTokens", outputTokens);
        return usage;
    }

    private boolean containsStrictObject(JsonNode node) {
        if (node.isObject()
                && "object".equals(node.path("type").asText())
                && node.path("additionalProperties").isBoolean()
                && !node.path("additionalProperties").asBoolean()) {
            return true;
        }
        if (node.isContainerNode()) {
            Iterator<JsonNode> children = node.elements();
            while (children.hasNext()) {
                if (containsStrictObject(children.next())) {
                    return true;
                }
            }
        }
        return false;
    }

    private boolean containsField(JsonNode node, String fieldName) {
        if (node.isObject() && node.has(fieldName)) {
            return true;
        }
        if (!node.isContainerNode()) {
            return false;
        }
        List<JsonNode> children = new ArrayList<>();
        node.elements().forEachRemaining(children::add);
        return children.stream().anyMatch(child -> containsField(child, fieldName));
    }

    private String canonicalJson(JsonNode node) throws IOException {
        if (node.isObject()) {
            List<String> fields = new ArrayList<>();
            node.fieldNames().forEachRemaining(fields::add);
            fields.sort(String::compareTo);
            List<String> members = new ArrayList<>();
            for (String field : fields) {
                members.add(
                        objectMapper.writeValueAsString(field)
                                + ":"
                                + canonicalJson(node.get(field)));
            }
            return "{" + String.join(",", members) + "}";
        }
        if (node.isArray()) {
            List<String> items = new ArrayList<>();
            for (JsonNode item : node) {
                items.add(canonicalJson(item));
            }
            return "[" + String.join(",", items) + "]";
        }
        return objectMapper.writeValueAsString(node);
    }
}
