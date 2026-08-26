package com.robothree.central.architecture;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

class CentralArh322ArchitectureTest {

    private static final Path ROOT = Path.of("").toAbsolutePath().normalize();
    private static final Path MAIN = ROOT.resolve("src/main/java");
    private static final Path MODEL_GATEWAY = MAIN.resolve(
            "com/robothree/central/modelgateway");

    @Test
    void keepsPlannerDomainFreeOfSpringHttpAndPersistenceAdapters() throws IOException {
        String planner = readTree(MODEL_GATEWAY.resolve("application"));
        String domain = readTree(MODEL_GATEWAY.resolve("domain"));
        assertThat(domain)
                .doesNotContain("org.springframework")
                .doesNotContain("org.apache.ibatis")
                .doesNotContain("java.sql")
                .doesNotContain("HttpClient");
        assertThat(planner)
                .doesNotContain("JdbcTemplate")
                .doesNotContain("SqlSession")
                .doesNotContain("ModelInvocationPersistenceMapper");
    }

    @Test
    void keepsRuntimeAsTheOnlyDurableTerminalWriter() throws IOException {
        String backend = readTree(MODEL_GATEWAY.resolve("adapter/provider"))
                + readTree(MODEL_GATEWAY.resolve("adapter/runtime"));
        assertThat(backend)
                .doesNotContain("PromptCachePlanRepository")
                .doesNotContain("ModelInvocationCacheContextRepository")
                .doesNotContain("ModelInvocationRepository")
                .doesNotContain("insertImmutable(");
    }

    @Test
    void keepsProviderProjectionFieldsInsideTheArh323AdapterBoundary()
            throws IOException {
        String adapters = readTree(MODEL_GATEWAY.resolve("adapter/provider"));
        assertThat(adapters)
                .contains("cache_control")
                .contains("prompt_cache_key")
                .doesNotContain("PromptCachePlanRepository")
                .doesNotContain("PromptCacheProfileResolver");
    }

    @Test
    void keepsRequestBodiesAndCredentialsOutOfPromptCacheTables() throws IOException {
        String baseline = Files.readString(ROOT.resolve(
                "deploy/sql/postgresql/baseline/B0009__prompt_cache_planning.sql"));
        String upgrade = Files.readString(ROOT.resolve(
                "deploy/sql/postgresql/upgrade/U0009__prompt_cache_planning_from_v0008.sql"));
        String sql = baseline + "\n" + upgrade;
        assertThat(sql)
                .doesNotContain("prompt_body")
                .doesNotContain("request_body")
                .doesNotContain("response_body")
                .doesNotContain("credential_ref")
                .doesNotContain("api_key")
                .doesNotContain("endpoint_url");
    }

    @Test
    void usesExplicitMyBatisSqlWithoutDynamicInterpolation() throws IOException {
        String mapper = Files.readString(ROOT.resolve(
                "src/main/resources/mybatis/ModelInvocationMapper.xml"));
        assertThat(mapper)
                .contains("model_invocation_cache_context")
                .contains("model_invocation_prompt_cache_plan")
                .doesNotContain("${")
                .doesNotContain(".last(")
                .doesNotContain("QueryWrapper");
    }

    @Test
    void doesNotAdvanceArh323OrArh33() throws IOException {
        String sources = readTree(MODEL_GATEWAY);
        assertThat(sources)
                .doesNotContain("cacheHitProjection")
                .doesNotContain("tokenSavingsEstimate")
                .doesNotContain("PromptCacheEvidenceClosure")
                .doesNotContain("PersonalPromptCachePersistence");
    }

    @Test
    void keepsProfilesAsVersionedSeedsInsteadOfMutableDatabaseRows() throws IOException {
        String sql = Files.readString(ROOT.resolve(
                "deploy/sql/postgresql/upgrade/U0009__prompt_cache_planning_from_v0008.sql"));
        assertThat(sql)
                .doesNotContain("prompt_cache_profile")
                .doesNotContain("profile_status")
                .doesNotContain("profile_document");
    }

    @Test
    void keepsDeviceAndClientIdentityOutOfCachePlanPersistence() throws IOException {
        String plan = Files.readString(MODEL_GATEWAY.resolve("domain/PromptCachePlan.java"));
        String planner = Files.readString(MODEL_GATEWAY.resolve(
                "application/DeterministicPromptCachePlanner.java"));
        assertThat(plan + planner)
                .doesNotContain("deviceId")
                .doesNotContain("clientInstanceId");
    }

    @Test
    void keepsV1Alpha2ControllerThinAndGetPostOnly() throws IOException {
        String controller = Files.readString(MODEL_GATEWAY.resolve(
                "adapter/http/ModelInvocationV1Alpha2Controller.java"));
        assertThat(controller)
                .contains("@PostMapping")
                .contains("@GetMapping")
                .doesNotContain("@PutMapping")
                .doesNotContain("@PatchMapping")
                .doesNotContain("@DeleteMapping")
                .doesNotContain("Repository")
                .doesNotContain("@Transactional");
    }

    private static String readTree(Path root) throws IOException {
        try (Stream<Path> paths = Files.walk(root)) {
            return paths.filter(Files::isRegularFile)
                    .filter(path -> path.toString().endsWith(".java"))
                    .map(path -> {
                        try {
                            return Files.readString(path);
                        } catch (IOException exception) {
                            throw new IllegalStateException(exception);
                        }
                    })
                    .reduce("", (left, right) -> left + "\n" + right);
        }
    }
}
