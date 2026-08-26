package com.robothree.central.compatibility;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;

final class FoundationFixtureResponseAssembler {

    private FoundationFixtureResponseAssembler() {}

    static ResponseEntity<FoundationFixtureProjection> ready() {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .header("X-RoboThree-Fixture", "true")
                .body(FoundationFixtureProjection.ready());
    }
}
