package com.robothree.central.architecture;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

class CentralJavaAlignmentArchitectureTest {

    private static final Path MAIN_JAVA = Path.of("src/main/java");
    private static final Pattern DECLARED_REQUEST_METHOD = Pattern.compile(
            "RequestMethod\\.([A-Z]+)");
    private static final Pattern DIRECT_COMMAND_CONSTRUCTION = Pattern.compile(
            "new\\s+[A-Za-z0-9_$.]+Command\\s*\\(");

    @Test
    void businessHttpSourceDeclaresOnlyGetAndPost() throws IOException {
        List<String> violations = new ArrayList<>();
        for (SourceFile source : sources()) {
            var methods = DECLARED_REQUEST_METHOD.matcher(source.content());
            while (methods.find()) {
                if (!methods.group(1).equals("GET") && !methods.group(1).equals("POST")) {
                    violations.add(source.relativePath() + ":RequestMethod." + methods.group(1));
                }
            }
            if (source.content().contains("@PutMapping")
                    || source.content().contains("@PatchMapping")
                    || source.content().contains("@DeleteMapping")) {
                violations.add(source.relativePath());
            }
        }

        assertThat(violations)
                .as("Central business HTTP source must declare only GET and POST")
                .isEmpty();
    }

    @Test
    void controllersDoNotOwnPersistenceSecurityOrApplicationMappingLogic()
            throws IOException {
        List<String> violations = new ArrayList<>();
        for (SourceFile source : sources()) {
            if (!source.relativePath().endsWith("Controller.java")) {
                continue;
            }
            String content = source.content();
            if (content.contains("com.robothree.central.persistence")
                    || content.contains("JdbcTemplate")
                    || content.contains("org.mybatis")
                    || content.contains("org.flywaydb")
                    || content.contains("@Transactional")
                    || content.contains("BEARER_PREFIX")
                    || content.contains("HttpHeaders.AUTHORIZATION")
                    || DIRECT_COMMAND_CONSTRUCTION.matcher(content).find()) {
                violations.add(source.relativePath());
            }
        }

        assertThat(violations)
                .as("Controllers must remain thin HTTP adapters")
                .isEmpty();
    }

    @Test
    void lombokUsageStaysInsideTheAcceptedBoundary() throws IOException {
        List<String> violations = new ArrayList<>();
        for (SourceFile source : sources()) {
            String content = source.content();
            if (content.contains("@SneakyThrows")) {
                violations.add(source.relativePath() + ":@SneakyThrows");
            }
            boolean sensitivePackage = source.relativePath().contains("/domain/")
                    || source.relativePath().contains("/credentials/")
                    || source.relativePath().contains("/adapter/security/");
            if (sensitivePackage
                    && (content.contains("@Data")
                            || content.contains("@Setter")
                            || content.contains("@ToString"))) {
                violations.add(source.relativePath() + ":sensitive-lombok");
            }
        }

        assertThat(violations)
                .as("Lombok must not generate mutable or printable sensitive objects")
                .isEmpty();
    }

    @Test
    void lombokConfigurationFailsClosedForDangerousShortcuts() throws IOException {
        String config = Files.readString(Path.of("lombok.config"));
        String pom = Files.readString(Path.of("pom.xml"));

        assertThat(config)
                .contains("config.stopBubbling = true")
                .contains("lombok.addLombokGeneratedAnnotation = true")
                .contains("lombok.sneakyThrows.flagUsage = error")
                .contains("lombok.data.flagUsage = warning");
        assertThat(pom)
                .contains("<artifactId>lombok</artifactId>")
                .contains("<optional>true</optional>")
                .contains("<excludes>");
    }

    @Test
    void tracingUsesW3cWithAnExplicitlyDisabledDefaultExporter() throws IOException {
        String application = Files.readString(Path.of("src/main/resources/application.yaml"));
        String pom = Files.readString(Path.of("pom.xml"));

        assertThat(application)
                .contains("type: W3C")
                .contains("enabled: ${ROBOTHREE_OTLP_TRACING_ENABLED:false}")
                .contains("include: health");
        assertThat(pom)
                .contains("<artifactId>spring-boot-starter-actuator</artifactId>")
                .contains("<artifactId>micrometer-tracing-bridge-otel</artifactId>")
                .contains("<artifactId>opentelemetry-exporter-otlp</artifactId>");
    }

    @Test
    void customObservationsCannotAttachSensitiveOrUnboundedValues() throws IOException {
        List<String> violations = new ArrayList<>();
        for (SourceFile source : sources()) {
            if (!source.relativePath().contains("/observability/")) {
                continue;
            }
            String content = source.content();
            if (content.contains(".highCardinalityKeyValue(")
                    || content.contains(".error(")
                    || content.contains("Authorization")
                    || content.contains("compactToken")
                    || content.contains("credentialRef")
                    || content.contains("prompt")
                    || content.contains("requestBody")
                    || content.contains("sqlArguments")) {
                violations.add(source.relativePath());
            }
        }

        assertThat(violations)
                .as("Central observations must use fixed safe low-cardinality metadata only")
                .isEmpty();
    }

    private static List<SourceFile> sources() throws IOException {
        try (Stream<Path> paths = Files.walk(MAIN_JAVA)) {
            return paths.filter(path -> path.toString().endsWith(".java"))
                    .map(CentralJavaAlignmentArchitectureTest::read)
                    .toList();
        }
    }

    private static SourceFile read(Path path) {
        try {
            return new SourceFile(
                    MAIN_JAVA.relativize(path).toString().replace('\\', '/'),
                    Files.readString(path));
        } catch (IOException exception) {
            throw new IllegalStateException("Could not inspect Central Java source", exception);
        }
    }

    private record SourceFile(String relativePath, String content) {}
}
