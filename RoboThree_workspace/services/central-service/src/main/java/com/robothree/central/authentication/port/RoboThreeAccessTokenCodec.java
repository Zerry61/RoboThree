package com.robothree.central.authentication.port;

import com.robothree.central.authentication.domain.AccessTokenClaims;
import com.robothree.central.credentials.port.EnterpriseSecretStore.TokenSigningKeyHandle;
import com.robothree.central.credentials.port.EnterpriseSecretStore.TokenVerificationKeyHandle;

public interface RoboThreeAccessTokenCodec {

    String encode(AccessTokenClaims claims, TokenSigningKeyHandle signingKeyHandle);

    AccessTokenClaims decodeAndVerify(
            String compactToken,
            TokenVerificationKeyHandle verificationKeyHandle);
}
