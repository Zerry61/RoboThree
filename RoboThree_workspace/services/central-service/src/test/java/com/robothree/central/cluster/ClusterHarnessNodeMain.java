package com.robothree.central.cluster;

import com.robothree.central.CentralServiceApplication;
import org.springframework.boot.Banner;
import org.springframework.boot.SpringApplication;

public final class ClusterHarnessNodeMain {

    private ClusterHarnessNodeMain() {}

    public static void main(String[] args) {
        SpringApplication application = new SpringApplication(
                ClusterHarnessConfiguration.class,
                CentralServiceApplication.class);
        application.setAdditionalProfiles("cluster-harness");
        application.setBannerMode(Banner.Mode.OFF);
        application.run(args);
    }
}
