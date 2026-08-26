package com.robothree.central.authentication.port;

import com.robothree.central.authentication.domain.VerifiedEnterpriseIdentity;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface VerifiedIdentityRepository {

    VerifiedEnterpriseIdentity insert(VerifiedEnterpriseIdentity identity);

    Optional<VerifiedEnterpriseIdentity> findVerifiedIdentityById(UUID verifiedIdentityId);

    Optional<VerifiedEnterpriseIdentity> findVerifiedIdentityByIdForUpdate(
            UUID verifiedIdentityId);

    VerifiedEnterpriseIdentity disable(UUID verifiedIdentityId, Instant disabledAt);
}
