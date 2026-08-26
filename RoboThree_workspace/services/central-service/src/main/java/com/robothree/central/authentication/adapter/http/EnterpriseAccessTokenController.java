package com.robothree.central.authentication.adapter.http;

import com.robothree.central.authentication.adapter.http.EnterpriseTokenHttpModels.AccessTokenResponse;
import com.robothree.central.authentication.adapter.http.EnterpriseTokenHttpModels.CompatibilityResponse;
import com.robothree.central.authentication.adapter.http.EnterpriseTokenHttpModels.IssueAccessTokenRequest;
import com.robothree.central.authentication.application.RoboThreeAccessTokenService;
import com.robothree.central.authentication.port.CompatibilityEvaluator;
import com.robothree.central.shared.observability.CentralObservationRunner;
import com.robothree.central.shared.observability.CentralObservedOperation;
import lombok.NonNull;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping(path = "/v1alpha1", produces = MediaType.APPLICATION_JSON_VALUE)
@ConditionalOnBean({
    RoboThreeAccessTokenService.class,
    CompatibilityEvaluator.class
})
@RequiredArgsConstructor
public final class EnterpriseAccessTokenController {

    @NonNull
    private final RoboThreeAccessTokenService tokenService;
    @NonNull
    private final CompatibilityEvaluator compatibility;
    @NonNull
    private final CentralObservationRunner observations;

    @GetMapping("/compatibility")
    public ResponseEntity<CompatibilityResponse> compatibility() {
        return EnterpriseIdentityResponseAssembler.ok(
                CompatibilityResponse.from(compatibility.current()));
    }

    @PostMapping(path = "/token", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<AccessTokenResponse> issueToken(
            @RequestBody IssueAccessTokenRequest request) {
        EnterpriseIdentityContractValidator.requireAccessToken(request);
        var result = observations.observe(
                CentralObservedOperation.ISSUE_ACCESS_TOKEN,
                () -> tokenService.issue(EnterpriseTokenHttpMapper.toCommand(request)));
        return EnterpriseIdentityResponseAssembler.ok(AccessTokenResponse.from(result));
    }
}
