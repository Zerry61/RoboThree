package com.robothree.central.configuration.application;

import com.robothree.central.configuration.domain.ImmutableConfigurationSnapshot;
import com.robothree.central.configuration.domain.ImmutablePackageDocument;
import com.robothree.central.configuration.port.ConfigurationSnapshotRepository;
import com.robothree.central.configuration.port.PackageDocumentRepository;
import com.robothree.central.persistence.port.CentralTransactionRunner;
import java.util.List;
import java.util.Objects;

public final class TrustedConfigurationSeeder {

    private final PackageDocumentRepository packages;
    private final ConfigurationSnapshotRepository snapshots;
    private final CentralTransactionRunner transactions;
    private final ConfigurationIntegrityVerifier integrityVerifier;

    public TrustedConfigurationSeeder(
            PackageDocumentRepository packages,
            ConfigurationSnapshotRepository snapshots,
            CentralTransactionRunner transactions,
            ConfigurationIntegrityVerifier integrityVerifier) {
        this.packages = Objects.requireNonNull(packages, "packages");
        this.snapshots = Objects.requireNonNull(snapshots, "snapshots");
        this.transactions = Objects.requireNonNull(transactions, "transactions");
        this.integrityVerifier =
                Objects.requireNonNull(integrityVerifier, "integrityVerifier");
    }

    public ImmutableConfigurationSnapshot seed(
            List<ImmutablePackageDocument> documents,
            ImmutableConfigurationSnapshot snapshot) {
        List<ImmutablePackageDocument> immutableDocuments = List.copyOf(documents);
        Objects.requireNonNull(snapshot, "snapshot");
        return transactions.required(() -> {
            immutableDocuments.forEach(document -> {
                integrityVerifier.verifyPackage(document);
                packages.insert(document);
            });
            integrityVerifier.verifySnapshot(snapshot);
            return snapshots.insert(snapshot);
        });
    }
}
