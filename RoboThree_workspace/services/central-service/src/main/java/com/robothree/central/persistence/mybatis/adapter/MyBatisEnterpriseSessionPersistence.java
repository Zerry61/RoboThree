package com.robothree.central.persistence.mybatis.adapter;

import com.robothree.central.authentication.domain.DeviceChallenge;
import com.robothree.central.authentication.domain.EnterpriseDevice;
import com.robothree.central.authentication.domain.EnterpriseSessionChallengeBinding;
import com.robothree.central.authentication.domain.EnterpriseSessionLeaseIssuance;
import com.robothree.central.authentication.domain.EnterpriseSessionPersistenceValidator;
import com.robothree.central.authentication.domain.VerifiedEnterpriseIdentity;
import com.robothree.central.authentication.port.EnterpriseSessionPersistence;
import com.robothree.central.persistence.PersistenceConflictException;
import com.robothree.central.persistence.PersistenceIntegrityException;
import com.robothree.central.persistence.mybatis.mapper.AuthenticationPersistenceMapper;
import com.robothree.central.persistence.mybatis.mapper.EnterpriseSessionPersistenceMapper;
import com.robothree.central.persistence.port.CentralTransactionRunner;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;

public final class MyBatisEnterpriseSessionPersistence
        implements EnterpriseSessionPersistence {

    private final AuthenticationPersistenceMapper authentication;
    private final EnterpriseSessionPersistenceMapper sessions;
    private final CentralTransactionRunner transactions;

    public MyBatisEnterpriseSessionPersistence(
            AuthenticationPersistenceMapper authentication,
            EnterpriseSessionPersistenceMapper sessions,
            CentralTransactionRunner transactions) {
        this.authentication = java.util.Objects.requireNonNull(authentication, "authentication");
        this.sessions = java.util.Objects.requireNonNull(sessions, "sessions");
        this.transactions = java.util.Objects.requireNonNull(transactions, "transactions");
    }

    @Override
    public EnterpriseSessionChallengeBundle commitChallengeOutcome(
            DeviceChallenge challenge,
            EnterpriseSessionChallengeBinding binding) {
        return transactions.required(() -> {
            EnterpriseSessionChallengeBundle requested =
                    new EnterpriseSessionChallengeBundle(challenge, binding);
            EnterpriseSessionPersistenceValidator.validateChallengeBundle(requested);
            Optional<EnterpriseSessionChallengeBundle> existing =
                    loadChallengeById(challenge.challengeId());
            if (existing.isPresent()) {
                return requireSameChallenge(existing.get(), requested);
            }
            write(
                    () -> authentication.insertChallenge(
                            AuthenticationEntityConverter.toEntity(challenge)),
                    "persistence.enterprise_session_challenge_conflict",
                    "persistence.enterprise_session_partial_commit");
            write(
                    () -> sessions.insertChallengeBinding(
                            EnterpriseSessionEntityConverter.toEntity(binding)),
                    "persistence.enterprise_session_binding_conflict",
                    "persistence.enterprise_session_partial_commit");
            return loadChallengeById(challenge.challengeId())
                    .map(stored -> requireSameChallenge(stored, requested))
                    .orElseThrow(() -> integrity(
                            "persistence.enterprise_session_partial_commit",
                            "enterprise session challenge outcome was not committed"));
        });
    }

    @Override
    public Optional<EnterpriseSessionChallengeBundle> loadChallengeById(UUID challengeId) {
        DeviceChallenge challenge = Optional.ofNullable(authentication.findChallengeById(challengeId))
                .map(AuthenticationEntityConverter::toDomain)
                .orElse(null);
        EnterpriseSessionChallengeBinding binding = Optional.ofNullable(
                        sessions.findChallengeBindingById(challengeId))
                .map(EnterpriseSessionEntityConverter::toDomain)
                .orElse(null);
        return bundle(challenge, binding);
    }

    @Override
    public Optional<EnterpriseSessionChallengeBundle> loadChallengeByCorrelationId(
            UUID correlationId) {
        EnterpriseSessionChallengeBinding binding = Optional.ofNullable(
                        sessions.findChallengeBindingByCorrelationId(correlationId))
                .map(EnterpriseSessionEntityConverter::toDomain)
                .orElse(null);
        if (binding == null) {
            return Optional.empty();
        }
        DeviceChallenge challenge = Optional.ofNullable(
                        authentication.findChallengeById(binding.challengeId()))
                .map(AuthenticationEntityConverter::toDomain)
                .orElse(null);
        return bundle(challenge, binding);
    }

    @Override
    public Optional<EnterpriseSessionChallengeBundle> loadChallengeForUpdate(UUID challengeId) {
        DeviceChallenge challenge = Optional.ofNullable(
                        authentication.findChallengeByIdForUpdate(challengeId))
                .map(AuthenticationEntityConverter::toDomain)
                .orElse(null);
        EnterpriseSessionChallengeBinding binding = Optional.ofNullable(
                        sessions.findChallengeBindingByIdForUpdate(challengeId))
                .map(EnterpriseSessionEntityConverter::toDomain)
                .orElse(null);
        return bundle(challenge, binding);
    }

    @Override
    public EnterpriseSessionLeaseIssuance commitLeaseOutcome(
            EnterpriseSessionLeaseCommit commit) {
        return transactions.required(() -> {
            EnterpriseSessionChallengeBundle bundle = loadChallengeForUpdate(
                            commit.issuance().challengeId())
                    .orElseThrow(() -> integrity(
                            "persistence.enterprise_session_challenge_missing",
                            "enterprise session challenge is missing"));
            EnterpriseSessionLeaseIssuance existingByChallenge = Optional.ofNullable(
                            sessions.findLeaseByChallengeIdForUpdate(bundle.challenge().challengeId()))
                    .map(EnterpriseSessionEntityConverter::toDomain)
                    .orElse(null);
            validateExpected(commit, bundle);
            VerifiedEnterpriseIdentity identity = Optional.ofNullable(
                            authentication.findVerifiedIdentityById(
                                    commit.issuance().verifiedIdentityId()))
                    .map(AuthenticationEntityConverter::toDomain)
                    .orElseThrow(() -> integrity(
                            "persistence.enterprise_session_lease_corrupt",
                            "enterprise session identity is missing"));
            EnterpriseDevice device = Optional.ofNullable(
                            authentication.findDeviceById(commit.issuance().deviceId()))
                    .map(AuthenticationEntityConverter::toDomain)
                    .orElseThrow(() -> integrity(
                            "persistence.enterprise_session_lease_corrupt",
                            "enterprise session device is missing"));
            EnterpriseSessionPersistenceValidator.validateLease(
                    commit.issuance(), bundle, identity, device);
            if (existingByChallenge != null) {
                return requireSameLease(existingByChallenge, commit.issuance());
            }
            DeviceChallenge challenge = bundle.challenge();
            if (challenge.consumedAt() == null) {
                int consumed = write(
                        () -> authentication.consumeChallenge(
                                challenge.challengeId(),
                                commit.consumedAt().atOffset(ZoneOffset.UTC),
                                commit.consumedBy(),
                                commit.requestDigest()),
                        "persistence.enterprise_session_challenge_conflict",
                        "persistence.enterprise_session_partial_commit");
                if (consumed != 1) {
                    throw conflict(
                            "persistence.enterprise_session_challenge_conflict",
                            "enterprise session challenge was not consumed");
                }
            } else if (!challenge.consumedAt().equals(commit.consumedAt())
                    || !commit.consumedBy().equals(challenge.consumedBy())
                    || !commit.requestDigest().equals(challenge.consumedRequestDigest())) {
                throw conflict(
                        "persistence.enterprise_session_challenge_conflict",
                        "enterprise session challenge was consumed differently");
            }
            write(
                    () -> sessions.insertLeaseIssuance(
                            EnterpriseSessionEntityConverter.toEntity(commit.issuance())),
                    "persistence.enterprise_session_lease_conflict",
                    "persistence.enterprise_session_partial_commit");
            return loadLeaseByTokenId(commit.issuance().tokenId())
                    .map(stored -> requireSameLease(stored, commit.issuance()))
                    .orElseThrow(() -> integrity(
                            "persistence.enterprise_session_partial_commit",
                            "enterprise session lease outcome was not committed"));
        });
    }

    @Override
    public Optional<EnterpriseSessionLeaseIssuance> loadLeaseByTokenId(UUID tokenId) {
        EnterpriseSessionLeaseIssuance issuance = Optional.ofNullable(
                        sessions.findLeaseByTokenId(tokenId))
                .map(EnterpriseSessionEntityConverter::toDomain)
                .orElse(null);
        if (issuance == null) {
            return Optional.empty();
        }
        EnterpriseSessionChallengeBundle bundle = loadChallengeById(issuance.challengeId())
                .orElseThrow(() -> integrity(
                        "persistence.enterprise_session_lease_corrupt",
                        "enterprise session lease references a missing challenge"));
        VerifiedEnterpriseIdentity identity = Optional.ofNullable(
                        authentication.findVerifiedIdentityById(issuance.verifiedIdentityId()))
                .map(AuthenticationEntityConverter::toDomain)
                .orElseThrow(() -> integrity(
                        "persistence.enterprise_session_lease_corrupt",
                        "enterprise session identity is missing"));
        EnterpriseDevice device = Optional.ofNullable(authentication.findDeviceById(issuance.deviceId()))
                .map(AuthenticationEntityConverter::toDomain)
                .orElseThrow(() -> integrity(
                        "persistence.enterprise_session_lease_corrupt",
                        "enterprise session device is missing"));
        return Optional.of(EnterpriseSessionPersistenceValidator.validateLease(
                issuance, bundle, identity, device));
    }

    private static Optional<EnterpriseSessionChallengeBundle> bundle(
            DeviceChallenge challenge,
            EnterpriseSessionChallengeBinding binding) {
        if (challenge == null && binding == null) {
            return Optional.empty();
        }
        if (challenge == null || binding == null) {
            throw integrity(
                    "persistence.enterprise_session_partial_commit",
                    "enterprise session challenge bundle is incomplete");
        }
        return Optional.of(EnterpriseSessionPersistenceValidator.validateChallengeBundle(
                new EnterpriseSessionChallengeBundle(challenge, binding)));
    }

    private static void validateExpected(
            EnterpriseSessionLeaseCommit commit,
            EnterpriseSessionChallengeBundle bundle) {
        if (!bundle.binding().recordDigest().equals(commit.expectedChallengeRecordDigest())
                || !bundle.binding().challengeBindingDigest()
                        .equals(commit.expectedBindingDigest())
                || !commit.requestDigest().equals(commit.issuance().requestDigest())) {
            throw conflict(
                    "persistence.enterprise_session_binding_conflict",
                    "enterprise session expected binding differs");
        }
    }

    private static EnterpriseSessionChallengeBundle requireSameChallenge(
            EnterpriseSessionChallengeBundle existing,
            EnterpriseSessionChallengeBundle requested) {
        if (existing.equals(requested)) {
            return existing;
        }
        throw conflict(
                "persistence.enterprise_session_challenge_conflict",
                "enterprise session challenge already differs");
    }

    private static EnterpriseSessionLeaseIssuance requireSameLease(
            EnterpriseSessionLeaseIssuance existing,
            EnterpriseSessionLeaseIssuance requested) {
        if (existing.equals(requested)) {
            return existing;
        }
        throw conflict(
                "persistence.enterprise_session_lease_conflict",
                "enterprise session lease already differs");
    }

    private static int write(
            java.util.function.IntSupplier work,
            String conflictCode,
            String integrityCode) {
        return MyBatisPersistenceErrors.write(work, conflictCode, integrityCode);
    }

    private static PersistenceConflictException conflict(String code, String message) {
        return new PersistenceConflictException(code, message);
    }

    private static PersistenceIntegrityException integrity(String code, String message) {
        return new PersistenceIntegrityException(code, message);
    }
}
