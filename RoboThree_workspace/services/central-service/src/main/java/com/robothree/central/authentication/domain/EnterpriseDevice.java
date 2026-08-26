package com.robothree.central.authentication.domain;

import static com.robothree.central.shared.domain.DomainValueChecks.digest;
import static com.robothree.central.shared.domain.DomainValueChecks.text;

import com.robothree.central.shared.domain.DomainValueChecks;
import java.time.Instant;
import java.util.Objects;

public record EnterpriseDevice(
        String deviceId,
        String enterpriseId,
        String deviceKeyId,
        String publicKeyFormat,
        String publicKeyEncoded,
        String publicKeyDigest,
        String algorithm,
        String trustSource,
        String managedStatus,
        String complianceStatus,
        long revision,
        Instant registeredAt,
        Instant revokedAt,
        Instant disabledAt) {

    public EnterpriseDevice {
        text(deviceId, "deviceId");
        text(enterpriseId, "enterpriseId");
        text(deviceKeyId, "deviceKeyId");
        text(publicKeyFormat, "publicKeyFormat");
        text(publicKeyEncoded, "publicKeyEncoded");
        digest(publicKeyDigest, "publicKeyDigest");
        text(algorithm, "algorithm");
        text(trustSource, "trustSource");
        text(managedStatus, "managedStatus");
        text(complianceStatus, "complianceStatus");
        DomainValueChecks.revision(revision, "revision");
        Objects.requireNonNull(registeredAt, "registeredAt");
    }
}
