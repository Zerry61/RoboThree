package com.robothree.central.configuration.application;

import com.robothree.central.authentication.application.EnterpriseAuthenticationException;
import com.robothree.central.authentication.application.EnterpriseBearerAuthorization;
import com.robothree.central.authentication.port.EnterpriseBearerAuthorizer;
import com.robothree.central.configuration.domain.ExactPackageReadReference;
import com.robothree.central.configuration.domain.ImmutableConfigurationSnapshot;
import com.robothree.central.configuration.domain.ImmutablePackageDocument;
import com.robothree.central.configuration.port.ConfigurationSnapshotRepository;
import java.time.Clock;
import java.util.Objects;

public final class ConfigurationReadService {

    private final EnterpriseBearerAuthorizer bearerAuthorizer;
    private final ConfigurationSnapshotRepository snapshots;
    private final ConfigurationIntegrityVerifier integrityVerifier;
    private final Clock clock;

    public ConfigurationReadService(
            EnterpriseBearerAuthorizer bearerAuthorizer,
            ConfigurationSnapshotRepository snapshots,
            ConfigurationIntegrityVerifier integrityVerifier,
            Clock clock) {
        this.bearerAuthorizer = Objects.requireNonNull(bearerAuthorizer, "bearerAuthorizer");
        this.snapshots = Objects.requireNonNull(snapshots, "snapshots");
        this.integrityVerifier = Objects.requireNonNull(integrityVerifier, "integrityVerifier");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    public ConfigurationReadResult read(String compactToken, String ifNoneMatch) {
        authorize(compactToken);
        ImmutableConfigurationSnapshot snapshot = snapshots.findActive()
                .orElseThrow(() -> EnterpriseAuthenticationException.service(
                        "configuration_unavailable",
                        true,
                        "Enterprise configuration is currently unavailable."));
        integrityVerifier.verifySnapshot(snapshot);
        if (snapshot.etag().equals(ifNoneMatch)) {
            return new ConfigurationReadResult(true, null, snapshot.etag());
        }
        return new ConfigurationReadResult(false, snapshot.documentJson(), snapshot.etag());
    }

    public PackageReadResult readPackage(
            String compactToken,
            ExactPackageReadReference reference,
            String ifNoneMatch) {
        authorize(compactToken);
        ImmutableConfigurationSnapshot snapshot = snapshots
                .findSnapshot(reference.snapshotId(), reference.snapshotRevision())
                .orElseThrow(ConfigurationReadService::packageReferenceDenied);
        if (!snapshot.digest().equals(reference.snapshotDigest())) {
            throw packageReferenceDenied();
        }
        ImmutablePackageDocument packageDocument = integrityVerifier
                .findExactReferencedPackage(snapshot, reference)
                .orElseThrow(ConfigurationReadService::packageReferenceDenied);
        String etag = ConfigurationIntegrityVerifier.quotedEtag(
                packageDocument.digest());
        if (etag.equals(ifNoneMatch)) {
            return new PackageReadResult(true, null, etag);
        }
        return new PackageReadResult(false, packageDocument.documentJson(), etag);
    }

    public record ConfigurationReadResult(
            boolean notModified,
            String documentJson,
            String etag) {}

    public record PackageReadResult(
            boolean notModified,
            String documentJson,
            String etag) {}

    private static EnterpriseAuthenticationException packageReferenceDenied() {
        return EnterpriseAuthenticationException.authorization(
                "package_reference_denied",
                "The exact package reference is not available for this configuration.");
    }

    private void authorize(String compactToken) {
        EnterpriseBearerAuthorization.requirePrincipal(
                bearerAuthorizer.authorize(
                        compactToken, "configuration.read", clock.instant()),
                "configuration.read");
    }
}
