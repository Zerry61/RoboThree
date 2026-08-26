package com.robothree.central.support;

import com.robothree.central.credentials.port.EnterpriseSecretStore;

public final class FakeEnterpriseSecretStore implements EnterpriseSecretStore {

    @Override
    public TokenSigningKeyHandle resolveTokenSigningKeyHandle() {
        return new TokenSigningKeyHandle("test-signing-key-handle");
    }

    @Override
    public TokenVerificationKeyHandle resolveTokenVerificationKeyHandle() {
        return new TokenVerificationKeyHandle("test-verification-key-handle");
    }
}
