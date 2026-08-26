package com.robothree.central.authentication.port;

import com.robothree.central.authentication.domain.DeviceEnrollmentGrant;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface DeviceEnrollmentGrantRepository {

    DeviceEnrollmentGrant insert(DeviceEnrollmentGrant grant);

    Optional<DeviceEnrollmentGrant> findEnrollmentGrantById(UUID enrollmentGrantId);

    Optional<DeviceEnrollmentGrant> findEnrollmentGrantByCodeDigest(String codeDigest);

    Optional<DeviceEnrollmentGrant> findEnrollmentGrantByCodeDigestForUpdate(String codeDigest);

    DeviceEnrollmentGrant consume(UUID enrollmentGrantId, Instant consumedAt);
}
