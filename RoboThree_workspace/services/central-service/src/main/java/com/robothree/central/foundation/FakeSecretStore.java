package com.robothree.central.foundation;

import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

public final class FakeSecretStore {

    private final Map<String, String> fixtures = new ConcurrentHashMap<>();

    public void putFixture(String reference, String fixtureValue) {
        fixtures.put(reference, fixtureValue);
    }

    public Optional<String> resolveFixture(String reference) {
        return Optional.ofNullable(fixtures.get(reference));
    }
}
