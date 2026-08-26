package com.robothree.central.contract;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.shared.json.CanonicalJson;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Map;
import org.junit.jupiter.api.Test;

class EnterpriseContractV1Alpha2ConformanceTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final JsonSchemaSubsetValidator validator =
            new JsonSchemaSubsetValidator(objectMapper, "v1alpha2");
    private final JsonSchemaSubsetValidator v1alpha1 =
            new JsonSchemaSubsetValidator(objectMapper, "v1alpha1");

    @Test
    void javaAcceptsAndRejectsTheV1Alpha2FixtureCorpus() throws IOException {
        JsonNode manifest = validator.readResource("fixtures/manifest.json");
        assertThat(manifest.path("contractVersion").asText()).isEqualTo("v1alpha2");
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
    void cacheContextDigestIsCanonicalAndIndependentFromSemanticRequestDigest()
            throws IOException {
        ObjectNode accept = validator.readResource(
                "fixtures/valid/model-invocation-accept-assistant.json").deepCopy();
        String semanticDigest = accept.path("requestDigest").asText();
        String expected = CanonicalJson.sha256(CanonicalJson.canonicalize(
                accept.path("cacheContext")));
        assertThat(accept.path("cacheContextDigest").asText()).isEqualTo(expected);

        ((ObjectNode) accept.path("cacheContext"))
                .put("sessionScopeDigest", "b".repeat(64));
        assertThat(CanonicalJson.sha256(CanonicalJson.canonicalize(
                accept.path("cacheContext"))))
                .isNotEqualTo(accept.path("cacheContextDigest").asText());
        assertThat(accept.path("requestDigest").asText()).isEqualTo(semanticDigest);
    }

    @Test
    void javaRecognizesTheSharedCacheContextDigestMismatchFixture() throws IOException {
        ObjectNode mismatch = validator.readResource(
                "fixtures/invalid/model-invocation-accept-cache-context-digest-mismatch.json")
                .deepCopy();

        assertThat(CanonicalJson.sha256(CanonicalJson.canonicalize(
                mismatch.path("cacheContext"))))
                .isNotEqualTo(mismatch.path("cacheContextDigest").asText());
    }

    @Test
    void v1Alpha1StrictlyRejectsTheCacheSidecar() throws IOException {
        ObjectNode legacy = v1alpha1.readResource(
                "fixtures/valid/model-invocation-accept-user-confirmed.json").deepCopy();
        ObjectNode context = objectMapper.createObjectNode();
        context.put("sessionScopeDigest", "a".repeat(64));
        legacy.set("cacheContext", context);
        legacy.put("cacheContextDigest", "6d93dc7d3c929d1506fc29c38137666a5dd9393cb34eeda555e815ad5fc52ee3");
        assertThat(v1alpha1.validate("model-invocation", legacy)).isNotEmpty();
    }

    @Test
    void v1Alpha1CanonicalFilesRemainByteStable()
            throws IOException, NoSuchAlgorithmException {
        Map<String, String> expected = Map.of(
                "schemas/model-invocation.schema.json",
                "435bc8ce0815f0ed10de6b3a567b1ecade82418f24c4aec062c8ed480cf19da7",
                "schemas/compatibility.schema.json",
                "476608f494ae9271185b03269148ca208ce45687a13e6559a6e287798750fa69",
                "openapi.yaml",
                "0b872be7678bb4451203f16213ff372fdf2da9fff224769eb37cc82b3cdac3c4",
                "fixtures/manifest.json",
                "56549c2e277ef7d270dd2922a00329139539e8fe54f7c535021c755002469648");
        for (var entry : expected.entrySet()) {
            String actual = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(v1alpha1.readTextResource(entry.getKey())
                            .getBytes(StandardCharsets.UTF_8)));
            assertThat(actual).as(entry.getKey()).isEqualTo(entry.getValue());
        }
    }

    @Test
    void v1Alpha2CanonicalFilesMatchTheirPublishedDigests()
            throws IOException, NoSuchAlgorithmException {
        Map<String, String> expected = Map.of(
                "schemas/model-invocation.schema.json",
                "d91ac7e6c144180f651ab664c1f06dd0bfe844ccd581f68ae2d4bacaebf753ef",
                "schemas/compatibility.schema.json",
                "55eadedd4511658d1eb607d1bb0b7039fa11dc97ac62cf87bd5dc6477dd4b51d",
                "openapi.yaml",
                "ffd6a92acf3c01e0bc6860b8257e96b0b8ae35d6c476a932f9594cc8bc2b9bfe",
                "fixtures/manifest.json",
                "37fb1d63a1318beadbdc979ca777aee93a52e96bd252e8b905d9e97459ef07f4");
        for (var entry : expected.entrySet()) {
            String actual = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(validator.readTextResource(entry.getKey())
                            .getBytes(StandardCharsets.UTF_8)));
            assertThat(actual).as(entry.getKey()).isEqualTo(entry.getValue());
        }
    }
}
