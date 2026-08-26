package com.robothree.central.authentication.support;

import com.robothree.central.authentication.port.EnterpriseSessionSigningKeyHandleProvider;
import com.robothree.central.authentication.port.EnterpriseSessionTokenCodec;

public final class FixedTestEnterpriseSessionSigningKeyHandleProvider
        implements EnterpriseSessionSigningKeyHandleProvider {

    private final EnterpriseSessionTokenCodec.SessionSigningKeyHandle handle =
            new EnterpriseSessionTokenCodec.SessionSigningKeyHandle(
                    "test-session-signing-key-handle-v1");

    @Override
    public EnterpriseSessionTokenCodec.SessionSigningKeyHandle requireCurrent() {
        return handle;
    }
}
