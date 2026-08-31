package com.robothree.central.shared.adapter.http;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.robothree.central.authentication.application.EnterpriseAuthenticationException;
import com.robothree.central.shared.observability.CentralTraceContext;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.Test;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class EnterpriseBearerTokenFilterTest {

    private final ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();
    private final EnterpriseBearerTokenFilter filter =
            new EnterpriseBearerTokenFilter(objectMapper, CentralTraceContext.noop());

    @Test
    void acceptsOneExactBearerHeader() {
        assertThat(EnterpriseBearerTokenExtractor.extract(List.of("Bearer abc.def.ghi")))
                .isEqualTo("abc.def.ghi");
    }

    @Test
    void rejectsMissingEmptyWrongPrefixWhitespaceOversizeAndMultipleValues() {
        List<List<String>> invalidHeaders = List.of(
                List.of(),
                List.of("Bearer "),
                List.of("bearer token"),
                List.of("Bearer token value"),
                List.of("Bearer " + "x".repeat(
                        EnterpriseBearerTokenExtractor.MAXIMUM_AUTHORIZATION_HEADER_LENGTH)),
                List.of("Bearer first", "Bearer second"));

        for (List<String> headers : invalidHeaders) {
            assertThatThrownBy(() -> EnterpriseBearerTokenExtractor.extract(headers))
                    .isInstanceOfSatisfying(
                            EnterpriseAuthenticationException.class,
                            exception -> assertThat(exception.code())
                                    .isEqualTo("access_token_invalid"));
        }
    }

    @Test
    void protectsOnlyExactConfigurationRoutesAndKeepsErrorsOpaque() throws Exception {
        MockHttpServletRequest missingToken =
                request("GET", "/v1alpha1/configuration");
        MockHttpServletResponse rejected = new MockHttpServletResponse();
        filter.doFilter(missingToken, rejected, new MockFilterChain());

        assertThat(rejected.getStatus()).isEqualTo(401);
        assertThat(rejected.getHeader(HttpHeaders.CACHE_CONTROL)).isEqualTo("no-store");
        assertThat(rejected.getContentAsString(StandardCharsets.UTF_8))
                .contains("\"code\":\"access_token_invalid\"")
                .doesNotContain("Authorization")
                .doesNotContain("Bearer");

        MockHttpServletRequest publicRoute =
                request("GET", "/v1alpha1/compatibility");
        MockHttpServletResponse publicResponse = new MockHttpServletResponse();
        MockFilterChain publicChain = new MockFilterChain();
        filter.doFilter(publicRoute, publicResponse, publicChain);

        assertThat(publicChain.getRequest()).isSameAs(publicRoute);
        assertThat(publicResponse.getStatus()).isEqualTo(200);
    }

    @Test
    void protectsAllFourV1Alpha2ModelRoutesWithoutBroadeningThePathMatch()
            throws Exception {
        for (var route : List.of(
                request("POST", "/v1alpha2/model-invocations"),
                request("GET", "/v1alpha2/model-invocations/123"),
                request("POST", "/v1alpha2/model-invocations/123/cancel"),
                request("GET", "/v1alpha2/model-invocations/123/events"))) {
            MockHttpServletResponse rejected = new MockHttpServletResponse();
            filter.doFilter(route, rejected, new MockFilterChain());
            assertThat(rejected.getStatus()).isEqualTo(401);
        }

        MockHttpServletRequest unrelated = request(
                "GET", "/v1alpha2/model-invocations/123/events/extra");
        MockFilterChain chain = new MockFilterChain();
        filter.doFilter(unrelated, new MockHttpServletResponse(), chain);
        assertThat(chain.getRequest()).isSameAs(unrelated);
    }

    @Test
    void protectsOnlyTheExactInternalTrialAdminModelDiscoveryRoute() throws Exception {
        MockHttpServletRequest discovery =
                request("GET", "/internal-trial/v1/admin-models/default");
        MockHttpServletResponse rejected = new MockHttpServletResponse();
        filter.doFilter(discovery, rejected, new MockFilterChain());
        assertThat(rejected.getStatus()).isEqualTo(401);

        MockHttpServletRequest wrongMethod =
                request("POST", "/internal-trial/v1/admin-models/default");
        MockFilterChain wrongMethodChain = new MockFilterChain();
        filter.doFilter(wrongMethod, new MockHttpServletResponse(), wrongMethodChain);
        assertThat(wrongMethodChain.getRequest()).isSameAs(wrongMethod);

        MockHttpServletRequest suffix =
                request("GET", "/internal-trial/v1/admin-models/default/extra");
        MockFilterChain suffixChain = new MockFilterChain();
        filter.doFilter(suffix, new MockHttpServletResponse(), suffixChain);
        assertThat(suffixChain.getRequest()).isSameAs(suffix);
    }

    @Test
    void lifecycleAuthenticationFailuresUseTheStrictLifecycleErrorSurface()
            throws Exception {
        MockHttpServletRequest request =
                request("GET", "/internal-trial/v1/agent-lifecycle/drafts");
        request.addHeader(
                "X-RoboThree-Correlation-Id",
                "00000000-0000-4000-8000-000000000322");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, new MockFilterChain());

        assertThat(response.getStatus()).isEqualTo(401);
        assertThat(objectMapper.readTree(response.getContentAsByteArray()))
                .isEqualTo(objectMapper.readTree("""
                        {
                          "contractVersion":"agent-lifecycle.v1alpha1",
                          "errorCode":"agentlifecycle.unauthorized",
                          "safeSummary":"当前身份不能执行此操作。",
                          "correlationId":"00000000-0000-4000-8000-000000000322"
                        }
                        """));
    }

    @Test
    void filterOrderIsExecutableArchitectureAndNotDocumentation() {
        Order order = EnterpriseBearerTokenFilter.class.getAnnotation(Order.class);

        assertThat(order).isNotNull();
        assertThat(order.value()).isEqualTo(EnterpriseBearerTokenFilter.FILTER_ORDER);
    }

    @Test
    void concurrentRequestsKeepBearerValuesIsolatedAndRemoveRequestAttributes()
            throws Exception {
        int requestCount = 64;
        try (var executor = Executors.newFixedThreadPool(8)) {
            List<Callable<String>> calls = new ArrayList<>();
            List<MockHttpServletRequest> requests = new ArrayList<>();
            for (int index = 0; index < requestCount; index++) {
                String token = "token-" + index;
                MockHttpServletRequest request =
                        request("GET", "/v1alpha1/configuration");
                request.addHeader(HttpHeaders.AUTHORIZATION, "Bearer " + token);
                requests.add(request);
                calls.add(() -> {
                    MockHttpServletResponse response = new MockHttpServletResponse();
                    String[] observed = new String[1];
                    filter.doFilter(request, response, (servletRequest, servletResponse) ->
                            observed[0] = (String) servletRequest.getAttribute(
                                    EnterpriseBearerTokenFilter.ACCESS_TOKEN_ATTRIBUTE));
                    assertThat(response.getContentAsByteArray()).isEmpty();
                    return observed[0];
                });
            }

            Set<String> observed = new HashSet<>();
            for (var future : executor.invokeAll(calls)) {
                observed.add(future.get());
            }

            assertThat(observed).containsExactlyInAnyOrderElementsOf(
                    java.util.stream.IntStream.range(0, requestCount)
                            .mapToObj(index -> "token-" + index)
                            .toList());
            assertThat(requests)
                    .allSatisfy(request -> assertThat(request.getAttribute(
                                    EnterpriseBearerTokenFilter.ACCESS_TOKEN_ATTRIBUTE))
                            .isNull());
        }
    }

    private static MockHttpServletRequest request(String method, String path) {
        MockHttpServletRequest request = new MockHttpServletRequest(method, path);
        request.setRequestURI(path);
        return request;
    }
}
