package com.robothree.central.modelgateway.recovery;

import com.robothree.central.CentralServiceApplication;
import org.springframework.boot.Banner;
import org.springframework.boot.SpringApplication;

public final class ModelRecoveryHarnessNodeMain {

    private ModelRecoveryHarnessNodeMain() {}

    public static void main(String[] args) {
        SpringApplication application = new SpringApplication(
                ModelRecoveryHarnessConfiguration.class,
                CentralServiceApplication.class);
        application.setAdditionalProfiles(
                "cluster-harness",
                "model-recovery-harness");
        application.setBannerMode(Banner.Mode.OFF);
        application.run(args);
    }
}
