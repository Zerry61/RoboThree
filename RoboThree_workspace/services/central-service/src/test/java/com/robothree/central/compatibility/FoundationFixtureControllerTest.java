package com.robothree.central.compatibility;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(FoundationFixtureController.class)
class FoundationFixtureControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void exposesOnlyMarkedReadinessFixture() throws Exception {
        mockMvc.perform(get("/foundation/readiness"))
                .andExpect(status().isOk())
                .andExpect(header().string("X-RoboThree-Fixture", "true"))
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(content().contentTypeCompatibleWith("application/json"))
                .andExpect(jsonPath("$.fixtureSchema").value(FoundationFixtureProjection.SCHEMA))
                .andExpect(jsonPath("$.fixtureOnly").value(true))
                .andExpect(jsonPath("$.status").value("ready"));
    }

    @Test
    void exposesOnlyMarkedCompatibilityFixture() throws Exception {
        mockMvc.perform(get("/foundation/compatibility"))
                .andExpect(status().isOk())
                .andExpect(header().string("X-RoboThree-Fixture", "true"))
                .andExpect(jsonPath("$.compatible").value(true))
                .andExpect(jsonPath("$.service").value("central-gateway"));
    }
}
