package com.robothree.central.modelgateway.application;

import com.robothree.central.modelgateway.domain.ModelEndpointBinding;
import com.robothree.central.modelgateway.domain.PromptCacheProfile;
import com.robothree.central.modelgateway.port.PromptCacheProfileResolver;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/** Frozen process-start registry. It has no mutable Admin or runtime activation surface. */
public final class VersionedPromptCacheProfileRegistry
        implements PromptCacheProfileResolver {

    private final Map<Key, PromptCacheProfile> profiles;

    public VersionedPromptCacheProfileRegistry(List<PromptCacheProfile> profiles) {
        Map<Key, PromptCacheProfile> indexed = new HashMap<>();
        for (PromptCacheProfile profile : List.copyOf(profiles)) {
            PromptCacheProfile existing = indexed.putIfAbsent(
                    new Key(profile.profileId(), profile.profileRevision()),
                    profile);
            if (existing != null) {
                throw new IllegalArgumentException("duplicate prompt cache profile revision");
            }
        }
        this.profiles = Map.copyOf(indexed);
    }

    @Override
    public PromptCacheProfile resolveForNewPlan(ModelEndpointBinding binding) {
        Objects.requireNonNull(binding, "binding");
        List<PromptCacheProfile> matches = profiles.values().stream()
                .filter(profile -> profile.profileRevision()
                        .equals(binding.capabilityProfileRevision()))
                .toList();
        if (matches.size() != 1) {
            throw ModelGatewayException.unavailable(
                    "model_gateway.cache_profile_missing",
                    "The exact prompt cache profile is unavailable.");
        }
        PromptCacheProfile profile = matches.getFirst();
        if (!profile.supports(binding)) {
            throw ModelGatewayException.validation(
                    "model_gateway.cache_profile_binding_mismatch",
                    "The prompt cache profile does not match the exact binding.");
        }
        if (profile.status() == PromptCacheProfile.Status.RETIRED) {
            throw ModelGatewayException.unavailable(
                    "model_gateway.cache_profile_retired",
                    "A retired prompt cache profile cannot create a new plan.");
        }
        return profile;
    }

    @Override
    public PromptCacheProfile resolveForRecovery(
            String profileId,
            String profileRevision,
            String profileDigest) {
        PromptCacheProfile profile = profiles.get(new Key(profileId, profileRevision));
        if (profile == null || !profile.profileDigest().equals(profileDigest)) {
            throw ModelGatewayException.unavailable(
                    "model_gateway.cache_profile_recovery_mismatch",
                    "The exact prompt cache profile cannot be restored.");
        }
        return profile;
    }

    private record Key(String id, String revision) {}
}
