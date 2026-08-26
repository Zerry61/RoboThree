package com.robothree.central.authentication.port;

import com.robothree.central.authentication.domain.VerifiedEnterpriseIdentity;

public interface EnterpriseUserIdentityVerifier {

    VerifiedEnterpriseIdentity verify(OAIdentityAdapter.OAIdentityMaterial material);
}
