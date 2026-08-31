package com.robothree.central.admincontrol.configuration;

import com.robothree.central.admincontrol.adapter.http.JdkAdminModelConnectionTester;
import com.robothree.central.admincontrol.application.AdminModelCommandService;
import com.robothree.central.admincontrol.application.AdminModelCredentialCipher;
import com.robothree.central.admincontrol.application.AdminManagedModelGatewaySource;
import com.robothree.central.admincontrol.application.AdminManagedModelCredentialMaterialSource;
import com.robothree.central.admincontrol.application.AdminModelStore;
import com.robothree.central.persistence.port.CentralTransactionRunner;
import java.security.SecureRandom;
import java.time.Clock;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

@Configuration(proxyBeanMethods = false)
@Profile({"development", "test"})
@ConditionalOnProperty(name = "robothree.admin-api.internal-trial-model-write-enabled",
        havingValue = "true")
public class AdminModelMutationConfiguration {
    @Bean Clock adminModelClock() { return Clock.systemUTC(); }
    @Bean AdminModelCredentialCipher adminModelCredentialCipher(
            @Value("${robothree.admin-api.model-credential-master-key-base64}") String key,
            Clock adminModelClock) {
        return new AdminModelCredentialCipher(key, new SecureRandom(), adminModelClock);
    }
    @Bean JdkAdminModelConnectionTester adminModelConnectionTester(AdminModelStore store,
            AdminModelCredentialCipher cipher, Clock adminModelClock) {
        return new JdkAdminModelConnectionTester(store, cipher, adminModelClock);
    }
    @Bean AdminModelCommandService adminModelCommandService(AdminModelStore store,
            AdminModelCredentialCipher cipher, JdkAdminModelConnectionTester tester,
            CentralTransactionRunner transactions, Clock adminModelClock) {
        return new AdminModelCommandService(store, cipher, tester, transactions, adminModelClock);
    }
    @Bean AdminManagedModelGatewaySource adminManagedModelGatewaySource(
            AdminModelStore store, Clock adminModelClock) {
        return new AdminManagedModelGatewaySource(store, adminModelClock);
    }
    @Bean AdminManagedModelCredentialMaterialSource adminManagedModelCredentialMaterialSource(
            AdminModelStore store, AdminModelCredentialCipher cipher) {
        return new AdminManagedModelCredentialMaterialSource(store, cipher);
    }
}
