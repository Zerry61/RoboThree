package com.robothree.central.agentlifecycle.configuration;

import com.robothree.central.agentlifecycle.application.AgentLifecycleCommandService;
import com.robothree.central.agentlifecycle.application.AgentLifecycleStore;
import com.robothree.central.agentlifecycle.application.InternalTrialAgentLifecycleTokenAuthorizer;
import com.robothree.central.agentlifecycle.application.RobotAvatarImageValidator;
import com.robothree.central.persistence.port.CentralTransactionRunner;
import java.time.Clock;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

@Configuration(proxyBeanMethods = false)
@Profile({"development", "test"})
@ConditionalOnProperty(name = "robothree.agent-lifecycle.internal-trial-enabled",
        havingValue = "true")
public class AgentLifecycleConfiguration {
    @Bean Clock agentLifecycleClock() { return Clock.systemUTC(); }

    @Bean InternalTrialAgentLifecycleTokenAuthorizer agentLifecycleTokenAuthorizer(
            @Value("${robothree.agent-lifecycle.token-hmac-key-base64}") String key,
            @Qualifier("agentLifecycleClock") Clock agentLifecycleClock) {
        return new InternalTrialAgentLifecycleTokenAuthorizer(key, agentLifecycleClock);
    }

    @Bean AgentLifecycleCommandService agentLifecycleCommandService(AgentLifecycleStore store,
            CentralTransactionRunner transactions,
            @Qualifier("agentLifecycleClock") Clock agentLifecycleClock) {
        return new AgentLifecycleCommandService(store, transactions, agentLifecycleClock,
                new RobotAvatarImageValidator());
    }
}
