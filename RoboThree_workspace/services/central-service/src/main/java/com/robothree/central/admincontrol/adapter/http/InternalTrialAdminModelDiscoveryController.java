package com.robothree.central.admincontrol.adapter.http;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.admincontrol.application.AdminModelStore;
import com.robothree.central.authentication.application.EnterpriseBearerAuthorization;
import com.robothree.central.authentication.port.EnterpriseBearerAuthorizer;
import com.robothree.central.shared.adapter.http.EnterpriseBearerTokenFilter;
import java.time.Clock;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Internal-trial discovery exposes one safe default model projection to the
 * privileged Desktop Main process. Endpoint, provider model id and credential
 * material remain server-side and are resolved only after Task acceptance.
 */
@RestController
@Profile({"development", "test"})
@RequestMapping("/internal-trial/v1/admin-models")
@ConditionalOnProperty(name = "robothree.admin-api.internal-trial-model-write-enabled",
        havingValue = "true")
@ConditionalOnBean({AdminModelStore.class, EnterpriseBearerAuthorizer.class})
@RequiredArgsConstructor
public final class InternalTrialAdminModelDiscoveryController {
    private static final ObjectMapper JSON = new ObjectMapper();

    private final AdminModelStore store;
    private final EnterpriseBearerAuthorizer authorizer;
    private final Clock clock;

    @Value("${robothree.admin-api.internal-trial-model-context-window-tokens:128000}")
    private int contextWindowTokens;

    @Value("${robothree.admin-api.internal-trial-model-max-output-tokens:8192}")
    private int maxOutputTokens;

    @GetMapping(path = "/default", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ObjectNode> defaultModel(
            @RequestAttribute(EnterpriseBearerTokenFilter.ACCESS_TOKEN_ATTRIBUTE)
                    String compactToken) {
        EnterpriseBearerAuthorization.requirePrincipal(
                authorizer.authorize(compactToken, "model.use", clock.instant()),
                "model.use");
        var selected = store.findDefault().orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND));
        var model = store.findCurrent(selected.modelId()).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE));
        if (!model.modelRevision().equals(selected.modelRevision())
                || !model.lifecycle().equals("enabled")
                || !model.credentialConfigured()
                || !model.connectionStatus().equals("success")) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE);
        }
        ObjectNode result = JSON.createObjectNode();
        result.put("schemaVersion", "mvp-admin-vs1.internal-trial.v1");
        result.put("configurationRevision", model.modelRevision());
        result.put("modelId", model.modelId());
        result.put("modelCreatedAt", model.createdAt().toString());
        result.put("displayName", model.displayName());
        result.put("supportsToolCalling", true);
        int effectiveContextWindowTokens = contextWindowTokens == 0 ? 128_000 : contextWindowTokens;
        int effectiveMaxOutputTokens = maxOutputTokens == 0 ? 8_192 : maxOutputTokens;
        if (effectiveContextWindowTokens < 8_192
                || effectiveContextWindowTokens > 1_048_576
                || effectiveMaxOutputTokens < 256 || effectiveMaxOutputTokens > 262_144
                || effectiveMaxOutputTokens > effectiveContextWindowTokens) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE);
        }
        result.put("contextWindowTokens", effectiveContextWindowTokens);
        result.put("maxOutputTokens", effectiveMaxOutputTokens);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(result);
    }
}
