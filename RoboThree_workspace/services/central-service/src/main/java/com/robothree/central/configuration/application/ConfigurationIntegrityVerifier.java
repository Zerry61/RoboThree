package com.robothree.central.configuration.application;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.authentication.application.EnterpriseAuthenticationException;
import com.robothree.central.configuration.domain.ExactPackageReadReference;
import com.robothree.central.configuration.domain.ImmutableConfigurationSnapshot;
import com.robothree.central.configuration.domain.ImmutablePackageDocument;
import com.robothree.central.configuration.port.PackageDocumentRepository;
import com.robothree.central.shared.json.CanonicalJson;
import java.nio.charset.StandardCharsets;
import java.util.Objects;
import java.util.Optional;

public final class ConfigurationIntegrityVerifier {

    private static final int MAXIMUM_SNAPSHOT_BYTES = 2 * 1024 * 1024;
    private static final int MAXIMUM_PACKAGE_BYTES = 4 * 1024 * 1024;

    private final PackageDocumentRepository packages;

    public ConfigurationIntegrityVerifier(PackageDocumentRepository packages) {
        this.packages = Objects.requireNonNull(packages, "packages");
    }

    public void verifySnapshot(ImmutableConfigurationSnapshot snapshot) {
        ObjectNode document = parse(
                snapshot.documentJson(),
                MAXIMUM_SNAPSHOT_BYTES,
                "configuration snapshot");
        requireText(document, "contractVersion", "v1alpha1");
        requireText(document, "snapshotId", snapshot.snapshotId());
        requireText(document, "revision", snapshot.revision());
        requireText(document, "schemaVersion", snapshot.schemaVersion());
        requireText(document, "digest", snapshot.digest());

        String computedDigest = CanonicalJson.digestExcluding(document, "digest");
        if (!computedDigest.equals(snapshot.digest())
                || !quotedEtag(snapshot.digest()).equals(snapshot.etag())) {
            throw integrityFailure();
        }
        verifyReferences(document.path("agents"), "agent");
        verifyReferences(document.path("skills"), "skill");
    }

    public void verifyPackage(ImmutablePackageDocument packageDocument) {
        ObjectNode document = parse(
                packageDocument.documentJson(),
                MAXIMUM_PACKAGE_BYTES,
                "package document");
        requireText(document, "packageId", packageDocument.packageId());
        requireText(document, "kind", packageDocument.kind());
        requireText(document, "revision", packageDocument.revision());
        requireText(document, "packageDigest", packageDocument.digest());
        if (!CanonicalJson.digestExcluding(document, "packageDigest")
                .equals(packageDocument.digest())) {
            throw integrityFailure();
        }
        JsonNode files = document.path("files");
        if (!files.isArray() || files.size() > 256) {
            throw integrityFailure();
        }
        for (JsonNode file : files) {
            JsonNode content = file.get("utf8Content");
            JsonNode digest = file.get("contentDigest");
            if (content == null
                    || !content.isTextual()
                    || content.textValue().getBytes(StandardCharsets.UTF_8).length > 524_288
                    || digest == null
                    || !digest.isTextual()
                    || !CanonicalJson.sha256(content.textValue()).equals(digest.textValue())) {
                throw integrityFailure();
            }
        }
    }

    public Optional<ImmutablePackageDocument> findExactReferencedPackage(
            ImmutableConfigurationSnapshot snapshot,
            ExactPackageReadReference reference) {
        verifySnapshot(snapshot);
        ObjectNode document = parse(
                snapshot.documentJson(),
                MAXIMUM_SNAPSHOT_BYTES,
                "configuration snapshot");
        JsonNode references = document.path(
                "agent".equals(reference.kind()) ? "agents" : "skills");
        for (JsonNode candidate : references) {
            if (reference.packageId().equals(candidate.path("packageId").asText())
                    && reference.kind().equals(candidate.path("kind").asText())
                    && reference.packageRevision().equals(
                            candidate.path("revision").asText())
                    && reference.packageDigest().equals(
                            candidate.path("digest").asText())) {
                ImmutablePackageDocument packageDocument = packages
                        .findPackage(reference.packageId(), reference.packageRevision())
                        .orElseThrow(ConfigurationIntegrityVerifier::integrityFailure);
                verifyPackage(packageDocument);
                return Optional.of(packageDocument);
            }
        }
        return Optional.empty();
    }

    public static String quotedEtag(String digest) {
        return "\"" + digest + "\"";
    }

    private void verifyReferences(JsonNode references, String expectedKind) {
        if (!references.isArray()) {
            throw integrityFailure();
        }
        for (JsonNode reference : references) {
            String packageId = requiredText(reference, "packageId");
            String kind = requiredText(reference, "kind");
            String revision = requiredText(reference, "revision");
            String digest = requiredText(reference, "digest");
            if (!expectedKind.equals(kind)) {
                throw integrityFailure();
            }
            ImmutablePackageDocument packageDocument =
                    packages.findPackage(packageId, revision).orElseThrow(
                            ConfigurationIntegrityVerifier::integrityFailure);
            if (!kind.equals(packageDocument.kind())
                    || !digest.equals(packageDocument.digest())) {
                throw integrityFailure();
            }
            verifyPackage(packageDocument);
        }
    }

    private static ObjectNode parse(String json, int maximumBytes, String label) {
        try {
            return CanonicalJson.parseObject(json, maximumBytes);
        } catch (IllegalArgumentException exception) {
            throw EnterpriseAuthenticationException.internal(
                    "configuration_integrity_failed",
                    "The stored " + label + " failed integrity verification.");
        }
    }

    private static void requireText(ObjectNode document, String name, String expected) {
        if (!expected.equals(requiredText(document, name))) {
            throw integrityFailure();
        }
    }

    private static String requiredText(JsonNode document, String name) {
        JsonNode value = document.get(name);
        if (value == null || !value.isTextual()) {
            throw integrityFailure();
        }
        return value.textValue();
    }

    private static EnterpriseAuthenticationException integrityFailure() {
        return EnterpriseAuthenticationException.internal(
                "configuration_integrity_failed",
                "Stored enterprise configuration failed integrity verification.");
    }
}
