package com.robothree.central.cluster;

import com.robothree.central.authentication.application.AuthenticationCrypto;
import com.robothree.central.authentication.domain.EnterpriseDevice;
import com.robothree.central.authentication.domain.EnterpriseUserPermission;
import com.robothree.central.authentication.domain.VerifiedEnterpriseIdentity;
import com.robothree.central.authentication.port.EnterpriseDeviceRepository;
import com.robothree.central.authentication.port.EnterprisePermissionRepository;
import com.robothree.central.authentication.port.VerifiedIdentityRepository;
import com.robothree.central.bootstrap.production.CentralProductionReadinessVerifier;
import com.robothree.central.bootstrap.production.CentralProductionStartupException;
import com.robothree.central.configuration.application.TrustedConfigurationSeeder;
import com.robothree.central.persistence.port.CentralTransactionRunner;
import com.robothree.central.support.CanonicalConfigurationFixtures;
import com.zaxxer.hikari.HikariDataSource;
import java.lang.management.ManagementFactory;
import java.time.Instant;
import java.util.Base64;

final class ClusterHarnessApplicationService {

    private final String nodeId;
    private final VerifiedIdentityRepository identities;
    private final EnterpriseDeviceRepository devices;
    private final EnterprisePermissionRepository permissions;
    private final CentralTransactionRunner transactions;
    private final TrustedConfigurationSeeder configurationSeeder;
    private final CentralProductionReadinessVerifier readinessVerifier;
    private final HikariDataSource dataSource;

    ClusterHarnessApplicationService(
            String nodeId,
            VerifiedIdentityRepository identities,
            EnterpriseDeviceRepository devices,
            EnterprisePermissionRepository permissions,
            CentralTransactionRunner transactions,
            TrustedConfigurationSeeder configurationSeeder,
            CentralProductionReadinessVerifier readinessVerifier,
            HikariDataSource dataSource) {
        this.nodeId = nodeId;
        this.identities = identities;
        this.devices = devices;
        this.permissions = permissions;
        this.transactions = transactions;
        this.configurationSeeder = configurationSeeder;
        this.readinessVerifier = readinessVerifier;
        this.dataSource = dataSource;
    }

    void seed(
            Instant seedInstant,
            String deviceKeyId,
            String publicKeyEncoded) {
        String publicKeyDigest = AuthenticationCrypto.sha256(
                Base64.getDecoder().decode(publicKeyEncoded));
        transactions.required(() -> {
            identities.insert(new VerifiedEnterpriseIdentity(
                    ClusterHarnessFacts.VERIFIED_IDENTITY_ID,
                    ClusterHarnessFacts.ENTERPRISE_ID,
                    ClusterHarnessFacts.USER_ID,
                    "cluster-harness",
                    "a".repeat(64),
                    "b".repeat(64),
                    seedInstant,
                    seedInstant.plusSeconds(86_400),
                    null));
            devices.insert(new EnterpriseDevice(
                    ClusterHarnessFacts.DEVICE_ID,
                    ClusterHarnessFacts.ENTERPRISE_ID,
                    deviceKeyId,
                    "spki_der_base64",
                    publicKeyEncoded,
                    publicKeyDigest,
                    "ES256",
                    "cluster-harness",
                    "managed",
                    "compliant",
                    1,
                    seedInstant,
                    null,
                    null));
            permissions.save(new EnterpriseUserPermission(
                    ClusterHarnessFacts.ENTERPRISE_ID,
                    ClusterHarnessFacts.USER_ID,
                    ClusterHarnessFacts.CONFIGURATION_PERMISSION,
                    true,
                    1,
                    seedInstant));
            return null;
        });
        var seed = CanonicalConfigurationFixtures.validSeed(seedInstant);
        configurationSeeder.seed(seed.packages(), seed.snapshot());
    }

    PermissionResult savePermission(PermissionCommand command) {
        EnterpriseUserPermission result =
                transactions.required(() -> permissions.save(toPermission(command)));
        return toResult(result);
    }

    PermissionLookup findPermission(String permission) {
        return permissions
                .find(
                        ClusterHarnessFacts.ENTERPRISE_ID,
                        ClusterHarnessFacts.USER_ID,
                        permission)
                .map(value -> new PermissionLookup(true, toResult(value)))
                .orElseGet(() -> new PermissionLookup(false, null));
    }

    void haltBeforePermissionCommit(PermissionCommand command) {
        transactions.required(() -> {
            permissions.save(toPermission(command));
            Runtime.getRuntime().halt(73);
            return null;
        });
    }

    void haltAfterPermissionCommit(PermissionCommand command) {
        savePermission(command);
        Runtime.getRuntime().halt(74);
    }

    ReadinessInfo readiness() {
        try {
            readinessVerifier.validate();
            return new ReadinessInfo("ready", null);
        } catch (CentralProductionStartupException exception) {
            return new ReadinessInfo("down", exception.code());
        }
    }

    ResourceInfo resources() {
        var pool = dataSource.getHikariPoolMXBean();
        int activeConnections = pool == null ? 0 : pool.getActiveConnections();
        int idleConnections = pool == null ? 0 : pool.getIdleConnections();
        int totalConnections = pool == null ? 0 : pool.getTotalConnections();
        int awaitingConnections = pool == null ? 0 : pool.getThreadsAwaitingConnection();
        long timerThreadCount = Thread.getAllStackTraces().keySet().stream()
                .filter(Thread::isAlive)
                .map(Thread::getName)
                .filter(name -> name.contains("Timer")
                        || name.contains("Scheduler")
                        || name.contains("scheduler"))
                .count();
        return new ResourceInfo(
                nodeId,
                dataSource.getPoolName(),
                activeConnections,
                idleConnections,
                totalConnections,
                awaitingConnections,
                ManagementFactory.getThreadMXBean().getThreadCount(),
                timerThreadCount);
    }

    private static EnterpriseUserPermission toPermission(PermissionCommand command) {
        return new EnterpriseUserPermission(
                command.enterpriseId(),
                command.userId(),
                command.permission(),
                command.enabled(),
                command.revision(),
                command.updatedAt());
    }

    private static PermissionResult toResult(EnterpriseUserPermission result) {
        return new PermissionResult(
                result.enterpriseId(),
                result.userId(),
                result.permission(),
                result.enabled(),
                result.revision(),
                result.updatedAt());
    }

    NodeInfo nodeInfo() {
        return new NodeInfo(nodeId, ProcessHandle.current().pid());
    }

    record PermissionCommand(
            String enterpriseId,
            String userId,
            String permission,
            boolean enabled,
            long revision,
            Instant updatedAt) {}

    record PermissionResult(
            String enterpriseId,
            String userId,
            String permission,
            boolean enabled,
            long revision,
            Instant updatedAt) {}

    record PermissionLookup(boolean present, PermissionResult value) {}

    record ReadinessInfo(String status, String errorCode) {}

    record ResourceInfo(
            String nodeId,
            String poolName,
            int activeConnections,
            int idleConnections,
            int totalConnections,
            int awaitingConnections,
            int liveThreadCount,
            long timerThreadCount) {}

    record NodeInfo(String nodeId, long processId) {}
}
