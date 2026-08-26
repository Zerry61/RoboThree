package com.robothree.central.authentication.adapter.http;

import com.robothree.central.authentication.adapter.http.EnterpriseIdentityHttpModels.EnrollDeviceRequest;
import com.robothree.central.authentication.adapter.http.EnterpriseIdentityHttpModels.IssueDeviceChallengeRequest;
import com.robothree.central.authentication.application.IssueDeviceChallengeService;
import com.robothree.central.authentication.application.ManualDeviceEnrollmentService;

final class EnterpriseIdentityHttpMapper {

    private EnterpriseIdentityHttpMapper() {}

    static IssueDeviceChallengeService.IssueDeviceChallengeCommand toCommand(
            IssueDeviceChallengeRequest request) {
        return new IssueDeviceChallengeService.IssueDeviceChallengeCommand(
                request.purpose(),
                request.verifiedIdentityId(),
                request.clientInstanceId(),
                request.deviceKeyId(),
                request.deviceEnrollmentCode(),
                request.publicKeyDigest());
    }

    static ManualDeviceEnrollmentService.EnrollDeviceCommand toCommand(
            EnrollDeviceRequest request) {
        return new ManualDeviceEnrollmentService.EnrollDeviceCommand(
                request.verifiedIdentityId(),
                request.deviceEnrollmentCode(),
                request.clientInstanceId(),
                request.devicePublicKey().toDomain(),
                request.deviceProof().toDomain());
    }
}
