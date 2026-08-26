package com.robothree.central.authentication.adapter.http;

import com.robothree.central.authentication.application.RoboThreeAccessTokenService;
import com.robothree.central.authentication.domain.EnterpriseCompatibility;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

final class EnterpriseTokenHttpModels {

    private EnterpriseTokenHttpModels() {}

    record IssueAccessTokenRequest(
            String type,
            String contractVersion,
            UUID verifiedIdentityId,
            String clientInstanceId,
            EnterpriseIdentityHttpModels.DeviceProofBody deviceProof) {}

    record AccessTokenResponse(
            String type,
            String contractVersion,
            String tokenType,
            String accessToken,
            Instant expiresAt) {

        static AccessTokenResponse from(
                RoboThreeAccessTokenService.IssueAccessTokenResult result) {
            return new AccessTokenResponse(
                    "token_result",
                    "v1alpha1",
                    result.tokenType(),
                    result.accessToken(),
                    result.expiresAt());
        }
    }

    record CompatibilityResponse(
            String contractVersion,
            String centralVersion,
            List<String> supportedContractVersions,
            String minimumDesktopVersion,
            String minimumCoreVersion,
            List<String> features,
            String maintenanceStatus,
            List<String> configurationSchemaVersions) {

        static CompatibilityResponse from(EnterpriseCompatibility compatibility) {
            return new CompatibilityResponse(
                    compatibility.contractVersion(),
                    compatibility.centralVersion(),
                    compatibility.supportedContractVersions(),
                    compatibility.minimumDesktopVersion(),
                    compatibility.minimumCoreVersion(),
                    compatibility.features(),
                    compatibility.maintenanceStatus(),
                    compatibility.configurationSchemaVersions());
        }
    }
}
