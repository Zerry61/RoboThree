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
import org.junit.jupiter.api.Test;

class EnterpriseContractV1Alpha3ConformanceTest {
    private final JsonSchemaSubsetValidator validator =
            new JsonSchemaSubsetValidator(new ObjectMapper(), "v1alpha3");

    @Test
    void javaAcceptsAndRejectsTheV1Alpha3FixtureCorpus() throws IOException {
        JsonNode manifest = validator.readResource("fixtures/manifest.json");
        assertThat(manifest.path("contractVersion").asText()).isEqualTo("v1alpha3");
        for (JsonNode fixtureCase : manifest.path("cases")) {
            JsonNode fixture = validator.readResource(
                    "fixtures/" + fixtureCase.path("file").asText());
            var errors = validator.validate(
                    fixtureCase.path("schema").asText(), fixture);
            assertThat(errors.isEmpty())
                    .as(fixtureCase.path("file").asText() + ": " + String.join("; ", errors))
                    .isEqualTo(fixtureCase.path("valid").asBoolean());
        }
    }

    @Test
    void canonicalFilesMatchPublishedDigests()
            throws IOException, NoSuchAlgorithmException {
        Map<String, String> expected = Map.of(
                "schemas/model-invocation.schema.json",
                "0ba2f3e903643a140059960bbaad3272bf35a4df2dbadc60d23f4dd2afa63a21",
                "schemas/compatibility.schema.json",
                "630505fd8efec461fe0bfd9a30188b431e9590417891fe03d08bb53c1912f8bc",
                "openapi.yaml",
                "958d0a2ca5fee08bf7b474687d7001f01deb83e764f87ab140b6813fea912aa1",
                "fixtures/manifest.json",
                "9394e4b6da2b69e322d31ed789572a0aa3a74ef070a4c555cfbbc7ddc008ddab");
        for (var entry : expected.entrySet()) {
            String actual = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(validator.readTextResource(entry.getKey())
                            .getBytes(StandardCharsets.UTF_8)));
            assertThat(actual).as(entry.getKey()).isEqualTo(entry.getValue());
        }
    }
}
