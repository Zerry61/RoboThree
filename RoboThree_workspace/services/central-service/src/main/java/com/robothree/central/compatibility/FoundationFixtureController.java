package com.robothree.central.compatibility;

import org.springframework.http.ResponseEntity;
import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/foundation")
@Profile({"default", "development"})
public class FoundationFixtureController {

    @GetMapping("/readiness")
    public ResponseEntity<FoundationFixtureProjection> readiness() {
        return FoundationFixtureResponseAssembler.ready();
    }

    @GetMapping("/compatibility")
    public ResponseEntity<FoundationFixtureProjection> compatibility() {
        return FoundationFixtureResponseAssembler.ready();
    }
}
