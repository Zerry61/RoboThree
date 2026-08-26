package com.robothree.central.authentication.domain;

import static com.robothree.central.authentication.domain.EnterpriseSessionChallengeBinding.boundedText;

import java.util.Objects;

public sealed interface EnterpriseBearerAuthorizationResult
        permits EnterpriseBearerAuthorizationResult.Success,
                EnterpriseBearerAuthorizationResult.Invalid,
                EnterpriseBearerAuthorizationResult.Expired,
                EnterpriseBearerAuthorizationResult.Unavailable {

    record Success(EnterpriseBearerPrincipal principal)
            implements EnterpriseBearerAuthorizationResult {
        public Success {
            Objects.requireNonNull(principal, "principal");
        }
    }

    record Invalid() implements EnterpriseBearerAuthorizationResult {}

    record Expired(String verifiedClaimsProfile)
            implements EnterpriseBearerAuthorizationResult {
        public Expired {
            if (!EnterpriseBearerPrincipal.LEGACY_CLAIMS_PROFILE.equals(verifiedClaimsProfile)
                    && !EnterpriseSessionChallengeBinding.CLAIMS_PROFILE.equals(
                            verifiedClaimsProfile)) {
                throw new IllegalArgumentException("verifiedClaimsProfile is unsupported");
            }
        }
    }

    record Unavailable(String typedSafeCode)
            implements EnterpriseBearerAuthorizationResult {
        public Unavailable {
            boundedText(typedSafeCode, "typedSafeCode", 120);
            if (!typedSafeCode.matches("^[a-z][a-z0-9_.-]*$")) {
                throw new IllegalArgumentException("typedSafeCode is unsupported");
            }
        }
    }
}
