package com.robothree.central.authentication.adapter.http;

import com.robothree.central.authentication.adapter.http.EnterpriseIdentityHttpModels.DeviceChallengeResponse;
import com.robothree.central.authentication.adapter.http.EnterpriseIdentityHttpModels.EnrollDeviceRequest;
import com.robothree.central.authentication.adapter.http.EnterpriseIdentityHttpModels.EnrollDeviceResponse;
import com.robothree.central.authentication.adapter.http.EnterpriseIdentityHttpModels.IssueDeviceChallengeRequest;
import com.robothree.central.authentication.application.IssueDeviceChallengeService;
import com.robothree.central.authentication.application.ManualDeviceEnrollmentService;
import com.robothree.central.shared.observability.CentralObservationRunner;
import com.robothree.central.shared.observability.CentralObservedOperation;
import lombok.NonNull;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping(path = "/v1alpha1", produces = MediaType.APPLICATION_JSON_VALUE)
@ConditionalOnBean({
    IssueDeviceChallengeService.class,
    ManualDeviceEnrollmentService.class
})
@RequiredArgsConstructor
public final class EnterpriseIdentityController {

    @NonNull
    private final IssueDeviceChallengeService challengeService;
    @NonNull
    private final ManualDeviceEnrollmentService enrollmentService;
    @NonNull
    private final CentralObservationRunner observations;

    @PostMapping(
            path = "/device-challenges",
            consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<DeviceChallengeResponse> issueChallenge(
            @RequestBody IssueDeviceChallengeRequest request) {
        EnterpriseIdentityContractValidator.requireIssueChallenge(request);
        var challenge = observations.observe(
                CentralObservedOperation.ISSUE_DEVICE_CHALLENGE,
                () -> challengeService.issue(EnterpriseIdentityHttpMapper.toCommand(request)));
        return EnterpriseIdentityResponseAssembler.ok(
                DeviceChallengeResponse.from(challenge));
    }

    @PostMapping(
            path = "/device-enrollment",
            consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<EnrollDeviceResponse> enroll(
            @RequestBody EnrollDeviceRequest request) {
        EnterpriseIdentityContractValidator.requireEnrollment(request);
        var result = observations.observe(
                CentralObservedOperation.ENROLL_DEVICE,
                () -> enrollmentService.enroll(EnterpriseIdentityHttpMapper.toCommand(request)));
        return EnterpriseIdentityResponseAssembler.ok(EnrollDeviceResponse.from(result));
    }
}
