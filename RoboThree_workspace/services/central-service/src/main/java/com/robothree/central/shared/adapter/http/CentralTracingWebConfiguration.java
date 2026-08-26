package com.robothree.central.shared.adapter.http;

import lombok.NonNull;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration(proxyBeanMethods = false)
@ConditionalOnBean(CentralTraceResponseInterceptor.class)
@RequiredArgsConstructor
class CentralTracingWebConfiguration implements WebMvcConfigurer {

    @NonNull
    private final CentralTraceResponseInterceptor traceResponseInterceptor;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(traceResponseInterceptor);
    }
}
