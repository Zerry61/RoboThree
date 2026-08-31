package com.robothree.central.agentlifecycle.adapter.http;

import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.admincontrol.application.AdminReadRequestAuthorizer;
import com.robothree.central.agentlifecycle.application.AgentLifecycleCommandService;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile({"development", "test"})
@ConditionalOnProperty(name = "robothree.agent-lifecycle.internal-trial-enabled",
        havingValue = "true")
@RequestMapping(path = "/admin/v1alpha2/robot-reviews",
        produces = MediaType.APPLICATION_JSON_VALUE)
public final class AgentLifecycleReviewHttpController {
    private final AgentLifecycleCommandService service;
    private final AdminReadRequestAuthorizer authorizer;

    public AgentLifecycleReviewHttpController(AgentLifecycleCommandService service,
            AdminReadRequestAuthorizer authorizer) {
        this.service = service;
        this.authorizer = authorizer;
    }

    @GetMapping
    public ResponseEntity<ObjectNode> list(@RequestParam(required = false) String state) {
        authorizer.authorizeCapability("admin.robot.write");
        return ok(service.listReviews(state));
    }

    @GetMapping("/{submissionId}")
    public ResponseEntity<ObjectNode> detail(@PathVariable UUID submissionId) {
        authorizer.authorizeCapability("admin.robot.write");
        return ok(service.getReview(submissionId));
    }

    @PostMapping("/commands")
    public ResponseEntity<ObjectNode> command(@RequestBody ObjectNode command) {
        authorizer.authorizeCapability("admin.robot.write");
        return ok(service.executeReviewer(command, "internal-trial-admin"));
    }

    private static ResponseEntity<ObjectNode> ok(ObjectNode body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }
}
