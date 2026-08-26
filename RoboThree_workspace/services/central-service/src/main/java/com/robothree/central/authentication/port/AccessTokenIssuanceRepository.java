package com.robothree.central.authentication.port;

import com.robothree.central.authentication.domain.AccessTokenIssuance;
import java.util.Optional;
import java.util.UUID;

public interface AccessTokenIssuanceRepository {

    AccessTokenIssuance insert(AccessTokenIssuance issuance);

    Optional<AccessTokenIssuance> findTokenIssuanceById(UUID tokenId);
}
