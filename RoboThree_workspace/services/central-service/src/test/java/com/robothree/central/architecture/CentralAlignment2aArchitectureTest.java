package com.robothree.central.architecture;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.robothree.central.persistence.mybatis.schema.SchemaManifest;
import com.robothree.central.persistence.mybatis.schema.SchemaManifestLoader;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

class CentralAlignment2aArchitectureTest {

    private static final Path MAIN_JAVA = Path.of("src/main/java");
    private static final Path SQL_ROOT = Path.of("deploy/sql/postgresql");
    private static final ObjectMapper JSON = new ObjectMapper();

    @Test
    void mybatisPlusIsPinnedAndFlywayIsAbsent() throws IOException {
        String pom = Files.readString(Path.of("pom.xml"));
        String application = Files.readString(Path.of("src/main/resources/application.yaml"));

        assertThat(pom)
                .contains("<artifactId>mybatis-plus-spring-boot3-starter</artifactId>")
                .contains("<version>3.5.16</version>")
                .doesNotContain("<artifactId>flyway-core</artifactId>")
                .doesNotContain("<artifactId>flyway-database-postgresql</artifactId>");
        assertThat(application).doesNotContain("Flyway");
    }

    @Test
    void productionUsesOnlyMybatisPersistenceAndKeepsItsBoundary()
            throws IOException {
        List<String> violations = new ArrayList<>();
        for (Path source : javaSources()) {
            String relative = MAIN_JAVA.relativize(source).toString().replace('\\', '/');
            String content = Files.readString(source);
            if (content.contains("org.flywaydb")) {
                violations.add(relative + ":flyway");
            }
            if ((content.contains("com.baomidou") || content.contains("org.apache.ibatis"))
                    && !relative.startsWith(
                            "com/robothree/central/persistence/mybatis/")) {
                violations.add(relative + ":mybatis-boundary");
            }
            if (content.contains("JdbcTemplate")
                    || relative.contains("/persistence/jdbc/")) {
                violations.add(relative + ":legacy-jdbc");
            }
        }

        assertThat(violations).isEmpty();
        assertThat(Files.exists(MAIN_JAVA.resolve(
                        "com/robothree/central/persistence/jdbc/CentralSchemaManager.java")))
                .isFalse();
        assertThat(Files.exists(MAIN_JAVA.resolve(
                        "com/robothree/central/persistence/jdbc")))
                .isFalse();
        Path legacyMigrationDirectory = Path.of("src/main/resources/db/migration");
        if (Files.exists(legacyMigrationDirectory)) {
            try (Stream<Path> entries = Files.list(legacyMigrationDirectory)) {
                assertThat(entries).isEmpty();
            }
        }
    }

    @Test
    void mybatisLoggingAndDynamicSqlFailClosed() throws IOException {
        String application = Files.readString(Path.of("src/main/resources/application.yaml"));
        String schemaMapper = Files.readString(MAIN_JAVA.resolve(
                "com/robothree/central/persistence/mybatis/schema/SchemaInspectionMapper.java"));
        String authenticationMapper =
                Files.readString(Path.of("src/main/resources/mybatis/AuthenticationMapper.xml"));
        String configurationMapper =
                Files.readString(Path.of("src/main/resources/mybatis/ConfigurationMapper.xml"));
        String enterpriseSessionMapper =
                Files.readString(Path.of("src/main/resources/mybatis/EnterpriseSessionMapper.xml"));

        assertThat(application)
                .contains(
                        "type-handlers-package: "
                                + "com.robothree.central.persistence.mybatis.typehandler")
                .contains(
                        "log-impl: org.apache.ibatis.logging.nologging.NoLoggingImpl");
        assertThat(schemaMapper + authenticationMapper + configurationMapper + enterpriseSessionMapper)
                .doesNotContain("${")
                .doesNotContain("QueryWrapper")
                .doesNotContain("UpdateWrapper")
                .doesNotContain("<if")
                .doesNotContain("<choose")
                .doesNotContain("<foreach")
                .doesNotContain(".last(");
    }

    @Test
    void businessMappersKeepLocksConflictsAndSensitiveEntitiesExplicit()
            throws IOException {
        String authentication =
                Files.readString(Path.of("src/main/resources/mybatis/AuthenticationMapper.xml"));
        String configuration =
                Files.readString(Path.of("src/main/resources/mybatis/ConfigurationMapper.xml"));

        assertThat(authentication)
                .contains("FOR UPDATE")
                .contains("ON CONFLICT (enterprise_id, user_id, permission) DO UPDATE")
                .contains("EXCLUDED.revision > enterprise_user_permission.revision")
                .contains("consumed_at IS NULL")
                .contains("PostgresTextArrayTypeHandler");
        assertThat(Files.readString(MAIN_JAVA.resolve(
                        "com/robothree/central/persistence/mybatis/typehandler/"
                                + "PostgresUuidTypeHandler.java")))
                .contains("@MappedTypes(UUID.class)")
                .contains("@MappedJdbcTypes(JdbcType.OTHER)");
        assertThat(configuration)
                .contains("ON CONFLICT (snapshot_id, revision) DO NOTHING")
                .contains("ON CONFLICT (package_id, revision) DO NOTHING");

        List<String> violations = new ArrayList<>();
        Path entities =
                MAIN_JAVA.resolve("com/robothree/central/persistence/mybatis/entity");
        try (Stream<Path> paths = Files.walk(entities)) {
            for (Path path : paths.filter(file -> file.toString().endsWith(".java")).toList()) {
                String content = Files.readString(path);
                if (content.contains("@Data")
                        || content.contains("@Setter")
                        || content.contains("@ToString")
                        || content.contains(" toString(")) {
                    violations.add(path.getFileName().toString());
                }
            }
        }
        assertThat(violations).isEmpty();
    }

    @Test
    void legacyMigrationsRemainTripleDigestFrozen() throws IOException {
        JsonNode files = JSON.readTree(
                        Files.readString(Path.of(
                                "src/test/resources/schema/legacy-v1-v5-digests.json")))
                .required("files");

        for (JsonNode file : files) {
            String fileName = file.required("fileName").textValue();
            byte[] audit = Files.readAllBytes(SQL_ROOT.resolve("legacy-flyway").resolve(fileName));

            assertThat(digest("MD5", audit))
                    .as(fileName + " MD5")
                    .isEqualTo(file.required("md5").textValue());
            assertThat(digest("SHA-256", audit))
                    .as(fileName + " SHA-256")
                    .isEqualTo(file.required("sha256").textValue());
        }
    }

    @Test
    void manifestSidecarAndScriptsMatchCanonicalDigestAuthority() throws IOException {
        SchemaManifest manifest = new SchemaManifestLoader().load();
        Path manifestPath =
                SQL_ROOT.resolve("manifest/postgresql-v0010.json");
        String manifestDigest = digest("SHA-256", Files.readAllBytes(manifestPath));

        assertThat(Files.readString(Path.of(manifestPath + ".sha256")))
                .isEqualTo(manifestDigest + "  postgresql-v0010.json\n");
        for (SchemaManifest.Script script : manifest.scripts()) {
            Path directory = switch (script.entryPath()) {
                case "fresh" -> SQL_ROOT.resolve("baseline");
                case "v0009_upgrade" -> SQL_ROOT.resolve("upgrade");
                default -> throw new AssertionError("unknown entry path");
            };
            assertThat(digest("SHA-256", Files.readAllBytes(directory.resolve(
                                    script.scriptName()))))
                    .isEqualTo(script.scriptDigest());
        }
    }

    @Test
    void productionConfigurationWiresMybatisAndFailsClosedOnSchemaDrift()
            throws IOException {
        String configuration = Files.readString(MAIN_JAVA.resolve(
                "com/robothree/central/persistence/mybatis/configuration/"
                        + "CentralMyBatisPersistenceConfiguration.java"));

        assertThat(configuration)
                .contains("@ConditionalOnBean(DataSource.class)")
                .contains("@MapperScan")
                .contains("MyBatisAuthenticationPersistence")
                .contains("MyBatisConfigurationPersistence")
                .contains("SpringCentralTransactionRunner")
                .contains("CentralSchemaPreflight")
                .contains("SmartInitializingSingleton")
                .doesNotContain("JdbcTemplate")
                .doesNotContain("Flyway");
    }

    @Test
    void installerIsTestOnlyAndFrozenV0006WasNotRewritten() throws IOException {
        String installer = Files.readString(Path.of(
                "src/test/java/com/robothree/central/persistence/schema/SchemaTestInstaller.java"));
        String legacyInstaller = Files.readString(Path.of(
                "src/test/java/com/robothree/central/persistence/schema/"
                        + "LegacyV5TestInstaller.java"));
        String baseline = Files.readString(
                SQL_ROOT.resolve("baseline/B0006__central_foundation.sql"));
        String bridge =
                Files.readString(SQL_ROOT.resolve("upgrade/U0006__bridge_from_flyway_v5.sql"));

        assertThat(installer)
                .doesNotContain("@Component")
                .doesNotContain("@Service")
                .doesNotContain("@Bean");
        assertThat(legacyInstaller)
                .doesNotContain("org.flywaydb")
                .doesNotContain("@Component")
                .doesNotContain("@Service")
                .doesNotContain("@Bean");
        assertThat(baseline + bridge)
                .doesNotContain("model_invocation")
                .doesNotContain("provider_dispatch")
                .doesNotContain("durable_event");
    }

    private static List<Path> javaSources() throws IOException {
        try (Stream<Path> paths = Files.walk(MAIN_JAVA)) {
            return paths.filter(path -> path.toString().endsWith(".java")).toList();
        }
    }

    private static String digest(String algorithm, byte[] bytes) {
        try {
            return HexFormat.of()
                    .formatHex(MessageDigest.getInstance(algorithm).digest(bytes));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(algorithm + " is unavailable", exception);
        }
    }
}
