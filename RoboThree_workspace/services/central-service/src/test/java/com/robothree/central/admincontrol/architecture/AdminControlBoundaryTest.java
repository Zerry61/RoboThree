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
    void aapi02DoesNotExposeHttpRuntimeOrBrowserAdapter() throws IOException {
        String source = readAllAdminControlSource();

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
        String source = readAllAdminControlSource();

        assertThat(source).doesNotContain(
                "apiKey",
                "credentialRef",
                "CredentialReference",
                "Bearer ",
                "providerEndpoint",
                "stackTrace",
                "policyExpression",
                "entitlementObject");
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
            return Files.readString(path);
        } catch (IOException exception) {
            throw new IllegalStateException("could not read source", exception);
        }
    }
}
