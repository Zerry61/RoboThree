package com.robothree.central.contract;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

class EnterpriseIdentityCompositionContractConformanceTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final JsonSchemaSubsetValidator validator = new JsonSchemaSubsetValidator(
            objectMapper,
            "enterprise-identity-composition",
            "v1alpha1");

    @Test
    void javaAcceptsAndRejectsTheCanonicalEipcCorpus() throws IOException {
        JsonNode manifest = validator.readResource("fixtures/manifest.json");
        assertThat(manifest.path("contractVersion").asText()).isEqualTo("eipc.v1alpha1");
        for (JsonNode fixtureCase : manifest.path("cases")) {
            JsonNode fixture = validator.readResource(
                    "fixtures/" + fixtureCase.path("file").asText());
            var errors = validator.validate("authority-semantics", fixture);
            assertThat(errors.isEmpty())
                    .as(fixtureCase.path("file").asText() + ": " + String.join("; ", errors))
                    .isEqualTo(fixtureCase.path("valid").asBoolean());
        }
    }

    @Test
    void eipcContractIsStrictAndContainsNoSecretTransportFields() throws IOException {
        JsonNode schema = validator.readResource("schemas/authority-semantics.schema.json");
        String schemaText = objectMapper.writeValueAsString(schema);
        assertThat(schema.path("$schema").asText())
                .isEqualTo("https://json-schema.org/draft/2020-12/schema");
        assertThat(schemaText).contains(
                "personal_model.configure",
                "activationClientInstanceId",
                "currentClientInstanceId",
                "sourceFactsDigest");
        assertThat(schemaText).doesNotContain(
                "compactToken",
                "accessToken",
                "refreshToken",
                "privateKey",
                "deviceProof",
                "credentialRef");
    }

    @Test
    void ownerIdentityExcludesClientInstanceWhileBindingKeepsBothClientRoles()
            throws IOException {
        JsonNode snapshot = validator.readResource("fixtures/valid/authority-snapshot.json");
        JsonNode owner = snapshot.path("binding").path("ownerIdentity");
        assertThat(fieldNames(owner)).containsExactlyInAnyOrder(
                "enterpriseId", "userId", "deviceId");
        assertThat(snapshot.path("binding").path("activationClientInstanceId").asText())
                .isNotEqualTo(snapshot.path("binding").path("currentClientInstanceId").asText());
    }

    @Test
    void canonicalEipcFilesRemainByteStable()
            throws IOException, NoSuchAlgorithmException {
        Map<String, String> expected = Map.of(
                "schemas/authority-semantics.schema.json",
                "d03751b1713e095f073c9dd30d89a24c844e315dcbbe4e620b97a3f527ba7e35",
                "fixtures/manifest.json",
                "4c03200538af358d5d2d3b44c5769b16fe9ef0f78e634f1c2706163e115c3e30",
                "README.md",
                "fe35121184d92321797bed3a34f681633b30b7c4a4d9da6f76c7d27fb4f5f65a");
        for (var entry : expected.entrySet()) {
            String actual = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(validator.readTextResource(entry.getKey())
                            .getBytes(StandardCharsets.UTF_8)));
            assertThat(actual).as(entry.getKey()).isEqualTo(entry.getValue());
        }
    }

    @Test
    void legacyGatewayV1Alpha1DoesNotPretendToCarryPersonalModelEntitlement()
            throws IOException {
        JsonSchemaSubsetValidator gateway = new JsonSchemaSubsetValidator(objectMapper, "v1alpha1");
        JsonNode legacyClaims = gateway.readResource("fixtures/valid/access-token-claims.json");
        java.util.ArrayList<String> permissions = new java.util.ArrayList<>();
        legacyClaims.path("permissions").forEach(value -> permissions.add(value.asText()));
        assertThat(permissions).doesNotContain("personal_model.configure");
        assertThat(gateway.readTextResource("schemas/access-token-claims.schema.json"))
                .doesNotContain("personal_model.configure");
    }

    private Set<String> fieldNames(JsonNode node) {
        java.util.HashSet<String> names = new java.util.HashSet<>();
        node.fieldNames().forEachRemaining(names::add);
        return Set.copyOf(names);
    }
}
