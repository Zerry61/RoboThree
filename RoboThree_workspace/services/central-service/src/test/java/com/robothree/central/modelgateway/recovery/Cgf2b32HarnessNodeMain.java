package com.robothree.central.modelgateway.recovery;

import com.robothree.central.CentralServiceApplication;
import org.springframework.boot.Banner;
import org.springframework.boot.SpringApplication;

public final class Cgf2b32HarnessNodeMain {

    private Cgf2b32HarnessNodeMain() {}

    public static void main(String[] args) {
        SpringApplication application = new SpringApplication(
                Cgf2b32HarnessConfiguration.class,
                CentralServiceApplication.class);
        application.setAdditionalProfiles(
                "cluster-harness",
                "cgf2b32-harness");
        application.setBannerMode(Banner.Mode.OFF);
        application.run(args);
    }
}
