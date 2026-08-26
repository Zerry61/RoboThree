package com.robothree.central.modelgateway.recovery;

import com.robothree.central.modelgateway.recovery.HarnessModelInvocationBackend.BackendCommand;
import com.robothree.central.modelgateway.recovery.HarnessModelInvocationBackend.BackendState;
import com.robothree.central.modelgateway.recovery.ModelRecoveryHarnessApplicationService.AcceptRequest;
import com.robothree.central.modelgateway.recovery.ModelRecoveryHarnessApplicationService.CancelCommand;
import com.robothree.central.modelgateway.recovery.ModelRecoveryHarnessApplicationService.InvocationCommand;
import com.robothree.central.modelgateway.recovery.ModelRecoveryHarnessApplicationService.NodeInfo;
import com.robothree.central.modelgateway.recovery.ModelRecoveryHarnessApplicationService.OperationView;
import com.robothree.central.modelgateway.recovery.ModelRecoveryHarnessApplicationService.ResourceInfo;
import lombok.NonNull;
import lombok.RequiredArgsConstructor;
import java.util.UUID;
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
@Profile("model-recovery-harness")
@RequestMapping(path = "/model-recovery-harness")
@RequiredArgsConstructor
final class ModelRecoveryHarnessController {

    @NonNull
    private final ModelRecoveryHarnessApplicationService application;

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
            path = "/backend",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<BackendState> configureBackend(
            @RequestBody BackendCommand command) {
        return ResponseEntity.ok(application.configureBackend(command));
    }

    @PostMapping(
            path = "/backend/release",
            produces = MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<BackendState> releaseBackend() {
        return ResponseEntity.ok(application.releaseBackend());
    }

    @GetMapping(
            path = "/backend",
            produces = MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<BackendState> backendState() {
        return ResponseEntity.ok(application.backendState());
    }

    @GetMapping(
            path = "/resources",
            produces = MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<ResourceInfo> resources() {
        return ResponseEntity.ok(application.resources());
    }
}
