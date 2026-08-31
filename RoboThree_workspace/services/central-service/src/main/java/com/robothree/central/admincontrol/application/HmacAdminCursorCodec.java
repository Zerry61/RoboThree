package com.robothree.central.admincontrol.application;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.admincontrol.domain.AdminModule;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.Objects;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

public final class HmacAdminCursorCodec {

    public static final String PREFIX = "r3admin1.";
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Base64.Encoder ENCODER = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder DECODER = Base64.getUrlDecoder();
    private final byte[] key;

    public HmacAdminCursorCodec(byte[] key) {
        Objects.requireNonNull(key, "key");
        if (key.length < 32 || key.length > 64) {
            throw new IllegalArgumentException("admin.cursor_key_length_invalid");
        }
        this.key = key.clone();
    }

    public String encode(Cursor cursor) {
        Objects.requireNonNull(cursor, "cursor");
        ObjectNode payload = JSON.createObjectNode();
        payload.put("contractVersion", "admin-control.v1alpha1");
        payload.put("module", cursor.module().wireValue());
        payload.put("queryRevision", cursor.queryRevision());
        payload.put("lastSortKey", cursor.lastSortKey());
        payload.put("lastResourceId", cursor.lastResourceId());
        payload.put("limit", cursor.limit());
        payload.put("codecRevision", "hmac-sha256.v1");
        String encoded = ENCODER.encodeToString(payload.toString().getBytes(StandardCharsets.UTF_8));
        return PREFIX + encoded + "." + ENCODER.encodeToString(mac(encoded));
    }

    public Cursor decode(String value, AdminModule expectedModule, String expectedRevision) {
        if (value == null || value.length() < 48 || value.length() > 4096
                || !value.matches("^r3admin1\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+$")) {
            throw AdminReadException.invalidRequest();
        }
        String[] parts = value.split("\\.", -1);
        try {
            byte[] supplied = DECODER.decode(parts[2]);
            if (!MessageDigest.isEqual(mac(parts[1]), supplied)) {
                throw AdminReadException.staleCursor();
            }
            ObjectNode payload = (ObjectNode) JSON.readTree(DECODER.decode(parts[1]));
            if (payload.size() != 7
                    || !"admin-control.v1alpha1".equals(payload.path("contractVersion").asText())
                    || !expectedModule.wireValue().equals(payload.path("module").asText())
                    || !expectedRevision.equals(payload.path("queryRevision").asText())
                    || !"hmac-sha256.v1".equals(payload.path("codecRevision").asText())) {
                throw AdminReadException.staleCursor();
            }
            int limit = payload.path("limit").asInt(-1);
            String sortKey = payload.path("lastSortKey").asText(null);
            String resourceId = payload.path("lastResourceId").asText(null);
            if (limit < 1 || limit > 100 || sortKey == null || resourceId == null) {
                throw AdminReadException.staleCursor();
            }
            return new Cursor(expectedModule, expectedRevision, sortKey, resourceId, limit);
        } catch (AdminReadException exception) {
            throw exception;
        } catch (Exception exception) {
            throw AdminReadException.staleCursor();
        }
    }

    private byte[] mac(String encodedPayload) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            return mac.doFinal(encodedPayload.getBytes(StandardCharsets.US_ASCII));
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException("admin.cursor_hmac_unavailable", exception);
        }
    }

    public record Cursor(
            AdminModule module,
            String queryRevision,
            String lastSortKey,
            String lastResourceId,
            int limit) {}
}
