package com.robothree.central.persistence.mybatis.adapter;

import com.robothree.central.authentication.domain.AccessTokenIssuance;
import com.robothree.central.authentication.domain.DeviceChallenge;
import com.robothree.central.authentication.domain.DeviceEnrollmentGrant;
import com.robothree.central.authentication.domain.EnterpriseDevice;
import com.robothree.central.authentication.domain.EnterpriseUserPermission;
import com.robothree.central.authentication.domain.VerifiedEnterpriseIdentity;
import com.robothree.central.persistence.mybatis.entity.AccessTokenIssuanceEntity;
import com.robothree.central.persistence.mybatis.entity.DeviceChallengeEntity;
import com.robothree.central.persistence.mybatis.entity.DeviceEnrollmentGrantEntity;
import com.robothree.central.persistence.mybatis.entity.EnterpriseDeviceEntity;
import com.robothree.central.persistence.mybatis.entity.EnterprisePermissionEntity;
import com.robothree.central.persistence.mybatis.entity.VerifiedIdentityEntity;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;

final class AuthenticationEntityConverter {

    private AuthenticationEntityConverter() {}

    static VerifiedIdentityEntity toEntity(VerifiedEnterpriseIdentity value) {
        return new VerifiedIdentityEntity(
                value.verifiedIdentityId(),
                value.enterpriseId(),
                value.userId(),
                value.provider(),
                value.providerSubjectDigest(),
                value.identityDigest(),
                at(value.issuedAt()),
                at(value.expiresAt()),
                at(value.disabledAt()));
    }

    static VerifiedEnterpriseIdentity toDomain(VerifiedIdentityEntity value) {
        return new VerifiedEnterpriseIdentity(
                value.getVerifiedIdentityId(),
                value.getEnterpriseId(),
                value.getUserId(),
                value.getProvider(),
                value.getProviderSubjectDigest(),
                value.getIdentityDigest(),
                instant(value.getIssuedAt()),
                instant(value.getExpiresAt()),
                instant(value.getDisabledAt()));
    }

    static EnterprisePermissionEntity toEntity(EnterpriseUserPermission value) {
        return new EnterprisePermissionEntity(
                value.enterpriseId(),
                value.userId(),
                value.permission(),
                value.enabled(),
                value.revision(),
                at(value.updatedAt()));
    }

    static EnterpriseUserPermission toDomain(EnterprisePermissionEntity value) {
        return new EnterpriseUserPermission(
                value.getEnterpriseId(),
                value.getUserId(),
                value.getPermission(),
                value.isEnabled(),
                value.getRevision(),
                instant(value.getUpdatedAt()));
    }

    static EnterpriseDeviceEntity toEntity(EnterpriseDevice value) {
        return new EnterpriseDeviceEntity(
                value.deviceId(),
                value.enterpriseId(),
                value.deviceKeyId(),
                value.publicKeyFormat(),
                value.publicKeyEncoded(),
                value.publicKeyDigest(),
                value.algorithm(),
                value.trustSource(),
                value.managedStatus(),
                value.complianceStatus(),
                value.revision(),
                at(value.registeredAt()),
                at(value.revokedAt()),
                at(value.disabledAt()));
    }

    static EnterpriseDevice toDomain(EnterpriseDeviceEntity value) {
        return new EnterpriseDevice(
                value.getDeviceId(),
                value.getEnterpriseId(),
                value.getDeviceKeyId(),
                value.getPublicKeyFormat(),
                value.getPublicKeyEncoded(),
                value.getPublicKeyDigest(),
                value.getAlgorithm(),
                value.getTrustSource(),
                value.getManagedStatus(),
                value.getComplianceStatus(),
                value.getRevision(),
                instant(value.getRegisteredAt()),
                instant(value.getRevokedAt()),
                instant(value.getDisabledAt()));
    }

    static DeviceEnrollmentGrantEntity toEntity(DeviceEnrollmentGrant value) {
        return new DeviceEnrollmentGrantEntity(
                value.enrollmentGrantId(),
                value.codeDigest(),
                value.enterpriseId(),
                value.authorizedUserId(),
                at(value.issuedAt()),
                at(value.expiresAt()),
                at(value.consumedAt()),
                at(value.disabledAt()));
    }

    static DeviceEnrollmentGrant toDomain(DeviceEnrollmentGrantEntity value) {
        return new DeviceEnrollmentGrant(
                value.getEnrollmentGrantId(),
                value.getCodeDigest(),
                value.getEnterpriseId(),
                value.getAuthorizedUserId(),
                instant(value.getIssuedAt()),
                instant(value.getExpiresAt()),
                instant(value.getConsumedAt()),
                instant(value.getDisabledAt()));
    }

    static DeviceChallengeEntity toEntity(DeviceChallenge value) {
        return new DeviceChallengeEntity(
                value.challengeId(),
                value.purpose(),
                value.verifiedIdentityId(),
                value.clientInstanceId(),
                value.expectedDeviceKeyId(),
                value.expectedPublicKeyDigest(),
                value.nonce(),
                value.audience(),
                value.allowedAlgorithms(),
                value.challengeDigest(),
                at(value.issuedAt()),
                at(value.expiresAt()),
                at(value.consumedAt()),
                value.consumedBy(),
                value.consumedRequestDigest());
    }

    static DeviceChallenge toDomain(DeviceChallengeEntity value) {
        return new DeviceChallenge(
                value.getChallengeId(),
                value.getPurpose(),
                value.getVerifiedIdentityId(),
                value.getClientInstanceId(),
                value.getExpectedDeviceKeyId(),
                value.getExpectedPublicKeyDigest(),
                value.getNonce(),
                value.getAudience(),
                copy(value.getAllowedAlgorithms()),
                value.getChallengeDigest(),
                instant(value.getIssuedAt()),
                instant(value.getExpiresAt()),
                instant(value.getConsumedAt()),
                value.getConsumedBy(),
                value.getConsumedRequestDigest());
    }

    static AccessTokenIssuanceEntity toEntity(AccessTokenIssuance value) {
        return new AccessTokenIssuanceEntity(
                value.tokenId(),
                value.tokenDigest(),
                value.enterpriseId(),
                value.userId(),
                value.deviceId(),
                value.clientInstanceId(),
                value.permissions(),
                value.identityDigest(),
                value.deviceRevision(),
                value.permissionRevision(),
                at(value.issuedAt()),
                at(value.expiresAt()),
                value.challengeId());
    }

    static AccessTokenIssuance toDomain(AccessTokenIssuanceEntity value) {
        return new AccessTokenIssuance(
                value.getTokenId(),
                value.getTokenDigest(),
                value.getEnterpriseId(),
                value.getUserId(),
                value.getDeviceId(),
                value.getClientInstanceId(),
                copy(value.getPermissions()),
                value.getIdentityDigest(),
                value.getDeviceRevision(),
                value.getPermissionRevision(),
                instant(value.getIssuedAt()),
                instant(value.getExpiresAt()),
                value.getChallengeId());
    }

    private static OffsetDateTime at(Instant value) {
        return value == null ? null : value.atOffset(ZoneOffset.UTC);
    }

    private static Instant instant(OffsetDateTime value) {
        return value == null ? null : value.toInstant();
    }

    private static List<String> copy(List<String> values) {
        return values == null ? null : List.copyOf(values);
    }
}
