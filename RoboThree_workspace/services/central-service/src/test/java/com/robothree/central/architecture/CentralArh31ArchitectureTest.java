package com.robothree.central.architecture;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;
import org.junit.jupiter.api.Test;

class CentralArh31ArchitectureTest {

    private static final Path ROOT = Path.of("").toAbsolutePath().normalize();
    private static final Path SQL = ROOT.resolve("deploy/sql/postgresql");

    @Test
    void preservesV0007AndPublishesTheExactV0008Manifest() throws Exception {
        assertThat(sha256(SQL.resolve("baseline/B0007__model_invocation_foundation.sql")))
                .isEqualTo("c7a5f29568587c3cfc48fab6766374b762f5a629c77f711ea20b7cbbc79d9140");
        assertThat(sha256(SQL.resolve("upgrade/U0007__model_invocation_from_v0006.sql")))
                .isEqualTo("6feb82c722ad8dc34ff0d94f8fe6b09de7fc55e7e773dc8f1f90a09b584c944a");
        assertThat(sha256(SQL.resolve("manifest/postgresql-v0007.json")))
                .isEqualTo("883c28426232dd359eeea7d59374d2bc459ca58a1e23015e2be6f3ca37e92132");
        assertThat(Files.readString(SQL.resolve("manifest/postgresql-v0008.json")))
                .contains("\"targetSchemaVersion\":8")
                .contains("B0008__provider_usage_facts.sql")
                .contains("U0008__provider_usage_facts_from_v0007.sql")
                .contains("\"supportedEntryPaths\":[\"fresh\",\"v0007_upgrade\"]");
        assertThat(sha256(SQL.resolve("baseline/B0008__provider_usage_facts.sql")))
                .isEqualTo("46880b8f5392ae3978f19206af9205b51f82df1bb2e85339d9a8d73c77a1221c");
        assertThat(sha256(SQL.resolve("upgrade/U0008__provider_usage_facts_from_v0007.sql")))
                .isEqualTo("246419d6960487cb507276ad8173905163320200331f27803ac004e65f74f2fc");
    }

    @Test
    void keepsUsageLedgerSafeAndPromptCacheOutOfArh31() throws Exception {
        String fresh = Files.readString(SQL.resolve(
                "baseline/B0008__provider_usage_facts.sql"));
        String upgrade = Files.readString(SQL.resolve(
                "upgrade/U0008__provider_usage_facts_from_v0007.sql"));
        String mapper = Files.readString(ROOT.resolve(
                "src/main/resources/mybatis/ModelInvocationMapper.xml"));
        String usageSchema = fresh.substring(
                fresh.indexOf("CREATE TABLE model_invocation_provider_attempt"));

        assertThat(usageSchema + upgrade)
                .contains("model_invocation_provider_attempt")
                .contains("model_invocation_usage_fact")
                .contains("central_enterprise")
                .doesNotContain("prompt_text")
                .doesNotContain("output_text")
                .doesNotContain("token_delta")
                .doesNotContain("credential")
                .doesNotContain("endpoint")
                .doesNotContain("api_key")
                .doesNotContain("access_token")
                .doesNotContain("cache_context")
                .doesNotContain("prompt_cache_key");
        assertThat(mapper)
                .contains("insertProviderAttempt")
                .contains("insertProviderUsageFact")
                .doesNotContain("${")
                .doesNotContain("Wrapper")
                .doesNotContain(".last(");
    }

    private static String sha256(Path path) throws Exception {
        return HexFormat.of().formatHex(
                MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(path)));
    }
}
