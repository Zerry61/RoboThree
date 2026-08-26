package com.robothree.central.persistence.mybatis.entity;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import lombok.Getter;

@Getter
public final class EnterpriseSessionLeaseIssuanceEntity {

    private UUID tokenId;
    private String tokenDigest;
    private String claimsProfile;
    private String issuer;
    private String audience;
    private String enterpriseId;
    private String userId;
    private String deviceId;
    private UUID verifiedIdentityId;
    private String identitySourceRevision;
    private UUID clientInstanceId;
    private List<String> permissions;
    private String identityDigest;
    private long deviceSourceRevision;
    private String deviceRevisionDigest;
    private String permissionRevisionDigest;
    private String compatibilityRevision;
    private String trustSource;
    private String managedStatus;
    private String complianceStatus;
    private OffsetDateTime issuedAt;
    private OffsetDateTime expiresAt;
    private OffsetDateTime trustEvaluatedAt;
    private UUID challengeId;
    private String challengeBindingDigest;
    private String sessionAssertionRevision;
    private String sessionAssertionDigest;
    private String sessionAssertionJson;
    private String deviceTrustDecisionRevision;
    private String deviceTrustDecisionDigest;
    private String deviceTrustDecisionJson;
    private String sourceDecisionDigest;
    private String requestDigest;
    private String recordDigest;

    public EnterpriseSessionLeaseIssuanceEntity() {}

    @SuppressWarnings("ParameterNumber")
    public EnterpriseSessionLeaseIssuanceEntity(
            UUID tokenId,
            String tokenDigest,
            String claimsProfile,
            String issuer,
            String audience,
            String enterpriseId,
            String userId,
            String deviceId,
            UUID verifiedIdentityId,
            String identitySourceRevision,
            UUID clientInstanceId,
            List<String> permissions,
            String identityDigest,
            long deviceSourceRevision,
            String deviceRevisionDigest,
            String permissionRevisionDigest,
            String compatibilityRevision,
            String trustSource,
            String managedStatus,
            String complianceStatus,
            OffsetDateTime issuedAt,
            OffsetDateTime expiresAt,
            OffsetDateTime trustEvaluatedAt,
            UUID challengeId,
            String challengeBindingDigest,
            String sessionAssertionRevision,
            String sessionAssertionDigest,
            String sessionAssertionJson,
            String deviceTrustDecisionRevision,
            String deviceTrustDecisionDigest,
            String deviceTrustDecisionJson,
            String sourceDecisionDigest,
            String requestDigest,
            String recordDigest) {
        this.tokenId = tokenId;
        this.tokenDigest = tokenDigest;
        this.claimsProfile = claimsProfile;
        this.issuer = issuer;
        this.audience = audience;
        this.enterpriseId = enterpriseId;
        this.userId = userId;
        this.deviceId = deviceId;
        this.verifiedIdentityId = verifiedIdentityId;
        this.identitySourceRevision = identitySourceRevision;
        this.clientInstanceId = clientInstanceId;
        this.permissions = permissions;
        this.identityDigest = identityDigest;
        this.deviceSourceRevision = deviceSourceRevision;
        this.deviceRevisionDigest = deviceRevisionDigest;
        this.permissionRevisionDigest = permissionRevisionDigest;
        this.compatibilityRevision = compatibilityRevision;
        this.trustSource = trustSource;
        this.managedStatus = managedStatus;
        this.complianceStatus = complianceStatus;
        this.issuedAt = issuedAt;
        this.expiresAt = expiresAt;
        this.trustEvaluatedAt = trustEvaluatedAt;
        this.challengeId = challengeId;
        this.challengeBindingDigest = challengeBindingDigest;
        this.sessionAssertionRevision = sessionAssertionRevision;
        this.sessionAssertionDigest = sessionAssertionDigest;
        this.sessionAssertionJson = sessionAssertionJson;
        this.deviceTrustDecisionRevision = deviceTrustDecisionRevision;
        this.deviceTrustDecisionDigest = deviceTrustDecisionDigest;
        this.deviceTrustDecisionJson = deviceTrustDecisionJson;
        this.sourceDecisionDigest = sourceDecisionDigest;
        this.requestDigest = requestDigest;
        this.recordDigest = recordDigest;
    }
}
