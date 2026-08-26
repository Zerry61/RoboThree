package com.robothree.central.cluster;

import com.robothree.central.cluster.ClusterHarnessApplicationService.NodeInfo;
import com.robothree.central.cluster.ClusterHarnessApplicationService.PermissionCommand;
import com.robothree.central.cluster.ClusterHarnessApplicationService.PermissionLookup;
import com.robothree.central.cluster.ClusterHarnessApplicationService.PermissionResult;
import com.robothree.central.cluster.ClusterHarnessApplicationService.ReadinessInfo;
import com.robothree.central.cluster.ClusterHarnessApplicationService.ResourceInfo;
import lombok.NonNull;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Profile;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile("cluster-harness")
@RequestMapping(
        path = "/cluster-harness",
        produces = MediaType.APPLICATION_JSON_VALUE)
@RequiredArgsConstructor
final class ClusterHarnessControlController {

    @NonNull
    private final ClusterHarnessApplicationService application;

    @GetMapping("/node")
    ResponseEntity<NodeInfo> node() {
        return ResponseEntity.ok(application.nodeInfo());
    }

    @PostMapping(
            path = "/permissions",
            consumes = MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<PermissionResult> savePermission(
            @RequestBody PermissionCommand command) {
        return ResponseEntity.ok(application.savePermission(command));
    }

    @GetMapping("/permissions")
    ResponseEntity<PermissionLookup> findPermission(
            @RequestParam String permission) {
        return ResponseEntity.ok(application.findPermission(permission));
    }

    @PostMapping(
            path = "/failures/permission-before-commit",
            consumes = MediaType.APPLICATION_JSON_VALUE)
    void haltBeforePermissionCommit(@RequestBody PermissionCommand command) {
        application.haltBeforePermissionCommit(command);
    }

    @PostMapping(
            path = "/failures/permission-after-commit",
            consumes = MediaType.APPLICATION_JSON_VALUE)
    void haltAfterPermissionCommit(@RequestBody PermissionCommand command) {
        application.haltAfterPermissionCommit(command);
    }

    @GetMapping("/readiness")
    ResponseEntity<ReadinessInfo> readiness() {
        return ResponseEntity.ok(application.readiness());
    }

    @GetMapping("/resources")
    ResponseEntity<ResourceInfo> resources() {
        return ResponseEntity.ok(application.resources());
    }
}
