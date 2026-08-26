package com.robothree.central.support;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.configuration.application.ConfigurationIntegrityVerifier;
import com.robothree.central.configuration.domain.ImmutableConfigurationSnapshot;
import com.robothree.central.configuration.domain.ImmutablePackageDocument;
import com.robothree.central.shared.json.CanonicalJson;
import java.time.Instant;
import java.util.List;

public final class CanonicalConfigurationFixtures {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String PACKAGE_REVISION = "a".repeat(64);
    private static final String SNAPSHOT_REVISION = "b".repeat(64);

    private CanonicalConfigurationFixtures() {}

    public static Seed validSeed(Instant now) {
        String content = "# Alpha Skill\n\nTest only.";
        ObjectNode packageJson = JSON.createObjectNode();
        packageJson.put("packageId", "skill.package-alpha");
        packageJson.put("kind", "skill");
        packageJson.put("revision", PACKAGE_REVISION);
        packageJson.putObject("manifest")
                .put("name", "Alpha Skill")
                .put("description", "Test-only package");
        ObjectNode file = packageJson.putArray("files").addObject();
        file.put("relativePath", "SKILL.md");
        file.put("mediaType", "text/markdown");
        file.put("utf8Content", content);
        file.put("contentDigest", CanonicalJson.sha256(content));
        packageJson.put("createdAt", now.toString());
        String packageDigest = CanonicalJson.digestExcluding(packageJson, "packageDigest");
        packageJson.put("packageDigest", packageDigest);
        ImmutablePackageDocument packageDocument = new ImmutablePackageDocument(
                "skill.package-alpha",
                "skill",
                PACKAGE_REVISION,
                packageDigest,
                CanonicalJson.canonicalize(packageJson),
                now);

        ObjectNode snapshotJson = JSON.createObjectNode();
        snapshotJson.put("contractVersion", "v1alpha1");
        snapshotJson.put("snapshotId", "configuration.snapshot-alpha");
        snapshotJson.put("revision", SNAPSHOT_REVISION);
        snapshotJson.put("schemaVersion", "v1alpha1");
        snapshotJson.put("minimumDesktopVersion", "0.0.0-dcf.1.0");
        snapshotJson.put("minimumCoreVersion", "0.0.0-dcf.1.0");
        snapshotJson.putArray("models");
        snapshotJson.putArray("tools");
        snapshotJson.putArray("agents");
        ObjectNode skillRef = snapshotJson.putArray("skills").addObject();
        skillRef.put("packageId", packageDocument.packageId());
        skillRef.put("kind", packageDocument.kind());
        skillRef.put("revision", packageDocument.revision());
        skillRef.put("digest", packageDocument.digest());
        snapshotJson.putArray("knowledge");
        ArrayNode fixedPermissions = snapshotJson.putArray("fixedPermissions");
        fixedPermissions.add("configuration.read");
        snapshotJson.putObject("gatewayEndpoints")
                .put("configuration", "enterprise.configuration");
        snapshotJson.put("generatedAt", now.toString());
        String snapshotDigest = CanonicalJson.digestExcluding(snapshotJson, "digest");
        snapshotJson.put("digest", snapshotDigest);
        ImmutableConfigurationSnapshot snapshot = new ImmutableConfigurationSnapshot(
                "configuration.snapshot-alpha",
                SNAPSHOT_REVISION,
                snapshotDigest,
                "v1alpha1",
                CanonicalJson.canonicalize(snapshotJson),
                ConfigurationIntegrityVerifier.quotedEtag(snapshotDigest),
                true,
                now,
                now);
        return new Seed(List.of(packageDocument), snapshot);
    }

    public record Seed(
            List<ImmutablePackageDocument> packages,
            ImmutableConfigurationSnapshot snapshot) {}
}
