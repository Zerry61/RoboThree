package com.robothree.central.admincontrol.adapter.http;

import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.admincontrol.application.AdminReadException;
import com.robothree.central.admincontrol.application.AdminReadProjectionService;
import com.robothree.central.admincontrol.application.AdminReadResult;
import com.robothree.central.admincontrol.domain.AdminModule;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile({"development", "test"})
@ConditionalOnProperty(
        name = "robothree.admin-api.test-read-shell-enabled",
        havingValue = "true")
@RequestMapping(path = "/admin/v1alpha1", produces = MediaType.APPLICATION_JSON_VALUE)
public final class AdminReadHttpController {

    private static final Pattern RESOURCE_ID = Pattern.compile(
            "^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)+$");
    private static final Pattern ETAG = Pattern.compile(
            "^\"sha256:[a-f0-9]{64}\"$");
    private final AdminReadProjectionService service;

    public AdminReadHttpController(AdminReadProjectionService service) {
        this.service = service;
    }

    @GetMapping("/capabilities/current")
    public ResponseEntity<ObjectNode> capabilities(
            HttpServletRequest request,
            @RequestHeader("X-RoboThree-Contract-Version") String contractVersion,
            @RequestHeader("X-RoboThree-Query-Id") String queryId,
            @RequestHeader("X-RoboThree-Correlation-Id") String correlationId,
            @RequestHeader(value = HttpHeaders.IF_NONE_MATCH, required = false) String ifNoneMatch) {
        validate(request, contractVersion, Set.of());
        return response(service.capabilities(
                uuid(queryId), uuid(correlationId), etag(ifNoneMatch)));
    }

    @GetMapping("/models")
    public ResponseEntity<ObjectNode> models(
            HttpServletRequest request,
            @RequestHeader("X-RoboThree-Contract-Version") String contractVersion,
            @RequestHeader("X-RoboThree-Query-Id") String queryId,
            @RequestHeader("X-RoboThree-Correlation-Id") String correlationId,
            @RequestHeader(value = HttpHeaders.IF_NONE_MATCH, required = false) String ifNoneMatch,
            @RequestParam(value = "cursor", required = false) String cursor,
            @RequestParam(value = "limit", defaultValue = "50") int limit) {
        return list(AdminModule.MODELS, request, contractVersion, queryId,
                correlationId, ifNoneMatch, cursor, limit);
    }

    @GetMapping("/models/{modelId}")
    public ResponseEntity<ObjectNode> model(
            HttpServletRequest request,
            @PathVariable String modelId,
            @RequestHeader("X-RoboThree-Contract-Version") String contractVersion,
            @RequestHeader("X-RoboThree-Query-Id") String queryId,
            @RequestHeader("X-RoboThree-Correlation-Id") String correlationId,
            @RequestHeader(value = HttpHeaders.IF_NONE_MATCH, required = false) String ifNoneMatch) {
        return detail(AdminModule.MODELS, modelId, request, contractVersion,
                queryId, correlationId, ifNoneMatch);
    }

    @GetMapping("/robots")
    public ResponseEntity<ObjectNode> robots(
            HttpServletRequest request,
            @RequestHeader("X-RoboThree-Contract-Version") String contractVersion,
            @RequestHeader("X-RoboThree-Query-Id") String queryId,
            @RequestHeader("X-RoboThree-Correlation-Id") String correlationId,
            @RequestHeader(value = HttpHeaders.IF_NONE_MATCH, required = false) String ifNoneMatch,
            @RequestParam(value = "cursor", required = false) String cursor,
            @RequestParam(value = "limit", defaultValue = "50") int limit) {
        return list(AdminModule.ROBOTS, request, contractVersion, queryId,
                correlationId, ifNoneMatch, cursor, limit);
    }

    @GetMapping("/robots/{robotId}")
    public ResponseEntity<ObjectNode> robot(
            HttpServletRequest request,
            @PathVariable String robotId,
            @RequestHeader("X-RoboThree-Contract-Version") String contractVersion,
            @RequestHeader("X-RoboThree-Query-Id") String queryId,
            @RequestHeader("X-RoboThree-Correlation-Id") String correlationId,
            @RequestHeader(value = HttpHeaders.IF_NONE_MATCH, required = false) String ifNoneMatch) {
        return detail(AdminModule.ROBOTS, robotId, request, contractVersion,
                queryId, correlationId, ifNoneMatch);
    }

    @GetMapping("/skills")
    public ResponseEntity<ObjectNode> skills(
            HttpServletRequest request,
            @RequestHeader("X-RoboThree-Contract-Version") String contractVersion,
            @RequestHeader("X-RoboThree-Query-Id") String queryId,
            @RequestHeader("X-RoboThree-Correlation-Id") String correlationId,
            @RequestHeader(value = HttpHeaders.IF_NONE_MATCH, required = false) String ifNoneMatch,
            @RequestParam(value = "cursor", required = false) String cursor,
            @RequestParam(value = "limit", defaultValue = "50") int limit) {
        return list(AdminModule.SKILLS, request, contractVersion, queryId,
                correlationId, ifNoneMatch, cursor, limit);
    }

    @GetMapping("/skills/{skillId}")
    public ResponseEntity<ObjectNode> skill(
            HttpServletRequest request,
            @PathVariable String skillId,
            @RequestHeader("X-RoboThree-Contract-Version") String contractVersion,
            @RequestHeader("X-RoboThree-Query-Id") String queryId,
            @RequestHeader("X-RoboThree-Correlation-Id") String correlationId,
            @RequestHeader(value = HttpHeaders.IF_NONE_MATCH, required = false) String ifNoneMatch) {
        return detail(AdminModule.SKILLS, skillId, request, contractVersion,
                queryId, correlationId, ifNoneMatch);
    }

    @GetMapping("/tools")
    public ResponseEntity<ObjectNode> tools(
            HttpServletRequest request,
            @RequestHeader("X-RoboThree-Contract-Version") String contractVersion,
            @RequestHeader("X-RoboThree-Query-Id") String queryId,
            @RequestHeader("X-RoboThree-Correlation-Id") String correlationId,
            @RequestHeader(value = HttpHeaders.IF_NONE_MATCH, required = false) String ifNoneMatch,
            @RequestParam(value = "cursor", required = false) String cursor,
            @RequestParam(value = "limit", defaultValue = "50") int limit) {
        return list(AdminModule.TOOLS, request, contractVersion, queryId,
                correlationId, ifNoneMatch, cursor, limit);
    }

    @GetMapping("/tools/{toolId}")
    public ResponseEntity<ObjectNode> tool(
            HttpServletRequest request,
            @PathVariable String toolId,
            @RequestHeader("X-RoboThree-Contract-Version") String contractVersion,
            @RequestHeader("X-RoboThree-Query-Id") String queryId,
            @RequestHeader("X-RoboThree-Correlation-Id") String correlationId,
            @RequestHeader(value = HttpHeaders.IF_NONE_MATCH, required = false) String ifNoneMatch) {
        return detail(AdminModule.TOOLS, toolId, request, contractVersion,
                queryId, correlationId, ifNoneMatch);
    }

    @GetMapping("/knowledge")
    public ResponseEntity<ObjectNode> knowledge(
            HttpServletRequest request,
            @RequestHeader("X-RoboThree-Contract-Version") String contractVersion,
            @RequestHeader("X-RoboThree-Query-Id") String queryId,
            @RequestHeader("X-RoboThree-Correlation-Id") String correlationId,
            @RequestHeader(value = HttpHeaders.IF_NONE_MATCH, required = false) String ifNoneMatch,
            @RequestParam(value = "cursor", required = false) String cursor,
            @RequestParam(value = "limit", defaultValue = "50") int limit) {
        return list(AdminModule.KNOWLEDGE, request, contractVersion, queryId,
                correlationId, ifNoneMatch, cursor, limit);
    }

    @GetMapping("/knowledge/{knowledgeId}")
    public ResponseEntity<ObjectNode> knowledgeDetail(
            HttpServletRequest request,
            @PathVariable String knowledgeId,
            @RequestHeader("X-RoboThree-Contract-Version") String contractVersion,
            @RequestHeader("X-RoboThree-Query-Id") String queryId,
            @RequestHeader("X-RoboThree-Correlation-Id") String correlationId,
            @RequestHeader(value = HttpHeaders.IF_NONE_MATCH, required = false) String ifNoneMatch) {
        return detail(AdminModule.KNOWLEDGE, knowledgeId, request, contractVersion,
                queryId, correlationId, ifNoneMatch);
    }

    @GetMapping("/system/audit-events")
    public ResponseEntity<ObjectNode> auditEvents(
            HttpServletRequest request,
            @RequestHeader("X-RoboThree-Contract-Version") String contractVersion,
            @RequestHeader("X-RoboThree-Query-Id") String queryId,
            @RequestHeader("X-RoboThree-Correlation-Id") String correlationId,
            @RequestHeader(value = HttpHeaders.IF_NONE_MATCH, required = false) String ifNoneMatch,
            @RequestParam(value = "cursor", required = false) String cursor,
            @RequestParam(value = "limit", defaultValue = "50") int limit) {
        return list(AdminModule.SYSTEM, request, contractVersion, queryId,
                correlationId, ifNoneMatch, cursor, limit);
    }

    private ResponseEntity<ObjectNode> list(
            AdminModule module,
            HttpServletRequest request,
            String contractVersion,
            String queryId,
            String correlationId,
            String ifNoneMatch,
            String cursor,
            int limit) {
        validate(request, contractVersion, Set.of("cursor", "limit"));
        if (limit < 1 || limit > 100) throw AdminReadException.invalidRequest();
        return response(service.list(module, uuid(queryId), uuid(correlationId),
                cursor, limit, etag(ifNoneMatch)));
    }

    private ResponseEntity<ObjectNode> detail(
            AdminModule module,
            String resourceId,
            HttpServletRequest request,
            String contractVersion,
            String queryId,
            String correlationId,
            String ifNoneMatch) {
        validate(request, contractVersion, Set.of());
        if (resourceId == null || resourceId.length() > 160
                || !RESOURCE_ID.matcher(resourceId).matches()) {
            throw AdminReadException.invalidRequest();
        }
        return response(service.detail(module, resourceId, uuid(queryId),
                uuid(correlationId), etag(ifNoneMatch)));
    }

    private static void validate(
            HttpServletRequest request, String contractVersion, Set<String> allowedQuery) {
        if (!AdminReadProjectionService.CONTRACT_VERSION.equals(contractVersion)
                || request.getContentLengthLong() > 0
                || request.getHeader(HttpHeaders.TRANSFER_ENCODING) != null
                || !allowedQuery.containsAll(request.getParameterMap().keySet())) {
            throw AdminReadException.invalidRequest();
        }
        for (String name : request.getParameterMap().keySet()) {
            if (request.getParameterValues(name).length != 1) {
                throw AdminReadException.invalidRequest();
            }
        }
    }

    private static UUID uuid(String value) {
        try {
            return UUID.fromString(value);
        } catch (RuntimeException exception) {
            throw AdminReadException.invalidRequest();
        }
    }

    private static String etag(String value) {
        if (value != null && !ETAG.matcher(value).matches()) {
            throw AdminReadException.invalidRequest();
        }
        return value;
    }

    private static ResponseEntity<ObjectNode> response(AdminReadResult result) {
        ResponseEntity.BodyBuilder builder = ResponseEntity.status(result.httpStatus())
                .cacheControl(CacheControl.noStore())
                .header(HttpHeaders.ETAG, result.etag());
        return result.httpStatus() == 304
                ? builder.build()
                : builder.body(result.body());
    }
}
