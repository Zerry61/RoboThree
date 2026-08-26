package com.robothree.central.authentication.port;

import com.robothree.central.authentication.domain.DeviceChallenge;
import com.robothree.central.authentication.domain.DeviceProof;
import com.robothree.central.authentication.domain.DevicePublicKey;

public interface DeviceProofVerifier {

    void verify(
            DeviceChallenge challenge,
            DeviceProof proof,
            DevicePublicKey publicKey);
}
