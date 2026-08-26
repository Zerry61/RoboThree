package com.robothree.central.authentication.port;

public interface EnterpriseSessionSigningKeyHandleProvider {

    EnterpriseSessionTokenCodec.SessionSigningKeyHandle requireCurrent();
}
