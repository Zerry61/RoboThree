package com.robothree.central.support;

import static org.assertj.core.api.Assertions.assertThat;

import com.robothree.central.authentication.port.OAIdentityAdapter.VerifiedIdentityClaims;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.Map;
import org.junit.jupiter.api.Test;

class Cgf11aFakesTest {

    @Test
    void fakeClockIsDeterministicWithoutSleeping() {
        FakeClock clock = new FakeClock(
                Instant.parse("2026-07-25T04:00:00Z"),
                ZoneOffset.UTC);
        clock.advanceSeconds(60);
        assertThat(clock.instant()).isEqualTo("2026-07-25T04:01:00Z");
    }

    @Test
    void fakeOaAndSecretStoreExposeClaimsAndOpaqueHandlesOnly() {
        FakeOAIdentityAdapter adapter = new FakeOAIdentityAdapter(Map.of(
                "flow-1",
                new VerifiedIdentityClaims(
                        "enterprise.alpha",
                        "user.alpha",
                        "fake-oa",
                        "a".repeat(64))));
        assertThat(adapter.verify(new FakeOAIdentityAdapter.FakeOAIdentityMaterial("flow-1"))
                        .userId())
                .isEqualTo("user.alpha");

        FakeEnterpriseSecretStore secrets = new FakeEnterpriseSecretStore();
        assertThat(secrets.resolveTokenSigningKeyHandle().reference())
                .isEqualTo("test-signing-key-handle");
        assertThat(secrets.resolveTokenVerificationKeyHandle().reference())
                .isEqualTo("test-verification-key-handle");
    }

    @Test
    void fakeDeviceSignerProducesEs256ProofWithoutPrivateKeyApi() throws Exception {
        FakeDeviceSigner signer = new FakeDeviceSigner();
        String challenge = "ROBOTHREE_DEVICE_PROOF_V1\n{\"challengeId\":\"fixture\"}";
        byte[] signature = signer.sign(challenge);

        Signature verifier = Signature.getInstance("SHA256withECDSA");
        verifier.initVerify(KeyFactory.getInstance("EC").generatePublic(
                new X509EncodedKeySpec(Base64.getDecoder().decode(signer.getPublicKey()))));
        verifier.update(challenge.getBytes(StandardCharsets.UTF_8));

        assertThat(verifier.verify(signature)).isTrue();
        assertThat(FakeDeviceSigner.class.getMethods())
                .extracting(method -> method.getName())
                .doesNotContain("getPrivateKey", "resolvePrivateKey", "exportPrivateKey");
    }
}
