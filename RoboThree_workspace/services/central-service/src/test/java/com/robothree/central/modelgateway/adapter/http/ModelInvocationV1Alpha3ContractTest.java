package com.robothree.central.modelgateway.adapter.http;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.shared.json.CanonicalJson;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

final class ModelInvocationV1Alpha3ContractTest {
    private static final Path CONTRACT = Path.of("../..", "contracts", "enterprise-gateway", "v1alpha3");

    @Test
    void parses_default_and_max_cache_with_exact_cross_language_digest() throws Exception {
        var defaultParsed = ModelInvocationHttpMapper.parseAcceptV1Alpha3(
                fixture("valid/model-invocation-accept-default.json"));
        var maxParsed = ModelInvocationHttpMapper.parseAcceptV1Alpha3(
                fixture("valid/model-invocation-accept-max-cache.json"));

        assertThat(defaultParsed.command().requestDigest())
                .isEqualTo("11f42aa2e3e4243c51d80b16537752a74cbafc82c1d0d4db5fef4787c7cbaa6f");
        assertThat(defaultParsed.cacheContextDigest()).isNull();
        assertThat(defaultParsed.canonicalProviderRequestJson()).doesNotContain("reasoning");
        assertThat(maxParsed.command().requestDigest())
                .isEqualTo("1e6539c375d63b650848d64912883f8f6b16f5d81004a23fa7d1e4814931ab8b");
        assertThat(maxParsed.cacheContextDigest())
                .isEqualTo("6d93dc7d3c929d1506fc29c38137666a5dd9393cb34eeda555e815ad5fc52ee3");
        assertThat(maxParsed.canonicalProviderRequestJson()).doesNotContain("reasoning");
    }

    @Test
    void rejects_raw_reasoning_and_half_cache_without_version_fallback() throws Exception {
        assertThatThrownBy(() -> ModelInvocationHttpMapper.parseAcceptV1Alpha3(
                fixture("invalid/model-invocation-accept-raw-reasoning.json")))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> ModelInvocationHttpMapper.parseAcceptV1Alpha3(
                fixture("invalid/model-invocation-accept-half-cache.json")))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> ModelInvocationHttpMapper.parseAcceptV1Alpha2(
                fixture("valid/model-invocation-accept-default.json")))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private static ObjectNode fixture(String name) throws Exception {
        return CanonicalJson.parseObject(
                Files.readString(CONTRACT.resolve("fixtures").resolve(name)),
                4_194_304);
    }
}
