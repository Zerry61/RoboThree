package com.robothree.central.authentication.adapter.security;

import com.robothree.central.authentication.application.AuthenticationCrypto;
import com.robothree.central.authentication.application.EnterpriseAuthenticationException;
import com.robothree.central.authentication.domain.DeviceChallenge;
import com.robothree.central.authentication.domain.DeviceProof;
import com.robothree.central.authentication.domain.DevicePublicKey;
import com.robothree.central.authentication.port.DeviceProofVerifier;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.Signature;
import java.security.interfaces.ECPublicKey;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;

public final class Es256DeviceProofVerifier implements DeviceProofVerifier {

    @Override
    public void verify(
            DeviceChallenge challenge,
            DeviceProof proof,
            DevicePublicKey publicKey) {
        if (!"ES256".equals(proof.algorithm())
                || !"ES256".equals(publicKey.algorithm())
                || !"spki_der_base64".equals(publicKey.format())) {
            throw invalidProof();
        }
        if (!proof.challengeId().equals(challenge.challengeId())
                || !proof.deviceKeyId().equals(publicKey.keyId())) {
            throw EnterpriseAuthenticationException.authentication(
                    "device_context_mismatch",
                    "Device proof does not match the issued challenge context.");
        }
        try {
            byte[] encodedKey = Base64.getDecoder().decode(publicKey.encodedKey());
            ECPublicKey key = (ECPublicKey) KeyFactory.getInstance("EC")
                    .generatePublic(new X509EncodedKeySpec(encodedKey));
            if (key.getParams().getOrder().bitLength() != 256) {
                throw invalidProof();
            }
            Signature verifier = Signature.getInstance("SHA256withECDSA");
            verifier.initVerify(key);
            verifier.update(AuthenticationCrypto.signingBytes(challenge));
            byte[] signature = Base64.getUrlDecoder().decode(proof.signature());
            if (!verifier.verify(signature)) {
                throw invalidProof();
            }
        } catch (IllegalArgumentException | GeneralSecurityException exception) {
            throw invalidProof();
        }
    }

    private static EnterpriseAuthenticationException invalidProof() {
        return EnterpriseAuthenticationException.authentication(
                "device_proof_invalid",
                "Device proof could not be verified.");
    }
}
