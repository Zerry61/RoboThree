package com.robothree.central.modelgateway.application;

import com.robothree.central.modelgateway.port.EnterpriseReasoningMappingSource;
import java.util.List;
import java.util.Map;

/** Exact-only registry. It intentionally has no current/latest/alias lookup. */
public final class ReleasePinnedEnterpriseReasoningMappingSource
        implements EnterpriseReasoningMappingSource {
    private final Map<String, EnterpriseReasoningMappingRelease> releases;

    public ReleasePinnedEnterpriseReasoningMappingSource(
            List<EnterpriseReasoningMappingRelease> releases) {
        var builder = new java.util.HashMap<String, EnterpriseReasoningMappingRelease>();
        for (var release : List.copyOf(releases)) {
            String key = key(release.mappingRevision(), release.mappingDigest());
            if (builder.putIfAbsent(key, release) != null) {
                throw new IllegalArgumentException("duplicate enterprise reasoning mapping identity");
            }
        }
        this.releases = Map.copyOf(builder);
    }

    @Override
    public List<EnterpriseReasoningMappingRelease> loadExact(
            String mappingRevision,
            String mappingDigest) {
        var release = releases.get(key(mappingRevision, mappingDigest));
        return release == null ? List.of() : List.of(release);
    }

    private static String key(String revision, String digest) {
        return revision + "\u0000" + digest;
    }
}

