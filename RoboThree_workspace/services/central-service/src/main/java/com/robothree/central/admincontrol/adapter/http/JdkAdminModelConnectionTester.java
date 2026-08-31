package com.robothree.central.admincontrol.adapter.http;

import com.robothree.central.admincontrol.application.AdminModelConnectionTester;
import com.robothree.central.admincontrol.application.AdminModelCredentialCipher;
import com.robothree.central.admincontrol.application.AdminModelStore;
import com.robothree.central.admincontrol.domain.AdminManagedModel;
import com.robothree.central.modelgateway.adapter.http.JdkModelAuthorizedHttpTransport;
import com.robothree.central.modelgateway.adapter.http.StrictModelOutboundEndpointPolicy;
import com.robothree.central.modelgateway.application.ModelGatewayException;
import com.robothree.central.modelgateway.port.ModelAuthorizedHttpTransport;
import java.net.URI;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

public final class JdkAdminModelConnectionTester implements AdminModelConnectionTester {
    private final AdminModelStore store;
    private final AdminModelCredentialCipher cipher;
    private final Clock clock;

    public JdkAdminModelConnectionTester(
            AdminModelStore store, AdminModelCredentialCipher cipher, Clock clock) {
        this.store = store; this.cipher = cipher; this.clock = clock;
    }

    @Override
    public Result test(AdminManagedModel model, UUID correlationId) {
        long started = System.nanoTime();
        String status = "service_error";
        String reason = "模型服务暂时不可用。";
        try {
            URI endpoint = URI.create(model.endpoint());
            ModelAuthorizedHttpTransport transport = new JdkModelAuthorizedHttpTransport(
                    HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER).build(),
                    (reference, revision) -> cipher.decrypt(store.findCredential(reference, revision)
                            .orElseThrow(() -> ModelGatewayException.unavailable(
                                    "model_gateway.credential_unavailable",
                                    "The model provider credential is unavailable."))),
                    new StrictModelOutboundEndpointPolicy(
                            Set.of(endpoint.getHost()), java.net.InetAddress::getAllByName, true));
            byte[] body = ("{\"model\":\"" + jsonEscape(model.providerModelId())
                    + "\",\"messages\":[{\"role\":\"user\",\"content\":\"ping\"}],"
                    + "\"max_tokens\":1,\"stream\":true}").getBytes(StandardCharsets.UTF_8);
            try (ModelAuthorizedHttpTransport.Response response = transport.post(
                    new ModelAuthorizedHttpTransport.Request(endpoint, "chat/completions",
                            ModelAuthorizedHttpTransport.AuthorizationScheme.BEARER,
                            model.credentialReference(), model.credentialRevision(), Map.of(),
                            body, Duration.ofSeconds(20), 32_768))) {
                int code = response.statusCode();
                if (code >= 200 && code < 300) { status = "success"; reason = null; }
                else if (code == 401 || code == 403) { status = "auth_failed"; reason = "访问凭据未通过模型服务验证。"; }
                else if (code == 404) { status = "model_not_found"; reason = "模型服务未找到配置的模型标识。"; }
                else if (code == 429 || code >= 500) { status = "service_error"; reason = "模型服务暂时不可用。"; }
                else { status = "protocol_incompatible"; reason = "模型服务响应与兼容协议不一致。"; }
            }
        } catch (ModelGatewayException exception) {
            if (exception.code().equals("model_gateway.provider_transport_failed")
                    || exception.code().equals("model_gateway.endpoint_resolution_failed")) {
                status = "network_failed"; reason = "无法连接到模型服务。";
            } else if (exception.code().equals("model_gateway.credential_unavailable")) {
                status = "service_error"; reason = "尚未配置可用的访问凭据。";
            } else {
                status = "service_error"; reason = "模型服务暂时不可用。";
            }
        } catch (RuntimeException exception) {
            status = "protocol_incompatible"; reason = "模型服务配置或响应与兼容协议不一致。";
        }
        return new Result(status, reason,
                Math.min(300_000, Duration.ofNanos(System.nanoTime() - started).toMillis()),
                clock.instant(), correlationId);
    }

    private static String jsonEscape(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
