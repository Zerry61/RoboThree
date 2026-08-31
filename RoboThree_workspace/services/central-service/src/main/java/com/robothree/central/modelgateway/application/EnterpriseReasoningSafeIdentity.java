package com.robothree.central.modelgateway.application;

import static com.robothree.central.shared.domain.DomainValueChecks.digest;
import static com.robothree.central.shared.domain.DomainValueChecks.text;

import java.util.UUID;

/** Provider-neutral identities accepted from Gateway v1alpha3. */
public sealed interface EnterpriseReasoningSafeIdentity
        permits EnterpriseReasoningSafeIdentity.DefaultPassthrough,
                EnterpriseReasoningSafeIdentity.LockedMaxStrategy {

    UUID reasoningModeLockId();
    String reasoningModeLockDigest();

    record DefaultPassthrough(
            UUID reasoningModeLockId,
            String reasoningModeLockDigest) implements EnterpriseReasoningSafeIdentity {
        public DefaultPassthrough {
            if (reasoningModeLockId == null) throw new NullPointerException("reasoningModeLockId");
            reasoningModeLockDigest = digest(reasoningModeLockDigest, "reasoningModeLockDigest");
        }
    }

    record LockedMaxStrategy(
            UUID reasoningModeLockId,
            String reasoningModeLockDigest,
            String profileId,
            String profileRevision,
            String profileDigest,
            String strategyId,
            String strategyRevision,
            String strategyDigest,
            String mappingRevision,
            String mappingDigest,
            String timeoutPolicyRef) implements EnterpriseReasoningSafeIdentity {
        public LockedMaxStrategy {
            if (reasoningModeLockId == null) throw new NullPointerException("reasoningModeLockId");
            reasoningModeLockDigest = digest(reasoningModeLockDigest, "reasoningModeLockDigest");
            profileId = text(profileId, "profileId");
            profileRevision = digest(profileRevision, "profileRevision");
            profileDigest = digest(profileDigest, "profileDigest");
            strategyId = text(strategyId, "strategyId");
            strategyRevision = digest(strategyRevision, "strategyRevision");
            strategyDigest = digest(strategyDigest, "strategyDigest");
            mappingRevision = digest(mappingRevision, "mappingRevision");
            mappingDigest = digest(mappingDigest, "mappingDigest");
            timeoutPolicyRef = text(timeoutPolicyRef, "timeoutPolicyRef");
            if (!profileRevision.equals(profileDigest)
                    || !mappingRevision.equals(mappingDigest)) {
                throw new IllegalArgumentException("safe reasoning identity is inconsistent");
            }
        }
    }
}

