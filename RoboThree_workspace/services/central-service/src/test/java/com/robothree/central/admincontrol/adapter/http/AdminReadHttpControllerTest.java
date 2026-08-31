package com.robothree.central.admincontrol.adapter.http;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.robothree.central.admincontrol.application.AdminCapabilityProjectionService;
import com.robothree.central.admincontrol.application.AdminReadProjectionService;
import com.robothree.central.admincontrol.application.AdminReadRequestAuthorizer;
import com.robothree.central.admincontrol.application.AdminReadProjectionServiceTest;
import com.robothree.central.admincontrol.application.DevelopmentAdminPrincipalProvider;
import com.robothree.central.admincontrol.application.HmacAdminCursorCodec;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class AdminReadHttpControllerTest {

    private static final String QUERY = "10000000-0000-4000-8000-000000000001";
    private static final String CORRELATION = "20000000-0000-4000-8000-000000000002";
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        var service = new AdminReadProjectionService(
                new AdminReadRequestAuthorizer(new AdminCapabilityProjectionService(
                        new DevelopmentAdminPrincipalProvider())),
                AdminReadProjectionServiceTest.catalog(),
                new HmacAdminCursorCodec(new byte[32]),
                Clock.fixed(Instant.parse("2026-08-27T02:00:00Z"), ZoneOffset.UTC));
        mvc = MockMvcBuilders.standaloneSetup(new AdminReadHttpController(service))
                .setControllerAdvice(new AdminReadHttpExceptionHandler())
                .build();
    }

    @Test
    void exposesTheReadOnlySkillListWithStrictEnvelopeAndHeaders() throws Exception {
        mvc.perform(valid(get("/admin/v1alpha1/skills")).param("limit", "1"))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(header().exists("ETag"))
                .andExpect(jsonPath("$.contractVersion").value("admin-control.v1alpha1"))
                .andExpect(jsonPath("$.testIdentityUsed").value(true))
                .andExpect(jsonPath("$.productionIdentityReady").value(false))
                .andExpect(jsonPath("$.data.items[0].skillId").value("skill.alpha"))
                .andExpect(jsonPath("$.data.nextCursor").value(
                        org.hamcrest.Matchers.startsWith("r3admin1.")));
    }

    @Test
    void etagHitStillAuthorizesAndReturnsBodyless304() throws Exception {
        String etag = mvc.perform(valid(get("/admin/v1alpha1/skills")).param("limit", "1"))
                .andReturn().getResponse().getHeader("ETag");

        mvc.perform(valid(get("/admin/v1alpha1/skills"))
                        .param("limit", "1")
                        .header("If-None-Match", etag))
                .andExpect(status().isNotModified())
                .andExpect(content().string(""));
    }

    @Test
    void rejectsUnknownQueryBodyAndBrowserIdentityClaims() throws Exception {
        mvc.perform(valid(get("/admin/v1alpha1/skills")).param("userId", "user.fake"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("invalid_request"));
        mvc.perform(valid(get("/admin/v1alpha1/skills"))
                        .contentType("application/json")
                        .content("{}"))
                .andExpect(status().isBadRequest());
        mvc.perform(valid(get("/admin/v1alpha1/skills"))
                        .param("capability", "admin.skill.read"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void mapsGatedAndUnavailableSeparatelyWithoutFixtureFallback() throws Exception {
        mvc.perform(valid(get("/admin/v1alpha1/tools")))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errorCode").value("business_rule_unavailable"));
        mvc.perform(valid(get("/admin/v1alpha1/robots/agent.missing")))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.errorCode").value("service_unavailable"));
    }

    @Test
    void mutationRoutesAreNotRegistered() throws Exception {
        mvc.perform(valid(post("/admin/v1alpha1/skills")))
                .andExpect(status().isMethodNotAllowed());
    }

    @Test
    void missingOrWrongContractHeaderIsSafeInvalidRequest() throws Exception {
        mvc.perform(get("/admin/v1alpha1/skills")
                        .header("X-RoboThree-Query-Id", QUERY)
                        .header("X-RoboThree-Correlation-Id", CORRELATION))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.correlationId").value(CORRELATION));
        mvc.perform(get("/admin/v1alpha1/skills")
                        .header("X-RoboThree-Contract-Version", "v1alpha1")
                        .header("X-RoboThree-Query-Id", QUERY)
                        .header("X-RoboThree-Correlation-Id", CORRELATION))
                .andExpect(status().isBadRequest());
    }

    private static org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder valid(
            org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder builder) {
        return builder
                .header("X-RoboThree-Contract-Version", "admin-control.v1alpha1")
                .header("X-RoboThree-Query-Id", QUERY)
                .header("X-RoboThree-Correlation-Id", CORRELATION);
    }
}
