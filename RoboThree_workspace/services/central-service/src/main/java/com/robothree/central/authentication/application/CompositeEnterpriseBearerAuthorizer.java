package com.robothree.central.authentication.application;

import com.robothree.central.authentication.domain.EnterpriseBearerAuthorizationResult;
import com.robothree.central.authentication.port.EnterpriseBearerAuthorizer;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/** Evaluates every installed claims profile without inspecting an unverified token payload. */
public final class CompositeEnterpriseBearerAuthorizer implements EnterpriseBearerAuthorizer {

    private final List<EnterpriseBearerAuthorizer> branches;

    public CompositeEnterpriseBearerAuthorizer(List<EnterpriseBearerAuthorizer> branches) {
        this.branches = List.copyOf(Objects.requireNonNull(branches, "branches"));
        if (this.branches.isEmpty() || this.branches.size() > 2) {
            throw new IllegalArgumentException("one or two bearer branches are required");
        }
        if (this.branches.stream().anyMatch(branch -> branch == this)) {
            throw new IllegalArgumentException("composite cannot contain itself");
        }
    }

    @Override
    public EnterpriseBearerAuthorizationResult authorize(
            String compactToken,
            String requiredPermission,
            Instant now) {
        Objects.requireNonNull(requiredPermission, "requiredPermission");
        Objects.requireNonNull(now, "now");
        List<EnterpriseBearerAuthorizationResult> results = new ArrayList<>(branches.size());
        for (EnterpriseBearerAuthorizer branch : branches) {
            try {
                results.add(Objects.requireNonNull(
                        branch.authorize(compactToken, requiredPermission, now),
                        "branch result"));
            } catch (RuntimeException exception) {
                results.add(new EnterpriseBearerAuthorizationResult.Unavailable(
                        "enterprise_bearer_authorization_unavailable"));
            }
        }

        List<EnterpriseBearerAuthorizationResult.Unavailable> unavailable = results.stream()
                .filter(EnterpriseBearerAuthorizationResult.Unavailable.class::isInstance)
                .map(EnterpriseBearerAuthorizationResult.Unavailable.class::cast)
                .toList();
        if (!unavailable.isEmpty()) {
            String code = unavailable.stream()
                    .map(EnterpriseBearerAuthorizationResult.Unavailable::typedSafeCode)
                    .distinct()
                    .count() == 1
                            ? unavailable.getFirst().typedSafeCode()
                            : "enterprise_bearer_authorization_unavailable";
            return new EnterpriseBearerAuthorizationResult.Unavailable(code);
        }

        List<EnterpriseBearerAuthorizationResult.Success> successes = results.stream()
                .filter(EnterpriseBearerAuthorizationResult.Success.class::isInstance)
                .map(EnterpriseBearerAuthorizationResult.Success.class::cast)
                .toList();
        if (successes.size() > 1) {
            throw ambiguous();
        }
        if (successes.size() == 1) {
            EnterpriseBearerAuthorization.requirePrincipal(
                    successes.getFirst(), requiredPermission);
            return successes.getFirst();
        }

        List<EnterpriseBearerAuthorizationResult.Expired> expired = results.stream()
                .filter(EnterpriseBearerAuthorizationResult.Expired.class::isInstance)
                .map(EnterpriseBearerAuthorizationResult.Expired.class::cast)
                .toList();
        if (expired.size() > 1) {
            throw ambiguous();
        }
        if (expired.size() == 1
                && results.stream().anyMatch(EnterpriseBearerAuthorizationResult.Invalid.class::isInstance)) {
            return expired.getFirst();
        }
        return new EnterpriseBearerAuthorizationResult.Invalid();
    }

    private static EnterpriseAuthenticationException ambiguous() {
        return EnterpriseAuthenticationException.authentication(
                "access_token_profile_ambiguous",
                "The enterprise access token matches multiple claims profiles.");
    }
}
