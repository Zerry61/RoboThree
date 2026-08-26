package com.robothree.central.modelgateway.port;

public interface ModelInvocationAccessAuthorizer {

    AuthorizedSubject authorizeModelUse(String compactAccessToken);

    record AuthorizedSubject(
            String enterpriseId,
            String userId,
            String deviceId,
            String clientInstanceId) {}
}
