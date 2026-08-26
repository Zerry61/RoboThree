package com.robothree.central.modelgateway.development;

import com.robothree.central.modelgateway.application.ModelGatewayException;
import com.robothree.central.modelgateway.port.ModelCredentialMaterialSource;
import java.util.Arrays;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.regex.Pattern;

public final class DevelopmentModelCredentialMaterialSource
        implements ModelCredentialMaterialSource {

    private static final Pattern ENVIRONMENT_NAME =
            Pattern.compile("^ROBOTHREE_CGF2B[23]_[A-Z0-9_]{1,64}$");

    private final Map<CredentialKey, String> environmentNames;
    private final Function<String, String> environmentReader;

    public DevelopmentModelCredentialMaterialSource(
            Map<CredentialKey, String> environmentNames,
            Function<String, String> environmentReader) {
        Objects.requireNonNull(environmentNames, "environmentNames");
        this.environmentReader = Objects.requireNonNull(
                environmentReader,
                "environmentReader");
        environmentNames.forEach((key, name) -> {
            Objects.requireNonNull(key, "credential key");
            if (name == null || !ENVIRONMENT_NAME.matcher(name).matches()) {
                throw new IllegalArgumentException(
                        "development credential environment name is invalid");
            }
        });
        this.environmentNames = Map.copyOf(environmentNames);
    }

    public static DevelopmentModelCredentialMaterialSource fromProcessEnvironment(
            Map<CredentialKey, String> environmentNames) {
        return new DevelopmentModelCredentialMaterialSource(
                environmentNames,
                System::getenv);
    }

    @Override
    public char[] resolve(
            String credentialReference,
            String credentialRevision) {
        String environmentName = environmentNames.get(
                new CredentialKey(
                        credentialReference,
                        credentialRevision));
        if (environmentName == null) {
            throw unavailable();
        }
        String material = environmentReader.apply(environmentName);
        if (material == null || material.isEmpty() || material.length() > 16_384) {
            throw unavailable();
        }
        char[] copy = material.toCharArray();
        for (char character : copy) {
            if (character < 0x21 || character > 0x7e) {
                Arrays.fill(copy, '\0');
                throw unavailable();
            }
        }
        return copy;
    }

    public record CredentialKey(
            String credentialReference,
            String credentialRevision) {

        public CredentialKey {
            if (credentialReference == null || credentialReference.isBlank()) {
                throw new IllegalArgumentException(
                        "credentialReference is required");
            }
            if (credentialRevision == null
                    || !credentialRevision.matches("^[0-9a-f]{64}$")) {
                throw new IllegalArgumentException(
                        "credentialRevision is invalid");
            }
        }
    }

    private static ModelGatewayException unavailable() {
        return ModelGatewayException.unavailable(
                "model_gateway.credential_unavailable",
                "The model provider credential is unavailable.");
    }
}
