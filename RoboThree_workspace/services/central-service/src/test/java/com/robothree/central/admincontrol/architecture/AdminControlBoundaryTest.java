package com.robothree.central.admincontrol.architecture;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class AdminControlBoundaryTest {

    private static final Path ADMIN_CONTROL =
            Path.of("src/main/java/com/robothree/central/admincontrol");

    @Test
    void aapi03KeepsHttpTypesOutOfDomainAndApplication() throws IOException {
        String source = read(ADMIN_CONTROL.resolve("domain"))
                + read(ADMIN_CONTROL.resolve("application"));

        assertThat(source).doesNotContain(
                "@RestController",
                "@Controller",
                "@RequestMapping",
                "@GetMapping",
                "@PostMapping",
                "HttpServletRequest",
                "ResponseEntity",
                "AdminAdapter");
    }

    @Test
    void aapi03RegistersOnlyTheTwelveFrozenGetRoutes() throws IOException {
        String controller = Files.readString(ADMIN_CONTROL.resolve(
                "adapter/http/AdminReadHttpController.java"));

        assertThat(controller.split("@GetMapping", -1)).hasSize(13);
        assertThat(controller).doesNotContain(
                "@PostMapping", "@PutMapping", "@PatchMapping", "@DeleteMapping");
        assertThat(controller).contains(
                "@GetMapping(\"/capabilities/current\")",
                "@GetMapping(\"/models\")",
                "@GetMapping(\"/models/{modelId}\")",
                "@GetMapping(\"/robots\")",
                "@GetMapping(\"/robots/{robotId}\")",
                "@GetMapping(\"/skills\")",
                "@GetMapping(\"/skills/{skillId}\")",
                "@GetMapping(\"/tools\")",
                "@GetMapping(\"/tools/{toolId}\")",
                "@GetMapping(\"/knowledge\")",
                "@GetMapping(\"/knowledge/{knowledgeId}\")",
                "@GetMapping(\"/system/audit-events\")");
    }

    @Test
    void developmentPrincipalDoesNotInferIdentityFromRuntimeOrBrowserInputs()
            throws IOException {
        String provider = Files.readString(ADMIN_CONTROL.resolve(
                "application/DevelopmentAdminPrincipalProvider.java"));

        assertThat(provider).doesNotContain(
                "System.getProperty",
                "System.getenv",
                "getRemoteUser",
                "getHeader",
                "LocalStorage",
                "SessionStorage",
                "Cookie",
                "route",
                "menu");
    }

    @Test
    void adminControlSourceDoesNotEncodeSensitiveProjectionFields()
            throws IOException {
        String source = read(ADMIN_CONTROL.resolve("adapter/http/AdminReadHttpController.java"))
                + read(ADMIN_CONTROL.resolve("adapter/http/AdminModelHttpController.java"))
                + read(ADMIN_CONTROL.resolve("application/AdminCapabilityProjectionService.java"))
                + read(ADMIN_CONTROL.resolve("domain/AdminCapabilityProjection.java"));

        assertThat(source).doesNotContain(
                "apiKey",
                "credentialRef",
                "CredentialReference",
                "Bearer ",
                "providerEndpoint",
                "stackTrace",
                "policyExpression",
                "entitlementObject");

        String validator = Files.readString(ADMIN_CONTROL.resolve(
                "application/AdminProjectionContractValidator.java"));
        assertThat(validator).contains("Bearer ", "credentialreference", "stacktrace");
    }

    private static String readAllAdminControlSource() throws IOException {
        try (var paths = Files.walk(ADMIN_CONTROL)) {
            return paths.filter(path -> path.toString().endsWith(".java"))
                    .sorted()
                    .map(AdminControlBoundaryTest::read)
                    .reduce("", (left, right) -> left + "\n" + right);
        }
    }

    private static String read(Path path) {
        try {
            if (Files.isDirectory(path)) {
                try (var paths = Files.walk(path)) {
                    return paths.filter(candidate -> candidate.toString().endsWith(".java"))
                            .sorted()
                            .map(AdminControlBoundaryTest::read)
                            .reduce("", (left, right) -> left + "\n" + right);
                }
            }
            return Files.readString(path);
        } catch (IOException exception) {
            throw new IllegalStateException("could not read source", exception);
        }
    }
}
