package com.robothree.central.authentication.adapter.http;

import com.robothree.central.authentication.adapter.http.EnterpriseTokenHttpModels.IssueAccessTokenRequest;
import com.robothree.central.authentication.application.RoboThreeAccessTokenService;

final class EnterpriseTokenHttpMapper {

    private EnterpriseTokenHttpMapper() {}

    static RoboThreeAccessTokenService.IssueAccessTokenCommand toCommand(
            IssueAccessTokenRequest request) {
        return new RoboThreeAccessTokenService.IssueAccessTokenCommand(
                request.verifiedIdentityId(),
                request.clientInstanceId(),
                request.deviceProof().toDomain());
    }
}
