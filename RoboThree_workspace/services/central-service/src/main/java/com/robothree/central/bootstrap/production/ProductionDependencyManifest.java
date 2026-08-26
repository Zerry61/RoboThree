package com.robothree.central.bootstrap.production;

import com.robothree.central.authentication.port.AccessTokenIssuanceRepository;
import com.robothree.central.authentication.port.CompatibilityEvaluator;
import com.robothree.central.authentication.port.DeviceChallengeRepository;
import com.robothree.central.authentication.port.DeviceEnrollmentGrantRepository;
import com.robothree.central.authentication.port.DeviceProofVerifier;
import com.robothree.central.authentication.port.EnterpriseDeviceRepository;
import com.robothree.central.authentication.port.EnterpriseDeviceTrustProvider;
import com.robothree.central.authentication.port.EnterprisePermissionRepository;
import com.robothree.central.authentication.port.EnterpriseUserIdentityVerifier;
import com.robothree.central.authentication.port.RoboThreeAccessTokenCodec;
import com.robothree.central.authentication.port.VerifiedIdentityRepository;
import com.robothree.central.configuration.port.ConfigurationSnapshotRepository;
import com.robothree.central.configuration.port.PackageDocumentRepository;
import com.robothree.central.credentials.port.EnterpriseSecretStore;
import com.robothree.central.modelgateway.port.ModelInvocationAuditOutboxRepository;
import com.robothree.central.modelgateway.port.ModelInvocationEventRepository;
import com.robothree.central.modelgateway.port.ModelInvocationRecoveryLeaseRepository;
import com.robothree.central.modelgateway.port.ModelInvocationRepository;
import com.robothree.central.persistence.mybatis.adapter.MyBatisAuthenticationPersistence;
import com.robothree.central.persistence.mybatis.adapter.MyBatisConfigurationPersistence;
import com.robothree.central.persistence.mybatis.adapter.MyBatisModelInvocationPersistence;
import com.robothree.central.persistence.mybatis.schema.CentralSchemaPreflight;
import com.robothree.central.persistence.mybatis.schema.SchemaInspectionMapper;
import com.robothree.central.persistence.mybatis.transaction.SpringCentralTransactionRunner;
import com.robothree.central.persistence.port.CentralTransactionRunner;
import java.util.List;
import javax.sql.DataSource;
import org.springframework.transaction.PlatformTransactionManager;

public final class ProductionDependencyManifest {

    public static final String VERSION = "v1";

    private final List<Requirement> requirements;

    public ProductionDependencyManifest() {
        this(List.of(
                required("database.data-source", DataSource.class),
                required("database.transaction-manager", PlatformTransactionManager.class),
                required(
                        "database.spring-transaction-runner",
                        SpringCentralTransactionRunner.class),
                required("database.transaction-runner", CentralTransactionRunner.class),
                required("database.schema-mapper", SchemaInspectionMapper.class),
                required("database.schema-preflight", CentralSchemaPreflight.class),
                required(
                        "persistence.authentication",
                        MyBatisAuthenticationPersistence.class),
                required(
                        "persistence.configuration",
                        MyBatisConfigurationPersistence.class),
                required(
                        "persistence.model-invocation",
                        MyBatisModelInvocationPersistence.class),
                required("identity.verifier", EnterpriseUserIdentityVerifier.class),
                required("device.trust", EnterpriseDeviceTrustProvider.class),
                required("device.proof", DeviceProofVerifier.class),
                required("credential.enterprise-secret-store", EnterpriseSecretStore.class),
                required("token.codec", RoboThreeAccessTokenCodec.class),
                required("compatibility.evaluator", CompatibilityEvaluator.class),
                required("repository.identity", VerifiedIdentityRepository.class),
                required("repository.permission", EnterprisePermissionRepository.class),
                required("repository.device", EnterpriseDeviceRepository.class),
                required(
                        "repository.device-enrollment",
                        DeviceEnrollmentGrantRepository.class),
                required("repository.device-challenge", DeviceChallengeRepository.class),
                required(
                        "repository.token-issuance",
                        AccessTokenIssuanceRepository.class),
                required(
                        "repository.configuration",
                        ConfigurationSnapshotRepository.class),
                required("repository.package", PackageDocumentRepository.class),
                required(
                        "repository.model-invocation",
                        ModelInvocationRepository.class),
                required(
                        "repository.model-invocation-event",
                        ModelInvocationEventRepository.class),
                required(
                        "repository.model-invocation-lease",
                        ModelInvocationRecoveryLeaseRepository.class),
                required(
                        "repository.model-invocation-audit-outbox",
                        ModelInvocationAuditOutboxRepository.class)));
    }

    ProductionDependencyManifest(List<Requirement> requirements) {
        this.requirements = List.copyOf(requirements);
    }

    public List<Requirement> requirements() {
        return requirements;
    }

    private static Requirement required(String id, Class<?> type) {
        return new Requirement(id, type);
    }

    public record Requirement(String id, Class<?> type) {}
}
