package com.robothree.central.modelgateway.application;

import com.robothree.central.authentication.application.EnterpriseBearerAuthorization;
import com.robothree.central.authentication.port.EnterpriseBearerAuthorizer;
import com.robothree.central.modelgateway.port.ModelInvocationAccessAuthorizer;
import java.time.Clock;
import java.util.Objects;

public final class RoboThreeModelInvocationAccessAuthorizer
        implements ModelInvocationAccessAuthorizer {

    private final EnterpriseBearerAuthorizer bearerAuthorizer;
    private final Clock clock;

    public RoboThreeModelInvocationAccessAuthorizer(
            EnterpriseBearerAuthorizer bearerAuthorizer,
            Clock clock) {
        this.bearerAuthorizer = Objects.requireNonNull(bearerAuthorizer, "bearerAuthorizer");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    @Override
    public AuthorizedSubject authorizeModelUse(String compactAccessToken) {
        var principal = EnterpriseBearerAuthorization.requirePrincipal(
                bearerAuthorizer.authorize(
                        compactAccessToken, "model.use", clock.instant()),
                "model.use");
        return new AuthorizedSubject(
                principal.enterpriseId(),
                principal.userId(),
                principal.deviceId(),
                principal.clientInstanceId().toString());
    }
}
