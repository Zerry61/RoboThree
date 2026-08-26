package com.robothree.central.authentication.port;

/** Supplies the current opaque verification-key handle for Enterprise Session tokens. */
public interface EnterpriseSessionVerificationKeyHandleProvider {

    EnterpriseSessionTokenCodec.SessionVerificationKeyHandle requireCurrent();
}
