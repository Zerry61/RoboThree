package com.robothree.central.persistence.mybatis.adapter;

import static com.robothree.central.persistence.mybatis.adapter.MyBatisPersistenceErrors.write;

import com.robothree.central.authentication.domain.AccessTokenIssuance;
import com.robothree.central.authentication.domain.DeviceChallenge;
import com.robothree.central.authentication.domain.DeviceEnrollmentGrant;
import com.robothree.central.authentication.domain.EnterpriseDevice;
import com.robothree.central.authentication.domain.EnterpriseUserPermission;
import com.robothree.central.authentication.domain.VerifiedEnterpriseIdentity;
import com.robothree.central.authentication.port.AccessTokenIssuanceRepository;
import com.robothree.central.authentication.port.DeviceChallengeRepository;
import com.robothree.central.authentication.port.DeviceEnrollmentGrantRepository;
import com.robothree.central.authentication.port.EnterpriseDeviceRepository;
import com.robothree.central.authentication.port.EnterprisePermissionRepository;
import com.robothree.central.authentication.port.VerifiedIdentityRepository;
import com.robothree.central.persistence.PersistenceConflictException;
import com.robothree.central.persistence.PersistenceIntegrityException;
import com.robothree.central.persistence.mybatis.mapper.AuthenticationPersistenceMapper;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

public final class MyBatisAuthenticationPersistence implements
        VerifiedIdentityRepository,
        EnterprisePermissionRepository,
        EnterpriseDeviceRepository,
        DeviceEnrollmentGrantRepository,
        DeviceChallengeRepository,
        AccessTokenIssuanceRepository {

    private final AuthenticationPersistenceMapper mapper;

    public MyBatisAuthenticationPersistence(AuthenticationPersistenceMapper mapper) {
        this.mapper = Objects.requireNonNull(mapper, "mapper");
    }

    @Override
    public VerifiedEnterpriseIdentity insert(VerifiedEnterpriseIdentity identity) {
        int inserted = write(
                () -> mapper.insertVerifiedIdentity(
                        AuthenticationEntityConverter.toEntity(identity)),
                "persistence.identity_conflict",
                "persistence.identity_write_failed");
        if (inserted == 1) {
            return identity;
        }
        return requireSame(
                findVerifiedIdentityById(identity.verifiedIdentityId()),
                identity,
                "persistence.identity_conflict");
    }

    @Override
    public Optional<VerifiedEnterpriseIdentity> findVerifiedIdentityById(UUID id) {
        return optional(mapper.findVerifiedIdentityById(id))
                .map(AuthenticationEntityConverter::toDomain);
    }

    @Override
    public Optional<VerifiedEnterpriseIdentity> findVerifiedIdentityByIdForUpdate(UUID id) {
        return optional(mapper.findVerifiedIdentityByIdForUpdate(id))
                .map(AuthenticationEntityConverter::toDomain);
    }

    @Override
    public VerifiedEnterpriseIdentity disable(UUID verifiedIdentityId, Instant disabledAt) {
        write(
                () -> mapper.disableVerifiedIdentity(
                        verifiedIdentityId,
                        disabledAt.atOffset(ZoneOffset.UTC)),
                "persistence.identity_conflict",
                "persistence.identity_write_failed");
        return findVerifiedIdentityById(verifiedIdentityId)
                .orElseThrow(() -> integrity(
                        "persistence.identity_missing",
                        "verified identity does not exist"));
    }

    @Override
    public EnterpriseUserPermission save(EnterpriseUserPermission permission) {
        int changed = write(
                () -> mapper.savePermission(
                        AuthenticationEntityConverter.toEntity(permission)),
                "persistence.permission_conflict",
                "persistence.permission_write_failed");
        if (changed == 1) {
            return permission;
        }
        EnterpriseUserPermission current = find(
                        permission.enterpriseId(),
                        permission.userId(),
                        permission.permission())
                .orElseThrow(() -> integrity(
                        "persistence.permission_missing",
                        "permission disappeared during save"));
        String code = permission.revision() < current.revision()
                ? "persistence.permission_stale"
                : "persistence.permission_conflict";
        throw conflict(code, "permission revision cannot replace current value");
    }

    @Override
    public Optional<EnterpriseUserPermission> find(
            String enterpriseId,
            String userId,
            String permission) {
        return optional(mapper.findPermission(enterpriseId, userId, permission))
                .map(AuthenticationEntityConverter::toDomain);
    }

    @Override
    public List<EnterpriseUserPermission> findEnabled(
            String enterpriseId,
            String userId) {
        return mapper.findEnabledPermissions(enterpriseId, userId).stream()
                .map(AuthenticationEntityConverter::toDomain)
                .toList();
    }

    @Override
    public List<EnterpriseUserPermission> findEnabledForUpdate(
            String enterpriseId,
            String userId) {
        return mapper.findEnabledPermissionsForUpdate(enterpriseId, userId).stream()
                .map(AuthenticationEntityConverter::toDomain)
                .toList();
    }

    @Override
    public List<EnterpriseUserPermission> findRequestedForUpdate(
            String enterpriseId,
            String userId,
            List<String> orderedPermissions) {
        return mapper.findRequestedPermissionsForUpdate(
                        enterpriseId,
                        userId,
                        validateRequestedPermissions(orderedPermissions))
                .stream()
                .map(AuthenticationEntityConverter::toDomain)
                .toList();
    }

    private static List<String> validateRequestedPermissions(List<String> values) {
        List<String> copy = List.copyOf(java.util.Objects.requireNonNull(values, "values"));
        if (copy.isEmpty()
                || copy.size() > 32
                || !copy.contains("configuration.read")
                || new java.util.HashSet<>(copy).size() != copy.size()
                || !copy.equals(copy.stream().sorted().toList())) {
            throw new IllegalArgumentException("requested permissions are not canonical");
        }
        return copy;
    }

    @Override
    public EnterpriseDevice insert(EnterpriseDevice device) {
        int inserted = write(
                () -> mapper.insertDevice(AuthenticationEntityConverter.toEntity(device)),
                "persistence.device_key_conflict",
                "persistence.device_write_failed");
        if (inserted == 1) {
            return device;
        }
        return requireSame(findById(device.deviceId()), device, "persistence.device_conflict");
    }

    @Override
    public Optional<EnterpriseDevice> findById(String deviceId) {
        return optional(mapper.findDeviceById(deviceId))
                .map(AuthenticationEntityConverter::toDomain);
    }

    @Override
    public Optional<EnterpriseDevice> findByIdForUpdate(String deviceId) {
        return optional(mapper.findDeviceByIdForUpdate(deviceId))
                .map(AuthenticationEntityConverter::toDomain);
    }

    @Override
    public Optional<EnterpriseDevice> findByKeyId(
            String enterpriseId,
            String deviceKeyId) {
        return optional(mapper.findDeviceByKeyId(enterpriseId, deviceKeyId))
                .map(AuthenticationEntityConverter::toDomain);
    }

    @Override
    public Optional<EnterpriseDevice> findByPublicKeyDigest(
            String enterpriseId,
            String publicKeyDigest) {
        return optional(mapper.findDeviceByPublicKeyDigest(enterpriseId, publicKeyDigest))
                .map(AuthenticationEntityConverter::toDomain);
    }

    @Override
    public DeviceEnrollmentGrant insert(DeviceEnrollmentGrant grant) {
        int inserted = write(
                () -> mapper.insertEnrollmentGrant(
                        AuthenticationEntityConverter.toEntity(grant)),
                "persistence.enrollment_grant_conflict",
                "persistence.enrollment_grant_write_failed");
        if (inserted == 1) {
            return grant;
        }
        return requireSame(
                findEnrollmentGrantById(grant.enrollmentGrantId()),
                grant,
                "persistence.enrollment_grant_conflict");
    }

    @Override
    public Optional<DeviceEnrollmentGrant> findEnrollmentGrantById(UUID id) {
        return optional(mapper.findEnrollmentGrantById(id))
                .map(AuthenticationEntityConverter::toDomain);
    }

    @Override
    public Optional<DeviceEnrollmentGrant> findEnrollmentGrantByCodeDigest(String codeDigest) {
        return optional(mapper.findEnrollmentGrantByCodeDigest(codeDigest))
                .map(AuthenticationEntityConverter::toDomain);
    }

    @Override
    public Optional<DeviceEnrollmentGrant> findEnrollmentGrantByCodeDigestForUpdate(
            String codeDigest) {
        return optional(mapper.findEnrollmentGrantByCodeDigestForUpdate(codeDigest))
                .map(AuthenticationEntityConverter::toDomain);
    }

    @Override
    public DeviceEnrollmentGrant consume(UUID enrollmentGrantId, Instant consumedAt) {
        int changed = write(
                () -> mapper.consumeEnrollmentGrant(
                        enrollmentGrantId,
                        consumedAt.atOffset(ZoneOffset.UTC)),
                "persistence.enrollment_grant_consumed",
                "persistence.enrollment_grant_write_failed");
        if (changed == 0) {
            if (findEnrollmentGrantById(enrollmentGrantId).isEmpty()) {
                throw integrity(
                        "persistence.enrollment_grant_missing",
                        "enrollment grant does not exist");
            }
            throw conflict(
                    "persistence.enrollment_grant_consumed",
                    "enrollment grant has already been consumed");
        }
        return findEnrollmentGrantById(enrollmentGrantId)
                .orElseThrow(() -> integrity(
                        "persistence.enrollment_grant_missing",
                        "enrollment grant does not exist"));
    }

    @Override
    public DeviceChallenge insert(DeviceChallenge challenge) {
        int inserted = write(
                () -> mapper.insertChallenge(
                        AuthenticationEntityConverter.toEntity(challenge)),
                "persistence.challenge_conflict",
                "persistence.challenge_write_failed");
        if (inserted == 1) {
            return challenge;
        }
        return requireSame(
                findChallengeById(challenge.challengeId()),
                challenge,
                "persistence.challenge_conflict");
    }

    @Override
    public Optional<DeviceChallenge> findChallengeById(UUID id) {
        return optional(mapper.findChallengeById(id))
                .map(AuthenticationEntityConverter::toDomain);
    }

    @Override
    public Optional<DeviceChallenge> findChallengeForUpdate(UUID id) {
        return optional(mapper.findChallengeByIdForUpdate(id))
                .map(AuthenticationEntityConverter::toDomain);
    }

    @Override
    public DeviceChallenge consume(
            UUID challengeId,
            Instant consumedAt,
            String consumedBy,
            String requestDigest) {
        write(
                () -> mapper.consumeChallenge(
                        challengeId,
                        consumedAt.atOffset(ZoneOffset.UTC),
                        consumedBy,
                        requestDigest),
                "persistence.challenge_conflict",
                "persistence.challenge_write_failed");
        return findChallengeById(challengeId)
                .orElseThrow(() -> integrity(
                        "persistence.challenge_missing",
                        "device challenge does not exist"));
    }

    @Override
    public AccessTokenIssuance insert(AccessTokenIssuance issuance) {
        int inserted = write(
                () -> mapper.insertTokenIssuance(
                        AuthenticationEntityConverter.toEntity(issuance)),
                "persistence.token_conflict",
                "persistence.token_write_failed");
        if (inserted == 1) {
            return issuance;
        }
        return requireSame(
                findTokenIssuanceById(issuance.tokenId()),
                issuance,
                "persistence.token_conflict");
    }

    @Override
    public Optional<AccessTokenIssuance> findTokenIssuanceById(UUID id) {
        return optional(mapper.findTokenIssuanceById(id))
                .map(AuthenticationEntityConverter::toDomain);
    }

    private static <T> Optional<T> optional(T value) {
        return Optional.ofNullable(value);
    }

    private static <T> T requireSame(
            Optional<T> existing,
            T requested,
            String conflictCode) {
        if (existing.isPresent() && existing.get().equals(requested)) {
            return existing.get();
        }
        throw conflict(conflictCode, "immutable persistence key already has different data");
    }

    private static PersistenceConflictException conflict(String code, String message) {
        return new PersistenceConflictException(code, message);
    }

    private static PersistenceIntegrityException integrity(String code, String message) {
        return new PersistenceIntegrityException(code, message);
    }
}
