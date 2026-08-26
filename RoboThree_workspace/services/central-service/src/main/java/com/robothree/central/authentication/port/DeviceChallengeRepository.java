package com.robothree.central.authentication.port;

import com.robothree.central.authentication.domain.DeviceChallenge;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface DeviceChallengeRepository {

    DeviceChallenge insert(DeviceChallenge challenge);

    Optional<DeviceChallenge> findChallengeById(UUID challengeId);

    Optional<DeviceChallenge> findChallengeForUpdate(UUID challengeId);

    /**
     * Atomically consumes a pending challenge. If another writer won, the current
     * persisted value is returned so the application can distinguish an
     * idempotent retry from a replay conflict.
     */
    DeviceChallenge consume(
            UUID challengeId,
            Instant consumedAt,
            String consumedBy,
            String requestDigest);
}
