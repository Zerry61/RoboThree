package com.robothree.central.compatibility;

public record FoundationFixtureProjection(
        String fixtureSchema,
        boolean fixtureOnly,
        String service,
        String status,
        boolean compatible) {

    public static final String SCHEMA = "robothree.enterprise.foundation-fixture.v1";

    public static FoundationFixtureProjection ready() {
        return new FoundationFixtureProjection(
                SCHEMA,
                true,
                "central-gateway",
                "ready",
                true);
    }
}
