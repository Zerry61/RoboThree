package com.robothree.central.modelgateway.development;

import com.robothree.central.modelgateway.application.ModelGatewayException;
import com.robothree.central.modelgateway.domain.ModelInvocationExecution.CredentialResolution;
import com.robothree.central.modelgateway.port.ModelCredentialResolver;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public final class DevelopmentModelCredentialResolver
        implements ModelCredentialResolver {

    private final Map<String, String> revisions = new ConcurrentHashMap<>();

    public void register(String reference, String revision) {
        revisions.put(reference, revision);
    }

    public void remove(String reference) {
        revisions.remove(reference);
    }

    @Override
    public CredentialResolution resolve(
            String credentialReference,
            String expectedCredentialRevision) {
        String actual = revisions.get(credentialReference);
        if (!expectedCredentialRevision.equals(actual)) {
            throw ModelGatewayException.unavailable(
                    "model_gateway.credential_unavailable",
                    "The model credential is unavailable.");
        }
        return new CredentialResolution(
                credentialReference,
                actual);
    }
}
