package com.robothree.central.agentlifecycle.adapter.http;

import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.agentlifecycle.application.AgentLifecycleCommandService;
import com.robothree.central.agentlifecycle.application.AgentLifecycleException;
import com.robothree.central.agentlifecycle.application.InternalTrialAgentLifecycleTokenAuthorizer;
import com.robothree.central.shared.adapter.http.EnterpriseBearerTokenFilter;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile({"development", "test"})
@ConditionalOnProperty(name = "robothree.agent-lifecycle.internal-trial-enabled",
        havingValue = "true")
@RequestMapping(path = "/internal-trial/v1/agent-lifecycle",
        produces = MediaType.APPLICATION_JSON_VALUE)
public final class AgentLifecycleHttpController {
    private final AgentLifecycleCommandService service;
    private final InternalTrialAgentLifecycleTokenAuthorizer tokens;

    public AgentLifecycleHttpController(AgentLifecycleCommandService service,
            InternalTrialAgentLifecycleTokenAuthorizer tokens) {
        this.service = service;
        this.tokens = tokens;
    }

    @GetMapping("/drafts")
    public ResponseEntity<ObjectNode> listDrafts(
            @RequestAttribute(EnterpriseBearerTokenFilter.ACCESS_TOKEN_ATTRIBUTE) String token) {
        return ok(service.listDrafts(tokens.authorize(token).creatorSubject()));
    }

    @GetMapping("/drafts/{robotId}")
    public ResponseEntity<ObjectNode> getDraft(@PathVariable String robotId,
            @RequestAttribute(EnterpriseBearerTokenFilter.ACCESS_TOKEN_ATTRIBUTE) String token) {
        return ok(service.getDraft(robotId, tokens.authorize(token).creatorSubject()));
    }

    @PostMapping("/commands")
    public ResponseEntity<ObjectNode> command(@RequestBody ObjectNode command,
            @RequestAttribute(EnterpriseBearerTokenFilter.ACCESS_TOKEN_ATTRIBUTE) String token) {
        return ok(service.executeCreator(command, tokens.authorize(token).creatorSubject()));
    }

    @GetMapping("/published-releases")
    public ResponseEntity<ObjectNode> published(
            @RequestAttribute(EnterpriseBearerTokenFilter.ACCESS_TOKEN_ATTRIBUTE) String token) {
        tokens.authorize(token);
        return ok(service.listPublishedReleases());
    }

    private static ResponseEntity<ObjectNode> ok(ObjectNode body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }
}
