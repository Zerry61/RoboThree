package com.robothree.central.modelgateway.port;

public interface ModelCredentialMaterialSource {

    char[] resolve(String credentialReference, String credentialRevision);
}
