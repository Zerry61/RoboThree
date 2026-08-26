package com.robothree.central.support;

import com.robothree.central.authentication.port.OAIdentityAdapter;
import java.util.Map;

public final class FakeOAIdentityAdapter implements OAIdentityAdapter {

    private final Map<String, VerifiedIdentityClaims> claimsByFlow;

    public FakeOAIdentityAdapter(Map<String, VerifiedIdentityClaims> claimsByFlow) {
        this.claimsByFlow = Map.copyOf(claimsByFlow);
    }

    @Override
    public VerifiedIdentityClaims verify(OAIdentityMaterial material) {
        if (!(material instanceof FakeOAIdentityMaterial fake)) {
            throw new IllegalArgumentException("unsupported fake OA material");
        }
        VerifiedIdentityClaims claims = claimsByFlow.get(fake.flowId());
        if (claims == null) {
            throw new IllegalArgumentException("unknown fake OA flow");
        }
        return claims;
    }

    public record FakeOAIdentityMaterial(String flowId) implements OAIdentityMaterial {}
}
