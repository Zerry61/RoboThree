package com.robothree.central.modelgateway.development;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.robothree.central.modelgateway.application.ModelGatewayException;
import com.robothree.central.modelgateway.development
        .DevelopmentModelCredentialMaterialSource.CredentialKey;
import java.util.Arrays;
import java.util.Map;
import org.junit.jupiter.api.Test;

class DevelopmentModelCredentialMaterialSourceTest {

    private static final String REVISION = "a".repeat(64);

    @Test
    void resolvesOnlyAnExactPreconfiguredReferenceFromTheControlledEnvironment() {
        String secret = "development-secret-never-log";
        DevelopmentModelCredentialMaterialSource source =
                new DevelopmentModelCredentialMaterialSource(
                        Map.of(
                                new CredentialKey(
                                        "credential.direct-provider",
                                        REVISION),
                                "ROBOTHREE_CGF2B2_DIRECT_PROVIDER_KEY"),
                        name -> "ROBOTHREE_CGF2B2_DIRECT_PROVIDER_KEY".equals(name)
                                ? secret
                                : null);

        char[] material = source.resolve(
                "credential.direct-provider",
                REVISION);

        assertThat(material).containsExactly(secret.toCharArray());
        assertThat(source.toString()).doesNotContain(secret);
        Arrays.fill(material, '\0');
        assertThat(material).containsOnly('\0');
    }

    @Test
    void acceptsTheControlledCustomRelayCredentialNamespace() {
        CredentialKey key = new CredentialKey(
                "credential.custom-relay",
                REVISION);
        DevelopmentModelCredentialMaterialSource source =
                new DevelopmentModelCredentialMaterialSource(
                        Map.of(
                                key,
                                "ROBOTHREE_CGF2B3_CUSTOM_RELAY_KEY"),
                        name -> "ROBOTHREE_CGF2B3_CUSTOM_RELAY_KEY".equals(name)
                                ? "relay-secret"
                                : null);

        char[] material = source.resolve(
                "credential.custom-relay",
                REVISION);

        assertThat(material).containsExactly("relay-secret".toCharArray());
        Arrays.fill(material, '\0');
        assertThat(material).containsOnly('\0');
    }

    @Test
    void failsClosedForUnknownRevisionMissingOrInvalidMaterial() {
        CredentialKey key = new CredentialKey(
                "credential.direct-provider",
                REVISION);
        assertUnavailable(new DevelopmentModelCredentialMaterialSource(
                Map.of(key, "ROBOTHREE_CGF2B2_DIRECT_PROVIDER_KEY"),
                ignored -> null));
        assertUnavailable(new DevelopmentModelCredentialMaterialSource(
                Map.of(key, "ROBOTHREE_CGF2B2_DIRECT_PROVIDER_KEY"),
                ignored -> "contains whitespace"));

        DevelopmentModelCredentialMaterialSource source =
                new DevelopmentModelCredentialMaterialSource(
                        Map.of(key, "ROBOTHREE_CGF2B2_DIRECT_PROVIDER_KEY"),
                        ignored -> "valid-secret");
        assertThatThrownBy(() -> source.resolve(
                        "credential.direct-provider",
                        "b".repeat(64)))
                .isInstanceOfSatisfying(
                        ModelGatewayException.class,
                        error -> assertThat(error.code())
                                .isEqualTo("model_gateway.credential_unavailable"));
    }

    @Test
    void rejectsUncontrolledEnvironmentVariableNames() {
        assertThatThrownBy(() -> new DevelopmentModelCredentialMaterialSource(
                        Map.of(
                                new CredentialKey(
                                        "credential.direct-provider",
                                        REVISION),
                                "USER_SELECTED_ENV"),
                        ignored -> "secret"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("environment name");

        assertThatThrownBy(() -> new DevelopmentModelCredentialMaterialSource(
                        Map.of(
                                new CredentialKey(
                                        "credential.custom-relay",
                                        REVISION),
                                "ROBOTHREE_CGF2B4_CUSTOM_RELAY_KEY"),
                        ignored -> "secret"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("environment name");
    }

    private static void assertUnavailable(
            DevelopmentModelCredentialMaterialSource source) {
        assertThatThrownBy(() -> source.resolve(
                        "credential.direct-provider",
                        REVISION))
                .isInstanceOfSatisfying(
                        ModelGatewayException.class,
                        error -> assertThat(error.code())
                                .isEqualTo("model_gateway.credential_unavailable"));
    }
}
