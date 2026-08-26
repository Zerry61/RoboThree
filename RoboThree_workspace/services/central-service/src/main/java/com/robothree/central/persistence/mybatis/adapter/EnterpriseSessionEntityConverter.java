package com.robothree.central.persistence.mybatis.adapter;

import com.robothree.central.authentication.domain.EnterpriseSessionChallengeBinding;
import com.robothree.central.authentication.domain.EnterpriseSessionLeaseIssuance;
import com.robothree.central.persistence.mybatis.entity.EnterpriseSessionChallengeBindingEntity;
import com.robothree.central.persistence.mybatis.entity.EnterpriseSessionLeaseIssuanceEntity;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;

final class EnterpriseSessionEntityConverter {

    private EnterpriseSessionEntityConverter() {}

    static EnterpriseSessionChallengeBindingEntity toEntity(
            EnterpriseSessionChallengeBinding value) {
        return new EnterpriseSessionChallengeBindingEntity(
                value.challengeId(),
                value.verifiedIdentityId(),
                value.claimsProfile(),
                value.identitySourceRevision(),
                value.currentClientInstanceId(),
                value.audience(),
                value.requiredPermissions(),
                value.deviceKeyId(),
                value.correlationId(),
                value.challengeBindingDigest(),
                value.recordDigest(),
                at(value.createdAt()));
    }

    static EnterpriseSessionChallengeBinding toDomain(
            EnterpriseSessionChallengeBindingEntity value) {
        return new EnterpriseSessionChallengeBinding(
                value.getChallengeId(),
                value.getVerifiedIdentityId(),
                value.getClaimsProfile(),
                value.getIdentitySourceRevision(),
                value.getCurrentClientInstanceId(),
                value.getAudience(),
                copy(value.getRequiredPermissions()),
                value.getDeviceKeyId(),
                value.getCorrelationId(),
                value.getBindingDigest(),
                value.getRecordDigest(),
                instant(value.getCreatedAt()));
    }

    static EnterpriseSessionLeaseIssuanceEntity toEntity(
            EnterpriseSessionLeaseIssuance value) {
        return new EnterpriseSessionLeaseIssuanceEntity(
                value.tokenId(),
                value.tokenDigest(),
                value.claimsProfile(),
                value.issuer(),
                value.audience(),
                value.enterpriseId(),
                value.userId(),
                value.deviceId(),
                value.verifiedIdentityId(),
                value.identitySourceRevision(),
                value.clientInstanceId(),
                value.permissions(),
                value.identityDigest(),
                value.deviceSourceRevision(),
                value.deviceRevisionDigest(),
                value.permissionRevisionDigest(),
                value.compatibilityRevision(),
                value.trustSource(),
                value.managedStatus(),
                value.complianceStatus(),
                at(value.issuedAt()),
                at(value.expiresAt()),
                at(value.trustEvaluatedAt()),
                value.challengeId(),
                value.challengeBindingDigest(),
                value.sessionAssertionRevision(),
                value.sessionAssertionDigest(),
                value.sessionAssertionJson(),
                value.deviceTrustDecisionRevision(),
                value.deviceTrustDecisionDigest(),
                value.deviceTrustDecisionJson(),
                value.sourceDecisionDigest(),
                value.requestDigest(),
                value.recordDigest());
    }

    static EnterpriseSessionLeaseIssuance toDomain(
            EnterpriseSessionLeaseIssuanceEntity value) {
        return new EnterpriseSessionLeaseIssuance(
                value.getTokenId(),
                value.getTokenDigest(),
                value.getClaimsProfile(),
                value.getIssuer(),
                value.getAudience(),
                value.getEnterpriseId(),
                value.getUserId(),
                value.getDeviceId(),
                value.getVerifiedIdentityId(),
                value.getIdentitySourceRevision(),
                value.getClientInstanceId(),
                copy(value.getPermissions()),
                value.getIdentityDigest(),
                value.getDeviceSourceRevision(),
                value.getDeviceRevisionDigest(),
                value.getPermissionRevisionDigest(),
                value.getCompatibilityRevision(),
                value.getTrustSource(),
                value.getManagedStatus(),
                value.getComplianceStatus(),
                instant(value.getIssuedAt()),
                instant(value.getExpiresAt()),
                instant(value.getTrustEvaluatedAt()),
                value.getChallengeId(),
                value.getChallengeBindingDigest(),
                value.getSessionAssertionRevision(),
                value.getSessionAssertionDigest(),
                value.getSessionAssertionJson(),
                value.getDeviceTrustDecisionRevision(),
                value.getDeviceTrustDecisionDigest(),
                value.getDeviceTrustDecisionJson(),
                value.getSourceDecisionDigest(),
                value.getRequestDigest(),
                value.getRecordDigest());
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
