package com.robothree.central.authentication.adapter.http;

import com.robothree.central.authentication.adapter.http.EnterpriseIdentityHttpModels.EnrollDeviceRequest;
import com.robothree.central.authentication.adapter.http.EnterpriseIdentityHttpModels.IssueDeviceChallengeRequest;
import com.robothree.central.authentication.adapter.http.EnterpriseTokenHttpModels.IssueAccessTokenRequest;
import com.robothree.central.authentication.application.EnterpriseAuthenticationException;

final class EnterpriseIdentityContractValidator {

    private EnterpriseIdentityContractValidator() {}

    static void requireIssueChallenge(IssueDeviceChallengeRequest request) {
        requireEnvelope(
                request.type(),
                "issue_device_challenge_request",
                request.contractVersion());
    }

    static void requireEnrollment(EnrollDeviceRequest request) {
        requireEnvelope(
                request.type(),
                "enroll_device_request",
                request.contractVersion());
        if (request.devicePublicKey() == null || request.deviceProof() == null) {
            throw invalidContract();
        }
    }

    static void requireAccessToken(IssueAccessTokenRequest request) {
        requireEnvelope(
                request.type(),
                "issue_access_token_request",
                request.contractVersion());
        if (request.verifiedIdentityId() == null || request.deviceProof() == null) {
            throw invalidContract();
        }
    }

    private static void requireEnvelope(
            String actualType,
            String expectedType,
            String contractVersion) {
        if (!expectedType.equals(actualType) || !"v1alpha1".equals(contractVersion)) {
            throw invalidContract();
        }
    }

    private static EnterpriseAuthenticationException invalidContract() {
        return EnterpriseAuthenticationException.validation(
                "contract_validation_failed",
                "Request does not satisfy the Enterprise Gateway Contract.");
    }
}
