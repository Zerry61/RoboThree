package com.robothree.central.authentication.domain;

import static com.robothree.central.shared.domain.DomainValueChecks.text;

import com.robothree.central.shared.domain.DomainValueChecks;
import java.time.Instant;
import java.util.Objects;

public record EnterpriseUserPermission(
        String enterpriseId,
        String userId,
        String permission,
        boolean enabled,
        long revision,
        Instant updatedAt) {

    public EnterpriseUserPermission {
        text(enterpriseId, "enterpriseId");
        text(userId, "userId");
        text(permission, "permission");
        DomainValueChecks.revision(revision, "revision");
        Objects.requireNonNull(updatedAt, "updatedAt");
    }
}
