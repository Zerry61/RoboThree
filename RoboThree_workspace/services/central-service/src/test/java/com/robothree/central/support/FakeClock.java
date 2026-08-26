package com.robothree.central.support;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.Objects;

public final class FakeClock extends Clock {

    private Instant now;
    private final ZoneId zone;

    public FakeClock(Instant now, ZoneId zone) {
        this.now = Objects.requireNonNull(now, "now");
        this.zone = Objects.requireNonNull(zone, "zone");
    }

    public void advanceSeconds(long seconds) {
        now = now.plusSeconds(seconds);
    }

    @Override
    public ZoneId getZone() {
        return zone;
    }

    @Override
    public Clock withZone(ZoneId requestedZone) {
        return new FakeClock(now, requestedZone);
    }

    @Override
    public Instant instant() {
        return now;
    }
}
