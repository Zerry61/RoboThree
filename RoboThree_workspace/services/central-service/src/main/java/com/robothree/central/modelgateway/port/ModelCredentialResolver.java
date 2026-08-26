package com.robothree.central.modelgateway.port;

import com.robothree.central.modelgateway.domain.ModelInvocationExecution.CredentialResolution;

public interface ModelCredentialResolver {

    CredentialResolution resolve(
            String credentialReference,
            String expectedCredentialRevision);
}
