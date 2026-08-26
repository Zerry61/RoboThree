package com.robothree.central.authentication.adapter.http;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.robothree.central.authentication.application.IssueDeviceChallengeService;
import com.robothree.central.authentication.application.ManualDeviceEnrollmentService;
import com.robothree.central.authentication.application.AuthenticationCrypto;
import com.robothree.central.authentication.application.AuthenticationSecurityPolicy;
import com.robothree.central.authentication.application.DefaultEnterpriseDeviceTrustProvider;
import com.robothree.central.authentication.adapter.security.Es256DeviceProofVerifier;
import com.robothree.central.authentication.domain.DeviceEnrollmentGrant;
import com.robothree.central.authentication.domain.VerifiedEnterpriseIdentity;
import com.robothree.central.persistence.memory.InMemoryCentralPersistence;
import com.robothree.central.shared.adapter.http.GlobalExceptionHandler;
import com.robothree.central.shared.observability.CentralObservationRunner;
import com.robothree.central.shared.observability.CentralTraceContext;
import com.robothree.central.support.DeterministicAuthenticationEntropy;
import com.robothree.central.support.FakeClock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class EnterpriseIdentityControllerTest {

    private MockMvc mvc;
    @BeforeEach
    void setUp() {
        Instant now = Instant.parse("2026-07-25T08:00:00Z");
        InMemoryCentralPersistence persistence = new InMemoryCentralPersistence();
        AuthenticationSecurityPolicy policy = AuthenticationSecurityPolicy.alphaDefaults();
        DeterministicAuthenticationEntropy entropy = new DeterministicAuthenticationEntropy();
        FakeClock clock = new FakeClock(now, ZoneOffset.UTC);
        VerifiedEnterpriseIdentity identity = persistence.insert(new VerifiedEnterpriseIdentity(
                UUID.fromString("00000000-0000-4000-8000-000000000111"),
                "enterprise.alpha",
                "user.alpha",
                "fake-oa",
                "a".repeat(64),
                "b".repeat(64),
                now,
                now.plusSeconds(300),
                null));
        persistence.insert(new DeviceEnrollmentGrant(
                UUID.fromString("00000000-0000-4000-8000-000000000444"),
                AuthenticationCrypto.sha256("alpha-enrollment-code-0001"),
                identity.enterpriseId(),
                identity.userId(),
                now,
                now.plusSeconds(600),
                null,
                null));
        IssueDeviceChallengeService challenges = new IssueDeviceChallengeService(
                persistence,
                persistence,
                persistence,
                persistence,
                new DefaultEnterpriseDeviceTrustProvider(),
                entropy,
                clock,
                policy);
        ManualDeviceEnrollmentService enrollments = new ManualDeviceEnrollmentService(
                persistence,
                persistence,
                persistence,
                persistence,
                new Es256DeviceProofVerifier(),
                persistence,
                entropy,
                clock,
                policy);
        ObjectMapper strictJson = new ObjectMapper()
                .findAndRegisterModules()
                .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);
        mvc = MockMvcBuilders.standaloneSetup(
                        new EnterpriseIdentityController(
                                challenges,
                                enrollments,
                                CentralObservationRunner.noop()))
                .setControllerAdvice(new GlobalExceptionHandler(CentralTraceContext.noop()))
                .setMessageConverters(new MappingJackson2HttpMessageConverter(strictJson))
                .build();
    }

    @Test
    void exposesFormalChallengeRouteWithNoStore() throws Exception {
        UUID identityId = UUID.fromString("00000000-0000-4000-8000-000000000111");

        mvc.perform(post("/v1alpha1/device-challenges")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "type": "issue_device_challenge_request",
                                  "contractVersion": "v1alpha1",
                                  "purpose": "device_enrollment",
                                  "verifiedIdentityId": "%s",
                                  "clientInstanceId": "00000000-0000-4000-8000-000000000333",
                                  "deviceEnrollmentCode": "alpha-enrollment-code-0001",
                                  "publicKeyDigest": "%s"
                                }
                                """.formatted(identityId, "a".repeat(64))))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.type").value("device_challenge"))
                .andExpect(jsonPath("$.challengeId").exists())
                .andExpect(jsonPath("$.allowedAlgorithms[0]").value("ES256"));
    }

    @Test
    void rejectsUnknownFieldsAndWrongContractVersionWithCanonicalError() throws Exception {
        mvc.perform(post("/v1alpha1/device-challenges")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "type": "issue_device_challenge_request",
                                  "contractVersion": "v1alpha1",
                                  "purpose": "device_enrollment",
                                  "verifiedIdentityId": "00000000-0000-4000-8000-000000000111",
                                  "clientInstanceId": "00000000-0000-4000-8000-000000000333",
                                  "deviceEnrollmentCode": "alpha-enrollment-code-0001",
                                  "publicKeyDigest": "%s",
                                  "unexpected": true
                                }
                                """.formatted("a".repeat(64))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.contractVersion").value("v1alpha1"))
                .andExpect(jsonPath("$.code").value("contract_validation_failed"))
                .andExpect(jsonPath("$.correlationId").exists());

        mvc.perform(post("/v1alpha1/device-challenges")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "type": "issue_device_challenge_request",
                                  "contractVersion": "v2",
                                  "purpose": "device_enrollment",
                                  "verifiedIdentityId": "00000000-0000-4000-8000-000000000111",
                                  "clientInstanceId": "00000000-0000-4000-8000-000000000333"
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("contract_validation_failed"));
    }

    @Test
    void exposesFormalEnrollmentRouteAndRejectsWrongVersionBeforeExecution() throws Exception {
        mvc.perform(post("/v1alpha1/device-enrollment")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "type": "enroll_device_request",
                                  "contractVersion": "v2",
                                  "verifiedIdentityId": "00000000-0000-4000-8000-000000000111",
                                  "deviceEnrollmentCode": "alpha-enrollment-code-0001",
                                  "clientInstanceId": "00000000-0000-4000-8000-000000000333",
                                  "devicePublicKey": {
                                    "keyId": "key.alpha",
                                    "algorithm": "ES256",
                                    "format": "spki_der_base64",
                                    "encodedKey": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
                                  },
                                  "deviceProof": {
                                    "challengeId": "00000000-0000-4000-8000-000000000222",
                                    "deviceKeyId": "key.alpha",
                                    "algorithm": "ES256",
                                    "signature": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
                                    "signedAt": "2026-07-25T08:00:00Z"
                                  }
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.code").value("contract_validation_failed"));
    }
}
