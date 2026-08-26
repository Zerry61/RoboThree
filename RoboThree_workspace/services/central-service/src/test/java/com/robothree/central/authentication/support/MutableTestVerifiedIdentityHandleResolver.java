package com.robothree.central.authentication.support;

import com.robothree.central.authentication.domain.OpaqueVerifiedIdentityHandle;
import com.robothree.central.authentication.port.VerifiedIdentityHandleResolver;
import java.util.HashMap;
import java.util.Map;

public final class MutableTestVerifiedIdentityHandleResolver
        implements VerifiedIdentityHandleResolver {

    private final Map<String, ResolvedVerifiedIdentityHandle> bindings = new HashMap<>();

    public void bind(
            OpaqueVerifiedIdentityHandle handle,
            ResolvedVerifiedIdentityHandle resolved) {
        bindings.put(handle.value(), resolved);
    }

    @Override
    public ResolvedVerifiedIdentityHandle resolveForChallenge(
            OpaqueVerifiedIdentityHandle opaqueHandle) {
        return require(opaqueHandle);
    }

    @Override
    public ResolvedVerifiedIdentityHandle resolveForLeaseForUpdate(
            OpaqueVerifiedIdentityHandle opaqueHandle,
            String expectedIdentitySourceRevision) {
        ResolvedVerifiedIdentityHandle resolved = require(opaqueHandle);
        if (!resolved.identitySourceRevision().equals(expectedIdentitySourceRevision)) {
            throw new IllegalStateException("enterprise_identity_handle_drift");
        }
        return resolved;
    }

    private ResolvedVerifiedIdentityHandle require(OpaqueVerifiedIdentityHandle handle) {
        ResolvedVerifiedIdentityHandle resolved = bindings.get(handle.value());
        if (resolved == null) {
            throw new IllegalArgumentException("enterprise_identity_handle_invalid");
        }
        return resolved;
    }
}
