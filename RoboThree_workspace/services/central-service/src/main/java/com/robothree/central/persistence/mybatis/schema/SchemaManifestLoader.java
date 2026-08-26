package com.robothree.central.persistence.mybatis.schema;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.robothree.central.persistence.PersistenceIntegrityException;
import com.robothree.central.shared.json.CanonicalJson;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import org.springframework.core.io.ClassPathResource;

public final class SchemaManifestLoader {

    static final String MANIFEST_RESOURCE =
            "robothree-schema/postgresql/manifest/postgresql-v0010.json";
    static final String SIDECAR_RESOURCE = MANIFEST_RESOURCE + ".sha256";
    private static final String MANIFEST_FILE_NAME = "postgresql-v0010.json";
    private static final ObjectMapper JSON = new ObjectMapper()
            .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);

    public SchemaManifest load() {
        try {
            byte[] manifestBytes = readResource(MANIFEST_RESOURCE);
            String sidecar =
                    new String(readResource(SIDECAR_RESOURCE), StandardCharsets.UTF_8);
            String expectedSidecar = sha256(manifestBytes)
                    + "  "
                    + MANIFEST_FILE_NAME
                    + "\n";
            if (!sidecar.equals(expectedSidecar)) {
                throw integrity(
                        "persistence.schema_manifest_mismatch",
                        "schema manifest sidecar does not match");
            }

            String raw = new String(manifestBytes, StandardCharsets.UTF_8);
            String canonical = CanonicalJson.canonicalize(
                            CanonicalJson.parseObject(raw, 64 * 1024))
                    + "\n";
            if (!raw.equals(canonical)) {
                throw integrity(
                        "persistence.schema_manifest_mismatch",
                        "schema manifest is not canonical JSON");
            }

            SchemaManifest manifest = JSON.readValue(manifestBytes, SchemaManifest.class);
            validateSemantics(manifest);
            return manifest;
        } catch (PersistenceIntegrityException exception) {
            throw exception;
        } catch (IOException | IllegalArgumentException exception) {
            throw new PersistenceIntegrityException(
                    "persistence.schema_manifest_mismatch",
                    "schema manifest could not be loaded",
                    exception);
        }
    }

    private static byte[] readResource(String path) throws IOException {
        try (InputStream stream = new ClassPathResource(path).getInputStream()) {
            return stream.readAllBytes();
        }
    }

    private static void validateSemantics(SchemaManifest manifest) {
        if (!manifest.database().equals("postgresql")
                || !manifest.manifestVersion().equals("v1alpha1")
                || manifest.targetSchemaVersion() != 10
                || !manifest.supportedEntryPaths()
                        .equals(java.util.List.of("fresh", "v0009_upgrade"))
                || manifest.scripts().size() != 2
                || !manifest.applyOrder()
                        .equals(manifest.scripts().stream()
                                .map(SchemaManifest.Script::scriptName)
                                .toList())) {
            throw integrity(
                    "persistence.schema_manifest_mismatch",
                    "schema manifest semantics are unsupported");
        }
        for (String entryPath : manifest.supportedEntryPaths()) {
            manifest.scriptForEntryPath(entryPath);
        }
    }

    static String sha256(byte[] bytes) {
        try {
            return HexFormat.of()
                    .formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private static PersistenceIntegrityException integrity(String code, String message) {
        return new PersistenceIntegrityException(code, message);
    }
}
