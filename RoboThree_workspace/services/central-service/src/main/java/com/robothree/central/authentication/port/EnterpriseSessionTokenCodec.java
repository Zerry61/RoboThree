package com.robothree.central.authentication.port;

import com.robothree.central.authentication.domain.EnterpriseSessionTokenClaims;

public interface EnterpriseSessionTokenCodec {

    String encode(
            EnterpriseSessionTokenClaims claims,
            SessionSigningKeyHandle signingKeyHandle);

    EnterpriseSessionTokenClaims decodeAndVerify(
            String compactToken,
            String expectedIssuer,
            String expectedAudience,
            SessionVerificationKeyHandle verificationKeyHandle);

    record SessionSigningKeyHandle(String reference) {
        public SessionSigningKeyHandle {
            EnterpriseSessionPortChecks.boundedOpaqueRevision(reference, "reference");
        }

        @Override
        public String toString() {
            return "SessionSigningKeyHandle[REDACTED]";
        }
    }

    record SessionVerificationKeyHandle(String reference) {
        public SessionVerificationKeyHandle {
            EnterpriseSessionPortChecks.boundedOpaqueRevision(reference, "reference");
        }

        @Override
        public String toString() {
            return "SessionVerificationKeyHandle[REDACTED]";
        }
    }
}
