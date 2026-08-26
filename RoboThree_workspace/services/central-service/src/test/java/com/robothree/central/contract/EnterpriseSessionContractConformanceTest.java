package com.robothree.central.contract;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.databind.node.TextNode;
import com.robothree.central.authentication.domain.EnterpriseSessionPersistenceDigests;
import com.robothree.central.shared.json.CanonicalJson;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class EnterpriseSessionContractConformanceTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final JsonSchemaSubsetValidator validator = new JsonSchemaSubsetValidator(
            objectMapper,
            "enterprise-session",
            "v1alpha1");

    @Test
    void javaAcceptsAndRejectsTheCanonicalEnterpriseSessionCorpus() throws IOException {
        JsonNode manifest = validator.readResource("fixtures/manifest.json");
        assertThat(manifest.path("contractVersion").asText())
                .isEqualTo("enterprise-session.v1alpha1");
        assertThat(manifest.path("claimsProfile").asText())
                .isEqualTo("eipc.session-token.v1");
        for (JsonNode fixtureCase : manifest.path("cases")) {
            JsonNode fixture = validator.readResource(
                    "fixtures/" + fixtureCase.path("file").asText());
            var errors = validator.validate(fixtureCase.path("schema").asText(), fixture);
            assertThat(errors.isEmpty())
                    .as(fixtureCase.path("file").asText() + ": " + String.join("; ", errors))
                    .isEqualTo(fixtureCase.path("valid").asBoolean());
        }
    }

    @Test
    void familyQualifiedReferencesResolveOnlyTheFrozenEipcSafeSemantics()
            throws IOException {
        JsonNode schema = validator.readResource("schemas/session-lease.schema.json");
        String schemaText = objectMapper.writeValueAsString(schema);
        assertThat(schemaText).contains(
                "https://robothree.local/contracts/enterprise-identity-composition/"
                        + "v1alpha1/schemas/authority-semantics.schema.json#/$defs/sessionAssertion",
                "https://robothree.local/contracts/enterprise-identity-composition/"
                        + "v1alpha1/schemas/authority-semantics.schema.json#/$defs/deviceTrustDecision");
        assertThat(schemaText).doesNotContain(
                "runtimeActiveSource",
                "authoritySnapshot",
                "sessionBinding");
    }

    @Test
    void javaChecksCrossDocumentLeaseInvariants() throws IOException {
        JsonNode request = validator.readResource("fixtures/valid/session-lease-request.json");
        List<String> permissions = new ArrayList<>();
        request.path("requiredPermissions").forEach(value -> permissions.add(value.asText()));
        assertThat(permissions).contains("configuration.read");
        assertThat(permissions).isSorted();

        JsonNode result = validator.readResource("fixtures/valid/session-lease-result.json");
        assertThat(result.path("expiresAt").asText())
                .isEqualTo(result.path("sessionAssertion").path("expiresAt").asText());
        assertThat(result.path("sessionAssertion").path("validity").asText()).isEqualTo("valid");
        assertThat(result.path("deviceTrustDecision").path("decision").asText())
                .isEqualTo("trusted");
        JsonNode scope = result.path("sessionAssertion").path("scope");
        JsonNode owner = result.path("deviceTrustDecision").path("ownerIdentity");
        assertThat(owner.path("enterpriseId")).isEqualTo(scope.path("enterpriseId"));
        assertThat(owner.path("userId")).isEqualTo(scope.path("userId"));
        assertThat(owner.path("deviceId")).isEqualTo(scope.path("deviceId"));
    }

    @Test
    void javaMatchesAllSixCanonicalDigestFixtures() throws IOException {
        JsonNode document = validator.readResource("fixtures/conformance/digest-materials.json");
        assertThat(document.path("cases").size()).isEqualTo(6);
        for (JsonNode fixture : document.path("cases")) {
            String canonical = CanonicalJson.canonicalize(normalizeNfc(fixture.path("value")));
            String digest = "sha256:" + CanonicalJson.sha256(
                    fixture.path("domain").asText() + "\n" + canonical);
            assertThat(canonical).as(fixture.path("name").asText())
                    .isEqualTo(fixture.path("canonicalJson").asText());
            assertThat(digest).as(fixture.path("name").asText())
                    .isEqualTo(fixture.path("sha256").asText());
        }
    }

    @Test
    void productionPersistenceDigestHelperMatchesAllSixCanonicalDigestFixtures()
            throws IOException {
        JsonNode document = validator.readResource("fixtures/conformance/digest-materials.json");
        assertThat(document.path("cases").size()).isEqualTo(6);
        for (JsonNode fixture : document.path("cases")) {
            String digest = EnterpriseSessionPersistenceDigests.wireDigest(
                    fixture.path("domain").asText(), fixture.path("value"));
            assertThat(digest).as(fixture.path("name").asText())
                    .isEqualTo(fixture.path("sha256").asText());
        }
    }

    @Test
    void canonicalJsonUsesNfcAndPreservesArrayOrder() throws IOException {
        JsonNode decomposed = objectMapper.readTree("{\"label\":\"e\\u0301\",\"list\":[\"b\",\"a\"]}");
        JsonNode composed = objectMapper.readTree("{\"list\":[\"b\",\"a\"],\"label\":\"é\"}");
        assertThat(CanonicalJson.canonicalize(normalizeNfc(decomposed)))
                .isEqualTo(CanonicalJson.canonicalize(normalizeNfc(composed)));
        JsonNode reordered = objectMapper.readTree("{\"list\":[\"a\",\"b\"],\"label\":\"é\"}");
        assertThat(CanonicalJson.canonicalize(normalizeNfc(composed)))
                .isNotEqualTo(CanonicalJson.canonicalize(normalizeNfc(reordered)));
    }

    @Test
    void openApiPublishesOnlyTheTwoNoStoreSessionOperations() throws IOException {
        String openapi = validator.readTextResource("openapi.yaml");
        assertThat(openapi).contains(
                "/enterprise-session/v1alpha1/device-challenges:",
                "/enterprise-session/v1alpha1/session-leases:",
                "operationId: issueEnterpriseSessionDeviceChallenge",
                "operationId: issueEnterpriseSessionLease",
                "const: no-store");
        assertThat(count(openapi, "    post:")).isEqualTo(2);
        assertThat(openapi).doesNotContain(
                "\n  /v1alpha1/token:",
                "\n  /v1alpha1/configuration:",
                "\n  /v1alpha1/model-invocations:");
    }

    @Test
    void publishedCanonicalDigestsMatchEveryListedFile()
            throws IOException, NoSuchAlgorithmException {
        for (String line : validator.readTextResource("CANONICAL-DIGESTS.sha256").lines().toList()) {
            if (line.isBlank()) {
                continue;
            }
            String[] parts = line.split("  ", 2);
            assertThat(parts).hasSize(2);
            String actual = sha256(validator.readTextResource(parts[1]));
            assertThat(actual).as(parts[1]).isEqualTo(parts[0]);
        }
    }

    @Test
    void legacyGatewayAndEipcCanonicalBytesRemainStable()
            throws IOException, NoSuchAlgorithmException {
        JsonSchemaSubsetValidator gateway = new JsonSchemaSubsetValidator(objectMapper, "v1alpha1");
        JsonSchemaSubsetValidator eipc = new JsonSchemaSubsetValidator(
                objectMapper,
                "enterprise-identity-composition",
                "v1alpha1");
        Map<String, String> gatewayExpected = Map.of(
                "openapi.yaml",
                "0b872be7678bb4451203f16213ff372fdf2da9fff224769eb37cc82b3cdac3c4",
                "fixtures/manifest.json",
                "56549c2e277ef7d270dd2922a00329139539e8fe54f7c535021c755002469648");
        Map<String, String> eipcExpected = Map.of(
                "schemas/authority-semantics.schema.json",
                "d03751b1713e095f073c9dd30d89a24c844e315dcbbe4e620b97a3f527ba7e35",
                "fixtures/manifest.json",
                "4c03200538af358d5d2d3b44c5769b16fe9ef0f78e634f1c2706163e115c3e30");
        assertDigests(gateway, gatewayExpected);
        assertDigests(eipc, eipcExpected);
        assertThat(gateway.readTextResource("schemas/access-token-claims.schema.json"))
                .doesNotContain("personal_model.configure", "eipc.session-token.v1");
    }

    @Test
    void wireSchemasRemainStrictAndExcludePrivateAuthorityMaterial() throws IOException {
        String schemas = String.join("\n", List.of(
                validator.readTextResource("schemas/device-challenge.schema.json"),
                validator.readTextResource("schemas/session-lease.schema.json"),
                validator.readTextResource("schemas/session-token-claims.schema.json"),
                validator.readTextResource("schemas/error.schema.json")));
        assertThat(schemas).contains(
                "enterprise-session.v1alpha1",
                "eipc.session-token.v1",
                "additionalProperties");
        assertThat(schemas).doesNotContain(
                "verifiedIdentityId",
                "privateKey",
                "credentialRef",
                "tokenDigest",
                "permissionRow");
    }

    private void assertDigests(JsonSchemaSubsetValidator source, Map<String, String> expected)
            throws IOException, NoSuchAlgorithmException {
        for (var entry : expected.entrySet()) {
            assertThat(sha256(source.readTextResource(entry.getKey())))
                    .as(entry.getKey())
                    .isEqualTo(entry.getValue());
        }
    }

    private String sha256(String value) throws NoSuchAlgorithmException {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(value.getBytes(StandardCharsets.UTF_8)));
    }

    private int count(String value, String needle) {
        return (value.length() - value.replace(needle, "").length()) / needle.length();
    }

    private JsonNode normalizeNfc(JsonNode value) {
        if (value.isTextual()) {
            return TextNode.valueOf(Normalizer.normalize(value.asText(), Normalizer.Form.NFC));
        }
        if (value.isArray()) {
            ArrayNode result = objectMapper.createArrayNode();
            value.forEach(child -> result.add(normalizeNfc(child)));
            return result;
        }
        if (value.isObject()) {
            ObjectNode result = objectMapper.createObjectNode();
            List<Map.Entry<String, JsonNode>> fields = new ArrayList<>(value.properties());
            fields.stream()
                    .map(entry -> Map.entry(
                            Normalizer.normalize(entry.getKey(), Normalizer.Form.NFC),
                            normalizeNfc(entry.getValue())))
                    .sorted(Comparator.comparing(Map.Entry::getKey))
                    .forEach(entry -> {
                        if (result.has(entry.getKey())) {
                            throw new IllegalArgumentException(
                                    "duplicate canonical key after NFC normalization");
                        }
                        result.set(entry.getKey(), entry.getValue());
                    });
            return result;
        }
        return value.deepCopy();
    }
}
