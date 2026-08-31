package com.robothree.central.admincontrol.configuration;

import com.robothree.central.admincontrol.application.AdminCapabilityProjectionService;
import com.robothree.central.admincontrol.application.AdminInventoryCatalog;
import com.robothree.central.admincontrol.application.AdminReadProjectionService;
import com.robothree.central.admincontrol.application.AdminReadRequestAuthorizer;
import com.robothree.central.admincontrol.application.HmacAdminCursorCodec;
import java.security.SecureRandom;
import java.time.Clock;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

@Configuration(proxyBeanMethods = false)
@Profile({"development", "test"})
@ConditionalOnProperty(
        name = "robothree.admin-api.test-read-shell-enabled",
        havingValue = "true")
public class AdminReadHttpConfiguration {

    @Bean
    HmacAdminCursorCodec adminCursorCodec() {
        byte[] key = new byte[32];
        new SecureRandom().nextBytes(key);
        return new HmacAdminCursorCodec(key);
    }

    @Bean
    AdminReadProjectionService adminReadProjectionService(
            AdminReadRequestAuthorizer authorizer,
            AdminInventoryCatalog inventoryCatalog,
            HmacAdminCursorCodec cursorCodec) {
        return new AdminReadProjectionService(
                authorizer,
                inventoryCatalog,
                cursorCodec,
                Clock.systemUTC());
    }
}
