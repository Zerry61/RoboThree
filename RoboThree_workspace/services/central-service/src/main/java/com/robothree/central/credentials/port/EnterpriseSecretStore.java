package com.robothree.central.credentials.port;

import static com.robothree.central.shared.domain.DomainValueChecks.text;

public interface EnterpriseSecretStore {

    TokenSigningKeyHandle resolveTokenSigningKeyHandle();

    TokenVerificationKeyHandle resolveTokenVerificationKeyHandle();

    record TokenSigningKeyHandle(String reference) {

        public TokenSigningKeyHandle {
            text(reference, "reference");
        }
    }

    record TokenVerificationKeyHandle(String reference) {

        public TokenVerificationKeyHandle {
            text(reference, "reference");
        }
    }
}
