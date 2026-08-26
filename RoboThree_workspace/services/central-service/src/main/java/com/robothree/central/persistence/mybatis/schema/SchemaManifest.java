package com.robothree.central.persistence.mybatis.schema;

import java.util.List;
import java.util.Objects;

public record SchemaManifest(
        List<String> applyOrder,
        String database,
        String manifestVersion,
        String releaseVersion,
        List<Script> scripts,
        List<String> supportedEntryPaths,
        int targetSchemaVersion) {

    public SchemaManifest {
        applyOrder = List.copyOf(Objects.requireNonNull(applyOrder, "applyOrder"));
        database = requireText(database, "database");
        manifestVersion = requireText(manifestVersion, "manifestVersion");
        releaseVersion = requireText(releaseVersion, "releaseVersion");
        scripts = List.copyOf(Objects.requireNonNull(scripts, "scripts"));
        supportedEntryPaths =
                List.copyOf(Objects.requireNonNull(supportedEntryPaths, "supportedEntryPaths"));
        if (targetSchemaVersion <= 0) {
            throw new IllegalArgumentException("targetSchemaVersion must be positive");
        }
    }

    public Script scriptForEntryPath(String entryPath) {
        return scripts.stream()
                .filter(script -> script.entryPath().equals(entryPath))
                .findFirst()
                .orElseThrow(() ->
                        new IllegalArgumentException("unsupported schema entry path"));
    }

    public Script scriptForName(String scriptName) {
        return scripts.stream()
                .filter(script -> script.scriptName().equals(scriptName))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("unknown schema script"));
    }

    public record Script(String entryPath, String scriptDigest, String scriptName) {

        public Script {
            entryPath = requireText(entryPath, "entryPath");
            scriptName = requireText(scriptName, "scriptName");
            scriptDigest = requireDigest(scriptDigest);
        }
    }

    private static String requireText(String value, String name) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(name + " is required");
        }
        return value;
    }

    private static String requireDigest(String value) {
        if (value == null || !value.matches("^[a-f0-9]{64}$")) {
            throw new IllegalArgumentException("scriptDigest must be lowercase SHA-256");
        }
        return value;
    }
}
