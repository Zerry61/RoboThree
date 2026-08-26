package com.robothree.central.authentication.adapter.http;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.robothree.central.authentication.adapter.security.Es256DeviceProofVerifier;
import com.robothree.central.authentication.application.AccessTokenSecurityPolicy;
import com.robothree.central.authentication.application.AuthenticationCrypto;
import com.robothree.central.authentication.application.AuthenticationSecurityPolicy;
import com.robothree.central.authentication.application.DefaultEnterpriseDeviceTrustProvider;
import com.robothree.central.authentication.application.FrozenCompatibilityEvaluator;
import com.robothree.central.authentication.application.IssueDeviceChallengeService;
import com.robothree.central.authentication.application.RoboThreeAccessTokenService;
import com.robothree.central.authentication.application.RoboThreeAccessTokenValidator;
import com.robothree.central.authentication.domain.DeviceChallenge;
import com.robothree.central.authentication.domain.EnterpriseCompatibility;
import com.robothree.central.authentication.domain.EnterpriseDevice;
import com.robothree.central.authentication.domain.EnterpriseUserPermission;
import com.robothree.central.authentication.domain.VerifiedEnterpriseIdentity;
import com.robothree.central.configuration.application.ConfigurationIntegrityVerifier;
import com.robothree.central.configuration.application.ConfigurationReadService;
import com.robothree.central.configuration.application.TrustedConfigurationSeeder;
import com.robothree.central.configuration.adapter.http.EnterpriseConfigurationController;
import com.robothree.central.persistence.memory.InMemoryCentralPersistence;
import com.robothree.central.shared.adapter.http.EnterpriseBearerTokenFilter;
import com.robothree.central.shared.adapter.http.GlobalExceptionHandler;
import com.robothree.central.shared.observability.CentralObservationRunner;
import com.robothree.central.shared.observability.CentralTraceContext;
import com.robothree.central.support.CanonicalConfigurationFixtures;
import com.robothree.central.support.DeterministicAuthenticationEntropy;
import com.robothree.central.support.FakeClock;
import com.robothree.central.support.FakeDeviceSigner;
import com.robothree.central.support.FakeEnterpriseSecretStore;
import com.robothree.central.support.FakeJwsTokenCodec;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.converter.ByteArrayHttpMessageConverter;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class EnterpriseAccessTokenAndConfigurationControllerTest {

    private static final Instant NOW = Instant.parse("2026-07-25T10:00:00Z");
    private static final UUID IDENTITY_ID =
            UUID.fromString("40000000-0000-4000-8000-000000000004");
    private static final String CLIENT_INSTANCE_ID =
            "50000000-0000-4000-8000-000000000005";

    private MockMvc mvc;
    private DeviceChallenge challenge;
    private FakeDeviceSigner signer;
    private String expectedConfiguration;
    private String expectedEtag;
    private String expectedPackage;
    private String expectedPackageEtag;
    private String snapshotId;
    private String snapshotRevision;
    private String snapshotDigest;
    private String packageId;
    private String packageKind;
    private String packageRevision;
    private String packageDigest;

    @BeforeEach
    void setUp() {
        InMemoryCentralPersistence persistence = new InMemoryCentralPersistence();
        FakeClock clock = new FakeClock(NOW, ZoneOffset.UTC);
        DeterministicAuthenticationEntropy entropy = new DeterministicAuthenticationEntropy();
        signer = new FakeDeviceSigner();
        VerifiedEnterpriseIdentity identity = persistence.insert(new VerifiedEnterpriseIdentity(
                IDENTITY_ID,
                "enterprise.alpha",
                "user.alpha",
                "fake-oa",
                "a".repeat(64),
                "b".repeat(64),
                NOW,
                NOW.plusSeconds(300),
                null));
        String publicKey = signer.getPublicKey();
        persistence.insert(new EnterpriseDevice(
                "device.alpha",
                identity.enterpriseId(),
                signer.getDeviceKeyId(),
                "spki_der_base64",
                publicKey,
                AuthenticationCrypto.sha256(Base64.getDecoder().decode(publicKey)),
                "ES256",
                "manual_device_enrollment",
                "managed",
                "compliant",
                1,
                NOW,
                null,
                null));
        persistence.save(new EnterpriseUserPermission(
                identity.enterpriseId(),
                identity.userId(),
                "configuration.read",
                true,
                1,
                NOW));

        var compatibility = new FrozenCompatibilityEvaluator(
                new EnterpriseCompatibility(
                        "v1alpha1",
                        "0.0.0-cgf.1.1c",
                        List.of("v1alpha1"),
                        "0.0.0-dcf.1.0",
                        "0.0.0-dcf.1.0",
                        List.of(
                                "configuration_snapshot",
                                "fixed_permissions",
                                "enterprise_identity",
                                "managed_device_trust"),
                        "available",
                        List.of("v1alpha1"),
                        1),
                Set.of(CLIENT_INSTANCE_ID));
        var challengeService = new IssueDeviceChallengeService(
                persistence,
                persistence,
                persistence,
                persistence,
                new DefaultEnterpriseDeviceTrustProvider(),
                entropy,
                clock,
                AuthenticationSecurityPolicy.alphaDefaults());
        challenge = challengeService.issue(
                new IssueDeviceChallengeService.IssueDeviceChallengeCommand(
                        IssueDeviceChallengeService.TOKEN_ISSUANCE,
                        IDENTITY_ID,
                        CLIENT_INSTANCE_ID,
                        signer.getDeviceKeyId(),
                        null,
                        null));
        var tokenService = new RoboThreeAccessTokenService(
                persistence,
                persistence,
                persistence,
                persistence,
                persistence,
                new DefaultEnterpriseDeviceTrustProvider(),
                new Es256DeviceProofVerifier(),
                compatibility,
                new FakeJwsTokenCodec(),
                new FakeEnterpriseSecretStore(),
                persistence,
                entropy,
                clock,
                AccessTokenSecurityPolicy.alphaDefaults());
        var tokenValidator = new RoboThreeAccessTokenValidator(
                new FakeJwsTokenCodec(),
                new FakeEnterpriseSecretStore(),
                persistence,
                clock,
                AccessTokenSecurityPolicy.alphaDefaults());
        var integrity = new ConfigurationIntegrityVerifier(persistence);
        var seed = CanonicalConfigurationFixtures.validSeed(NOW);
        new TrustedConfigurationSeeder(
                        persistence,
                        persistence,
                        persistence,
                        integrity)
                .seed(seed.packages(), seed.snapshot());
        expectedConfiguration = seed.snapshot().documentJson();
        expectedEtag = seed.snapshot().etag();
        expectedPackage = seed.packages().getFirst().documentJson();
        expectedPackageEtag = ConfigurationIntegrityVerifier.quotedEtag(
                seed.packages().getFirst().digest());
        snapshotId = seed.snapshot().snapshotId();
        snapshotRevision = seed.snapshot().revision();
        snapshotDigest = seed.snapshot().digest();
        packageId = seed.packages().getFirst().packageId();
        packageKind = seed.packages().getFirst().kind();
        packageRevision = seed.packages().getFirst().revision();
        packageDigest = seed.packages().getFirst().digest();
        var tokenController = new EnterpriseAccessTokenController(
                tokenService,
                compatibility,
                CentralObservationRunner.noop());
        var configurationController = new EnterpriseConfigurationController(
                new ConfigurationReadService(
                        new com.robothree.central.authentication.application
                                .LegacyBearerAuthorizerAdapter(tokenValidator),
                        persistence,
                        integrity,
                        clock),
                CentralObservationRunner.noop());
        ObjectMapper strictJson = new ObjectMapper()
                .findAndRegisterModules()
                .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);
        mvc = MockMvcBuilders.standaloneSetup(tokenController, configurationController)
                .addFilter(new EnterpriseBearerTokenFilter(
                        strictJson,
                        CentralTraceContext.noop()), "/*")
                .setControllerAdvice(new GlobalExceptionHandler(CentralTraceContext.noop()))
                .setMessageConverters(
                        new ByteArrayHttpMessageConverter(),
                        new MappingJackson2HttpMessageConverter(strictJson))
                .build();
    }

    @Test
    void exposesCompatibilityWithoutInternalRevision() throws Exception {
        mvc.perform(get("/v1alpha1/compatibility"))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.contractVersion").value("v1alpha1"))
                .andExpect(jsonPath("$.centralVersion").value("0.0.0-cgf.1.1c"))
                .andExpect(jsonPath("$.revision").doesNotExist());
    }

    @Test
    void issuesBearerTokenAndRejectsUnknownRequestFields() throws Exception {
        var response = mvc.perform(post("/v1alpha1/token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(tokenRequest(false)))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.type").value("token_result"))
                .andExpect(jsonPath("$.tokenType").value("Bearer"))
                .andExpect(jsonPath("$.accessToken").isNotEmpty())
                .andReturn()
                .getResponse()
                .getContentAsString();
        assertThat(response).doesNotContain("private");

        mvc.perform(post("/v1alpha1/token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(tokenRequest(true)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("contract_validation_failed"));
    }

    @Test
    void protectsConfigurationAndReturnsBodylessNotModified() throws Exception {
        String accessToken = issueAccessToken();

        mvc.perform(get("/v1alpha1/configuration")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.ETAG, expectedEtag))
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(content().json(expectedConfiguration));

        mvc.perform(get("/v1alpha1/configuration")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
                        .header(HttpHeaders.IF_NONE_MATCH, expectedEtag))
                .andExpect(status().isNotModified())
                .andExpect(header().string(HttpHeaders.ETAG, expectedEtag))
                .andExpect(content().string(""));

        mvc.perform(get("/v1alpha1/configuration"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("access_token_invalid"));
    }

    @Test
    void readsOnlyAnExactSnapshotBoundPackageAndSupportsEtag() throws Exception {
        String accessToken = issueAccessToken();
        String route = exactPackageRoute(
                packageKind,
                packageRevision,
                snapshotDigest,
                packageDigest);

        mvc.perform(get(route)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.ETAG, expectedPackageEtag))
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(content().json(expectedPackage));

        mvc.perform(get(route)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
                        .header(HttpHeaders.IF_NONE_MATCH, expectedPackageEtag))
                .andExpect(status().isNotModified())
                .andExpect(header().string(HttpHeaders.ETAG, expectedPackageEtag))
                .andExpect(content().string(""));
    }

    @Test
    void failsClosedForWrongPackageReferenceAndMissingAuthorization() throws Exception {
        String accessToken = issueAccessToken();

        mvc.perform(get(exactPackageRoute(
                                packageKind,
                                packageRevision,
                                snapshotDigest,
                                "0".repeat(64)))
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("package_reference_denied"));

        mvc.perform(get(exactPackageRoute(
                        packageKind,
                        packageRevision,
                        snapshotDigest,
                        packageDigest)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("access_token_invalid"));

        mvc.perform(get(exactPackageRoute(
                                "latest",
                                packageRevision,
                                snapshotDigest,
                                packageDigest))
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("contract_validation_failed"));
    }

    private String issueAccessToken() throws Exception {
        return new ObjectMapper()
                .readTree(mvc.perform(post("/v1alpha1/token")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(tokenRequest(false)))
                        .andReturn()
                        .getResponse()
                        .getContentAsString())
                .path("accessToken")
                .asText();
    }

    private String exactPackageRoute(
            String requestedKind,
            String requestedPackageRevision,
            String requestedSnapshotDigest,
            String requestedPackageDigest) {
        return "/v1alpha1/configuration/%s/revisions/%s/packages/%s/%s/revisions/%s"
                .formatted(
                        snapshotId,
                        snapshotRevision,
                        requestedKind,
                        packageId,
                        requestedPackageRevision)
                + "?snapshotDigest=" + requestedSnapshotDigest
                + "&packageDigest=" + requestedPackageDigest;
    }

    private String tokenRequest(boolean includeUnknownField) {
        String signature = Base64.getUrlEncoder().withoutPadding().encodeToString(
                signer.sign(AuthenticationCrypto.signingBytes(challenge)));
        return """
                {
                  "type": "issue_access_token_request",
                  "contractVersion": "v1alpha1",
                  "verifiedIdentityId": "%s",
                  "clientInstanceId": "%s",
                  "deviceProof": {
                    "challengeId": "%s",
                    "deviceKeyId": "%s",
                    "algorithm": "ES256",
                    "signature": "%s",
                    "signedAt": "%s"
                  }%s
                }
                """.formatted(
                IDENTITY_ID,
                CLIENT_INSTANCE_ID,
                challenge.challengeId(),
                signer.getDeviceKeyId(),
                signature,
                NOW,
                includeUnknownField ? ",\n  \"unexpected\": true" : "");
    }
}
