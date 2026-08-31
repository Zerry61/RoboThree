package com.robothree.central.admincontrol.adapter.http;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.admincontrol.application.AdminModelCommandService;
import com.robothree.central.admincontrol.application.AdminModelMutationException;
import com.robothree.central.admincontrol.application.AdminReadRequestAuthorizer;
import com.robothree.central.admincontrol.domain.AdminManagedModel;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Clock;
import java.util.List;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile({"development", "test"})
@ConditionalOnProperty(name = "robothree.admin-api.internal-trial-model-write-enabled",
        havingValue = "true")
@RequestMapping(path = "/admin/v1alpha2", produces = MediaType.APPLICATION_JSON_VALUE)
public final class AdminModelHttpController {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Pattern MODEL_ID = Pattern.compile(
            "^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)+$");
    private final AdminModelCommandService service;
    private final AdminReadRequestAuthorizer authorizer;
    private final Clock clock;

    public AdminModelHttpController(AdminModelCommandService service,
            AdminReadRequestAuthorizer authorizer, Clock clock) {
        this.service = service; this.authorizer = authorizer; this.clock = clock;
    }

    @GetMapping("/models")
    public ResponseEntity<ObjectNode> list(
            @RequestHeader("X-RoboThree-Contract-Version") String version,
            @RequestHeader("X-RoboThree-Query-Id") String requestId,
            @RequestHeader("X-RoboThree-Correlation-Id") String correlationId) {
        validateVersion(version); authorizer.authorizeCapability("admin.model.read");
        List<AdminManagedModel> models = service.list();
        ArrayNode items = JSON.createArrayNode(); models.forEach(model -> items.add(summary(model)));
        ObjectNode page = JSON.createObjectNode(); page.put("contractVersion", version);
        page.put("queryRevision", "sha256:" + com.robothree.central.shared.json.CanonicalJson.sha256(
                com.robothree.central.shared.json.CanonicalJson.canonicalize(items)));
        page.set("items", items);
        return ok(envelope(uuid(requestId), uuid(correlationId), page));
    }

    @GetMapping("/models/{modelId}")
    public ResponseEntity<ObjectNode> detail(@PathVariable String modelId,
            @RequestHeader("X-RoboThree-Contract-Version") String version,
            @RequestHeader("X-RoboThree-Query-Id") String requestId,
            @RequestHeader("X-RoboThree-Correlation-Id") String correlationId) {
        validateVersion(version); validateModelId(modelId);
        authorizer.authorizeCapability("admin.model.read");
        ObjectNode value = summary(service.get(modelId));
        AdminManagedModel model = service.get(modelId);
        value.put("endpoint", model.endpoint()); value.put("providerModelId", model.providerModelId());
        return ok(envelope(uuid(requestId), uuid(correlationId), value));
    }

    @PostMapping({"/models", "/models/{modelId}", "/models/{modelId}/connection-tests",
            "/models/{modelId}/lifecycle", "/models/default"})
    public ResponseEntity<ObjectNode> mutate(HttpServletRequest request,
            @PathVariable(required = false) String modelId,
            @RequestHeader("X-RoboThree-Contract-Version") String version,
            @RequestHeader("X-RoboThree-Correlation-Id") String correlationId,
            @RequestBody ObjectNode command) {
        validateVersion(version); authorizer.authorizeCapability("admin.model.write");
        UUID correlation = uuid(correlationId);
        if (!correlation.toString().equals(command.path("correlationId").asText()))
            throw AdminModelMutationException.invalidRequest();
        if (modelId != null) {
            validateModelId(modelId);
            if (!modelId.equals(command.path("modelId").asText()))
                throw AdminModelMutationException.invalidRequest();
        }
        ObjectNode receipt = service.execute(command, "internal-trial-admin");
        return ok(envelope(UUID.fromString(command.path("commandId").asText()), correlation, receipt));
    }

    private ObjectNode summary(AdminManagedModel model) {
        ObjectNode value = JSON.createObjectNode();
        value.put("modelId", model.modelId()); value.put("modelRevision", model.modelRevision());
        value.put("displayName", model.displayName()); value.put("providerFamily", model.providerFamily());
        value.put("lifecycle", model.lifecycle());
        value.put("defaultForNewTasks", service.currentDefault().map(item ->
                item.modelId().equals(model.modelId()) && item.modelRevision().equals(model.modelRevision()))
                .orElse(false));
        value.put("credentialStatus", model.credentialConfigured() ? "configured" : "missing");
        ObjectNode check = value.putObject("lastConnectionCheck");
        check.put("status", model.connectionStatus());
        if (model.connectionSafeReason() != null) check.put("safeReason", model.connectionSafeReason());
        if (model.connectionDurationMs() != null) check.put("durationMs", model.connectionDurationMs());
        if (model.connectionTestedAt() != null) check.put("testedAt", model.connectionTestedAt().toString());
        if (model.connectionCorrelationId() != null)
            check.put("correlationId", model.connectionCorrelationId().toString());
        return value;
    }

    private ObjectNode envelope(UUID requestId, UUID correlationId, ObjectNode data) {
        ObjectNode value = JSON.createObjectNode(); value.put("contractVersion", "admin-control.v1alpha2");
        value.put("requestId", requestId.toString()); value.put("correlationId", correlationId.toString());
        value.put("serverTime", clock.instant().toString()); value.put("testIdentityUsed", true);
        value.put("productionIdentityReady", false); value.set("data", data); return value;
    }
    private static ResponseEntity<ObjectNode> ok(ObjectNode body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }
    private static void validateVersion(String value) {
        if (!"admin-control.v1alpha2".equals(value)) throw AdminModelMutationException.invalidRequest();
    }
    private static void validateModelId(String value) {
        if (value == null || value.length() > 200 || !MODEL_ID.matcher(value).matches())
            throw AdminModelMutationException.invalidRequest();
    }
    private static UUID uuid(String value) {
        try { return UUID.fromString(value); }
        catch (RuntimeException exception) { throw AdminModelMutationException.invalidRequest(); }
    }
}
