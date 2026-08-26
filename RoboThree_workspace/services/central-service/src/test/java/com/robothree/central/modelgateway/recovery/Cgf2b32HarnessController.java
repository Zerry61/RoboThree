package com.robothree.central.modelgateway.recovery;

import com.robothree.central.modelgateway.recovery.Cgf2b32HarnessApplicationService.AcceptRequest;
import com.robothree.central.modelgateway.recovery.Cgf2b32HarnessApplicationService.CancelCommand;
import com.robothree.central.modelgateway.recovery.Cgf2b32HarnessApplicationService.EphemeralView;
import com.robothree.central.modelgateway.recovery.Cgf2b32HarnessApplicationService.InvocationCommand;
import com.robothree.central.modelgateway.recovery.Cgf2b32HarnessApplicationService.NodeInfo;
import com.robothree.central.modelgateway.recovery.Cgf2b32HarnessApplicationService.OperationView;
import com.robothree.central.modelgateway.recovery.Cgf2b32HarnessApplicationService.ResourceInfo;
import com.robothree.central.modelgateway.recovery.Cgf2b32HarnessApplicationService.SelectionCommand;
import com.robothree.central.modelgateway.recovery.Cgf2b32HarnessApplicationService.SelectionView;
import java.util.UUID;
import lombok.NonNull;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Profile;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile("cgf2b32-harness")
@RequestMapping(path = "/cgf2b32-harness")
@RequiredArgsConstructor
final class Cgf2b32HarnessController {

    @NonNull
    private final Cgf2b32HarnessApplicationService application;

    @GetMapping(path = "/node", produces = MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<NodeInfo> node() {
        return ResponseEntity.ok(application.nodeInfo());
    }

    @PostMapping(
            path = "/accept",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<OperationView> accept(@RequestBody AcceptRequest request) {
        return ResponseEntity.ok(application.accept(request));
    }

    @PostMapping(
            path = "/execute",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<OperationView> execute(@RequestBody InvocationCommand command) {
        return ResponseEntity.ok(application.execute(command));
    }

    @PostMapping(
            path = "/recover",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<OperationView> recover(@RequestBody InvocationCommand command) {
        return ResponseEntity.ok(application.recover(command));
    }

    @PostMapping(
            path = "/cancel",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<OperationView> cancel(@RequestBody CancelCommand command) {
        return ResponseEntity.ok(application.cancel(command));
    }

    @GetMapping(path = "/status", produces = MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<OperationView> status(@RequestParam UUID invocationId) {
        return ResponseEntity.ok(application.status(invocationId));
    }

    @GetMapping(path = "/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    ResponseEntity<String> events(
            @RequestParam UUID invocationId,
            @RequestParam long afterSequence) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .contentType(MediaType.TEXT_EVENT_STREAM)
                .body(application.durableSse(invocationId, afterSequence));
    }

    @PostMapping(
            path = "/selection",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<SelectionView> select(@RequestBody SelectionCommand command) {
        return ResponseEntity.ok(application.select(command));
    }

    @PostMapping(
            path = "/failpoint",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<Cgf2b32FailpointBackend.State> configureFailpoint(
            @RequestBody Cgf2b32FailpointBackend.Command command) {
        return ResponseEntity.ok(application.configureFailpoint(command));
    }

    @PostMapping(
            path = "/failpoint/release",
            produces = MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<Cgf2b32FailpointBackend.State> releaseFailpoint(
            @RequestParam UUID sessionId) {
        return ResponseEntity.ok(application.releaseFailpoint(sessionId));
    }

    @GetMapping(
            path = "/failpoint/await-blocked",
            produces = MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<Cgf2b32FailpointBackend.State> awaitFailpointBlocked(
            @RequestParam UUID sessionId) {
        return ResponseEntity.ok(application.awaitFailpointBlocked(sessionId));
    }

    @GetMapping(
            path = "/failpoint",
            produces = MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<Cgf2b32FailpointBackend.State> failpointState() {
        return ResponseEntity.ok(application.failpointState());
    }

    @GetMapping(
            path = "/ephemeral",
            produces = MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<EphemeralView> ephemeral(@RequestParam UUID invocationId) {
        return ResponseEntity.ok(application.ephemeral(invocationId));
    }

    @GetMapping(
            path = "/resources",
            produces = MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<ResourceInfo> resources() {
        return ResponseEntity.ok(application.resources());
    }
}
