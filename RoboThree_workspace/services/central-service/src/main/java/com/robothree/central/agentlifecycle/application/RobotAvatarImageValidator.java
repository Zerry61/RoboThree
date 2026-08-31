package com.robothree.central.agentlifecycle.application;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Iterator;
import java.util.Locale;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;

/** Exact, dependency-free validation for bounded user-uploaded robot avatars. */
public final class RobotAvatarImageValidator {

    public static final int MAX_BYTES = 2 * 1024 * 1024;
    public static final int MAX_WIDTH = 1024;
    public static final int MAX_HEIGHT = 1024;
    public static final long MAX_PIXELS = 1_048_576L;

    public ValidatedAvatar validate(byte[] content) {
        if (content == null || content.length == 0 || content.length > MAX_BYTES) {
            throw invalid();
        }
        try (ImageInputStream stream = ImageIO.createImageInputStream(
                new ByteArrayInputStream(content))) {
            if (stream == null) {
                throw invalid();
            }
            Iterator<ImageReader> readers = ImageIO.getImageReaders(stream);
            if (!readers.hasNext()) {
                throw invalid();
            }
            ImageReader reader = readers.next();
            try {
                reader.setInput(stream, true, true);
                String format = normalizedFormat(reader.getFormatName());
                int width = reader.getWidth(0);
                int height = reader.getHeight(0);
                if (width < 1
                        || height < 1
                        || width > MAX_WIDTH
                        || height > MAX_HEIGHT
                        || (long) width * height > MAX_PIXELS) {
                    throw invalid();
                }
                BufferedImage decoded = reader.read(0);
                if (decoded == null
                        || decoded.getWidth() != width
                        || decoded.getHeight() != height) {
                    throw invalid();
                }
                return new ValidatedAvatar(format, width, height, sha256(content));
            } finally {
                reader.dispose();
            }
        } catch (IOException | RuntimeException exception) {
            if (exception instanceof IllegalArgumentException
                    && "agentlifecycle.avatar_invalid".equals(exception.getMessage())) {
                throw (IllegalArgumentException) exception;
            }
            throw invalid();
        }
    }

    private static String normalizedFormat(String raw) {
        String format = raw.toLowerCase(Locale.ROOT);
        if (format.equals("png")) {
            return "image/png";
        }
        if (format.equals("jpeg") || format.equals("jpg")) {
            return "image/jpeg";
        }
        throw invalid();
    }

    private static String sha256(byte[] content) {
        try {
            return "sha256:" + HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256").digest(content));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private static IllegalArgumentException invalid() {
        return new IllegalArgumentException("agentlifecycle.avatar_invalid");
    }

    public record ValidatedAvatar(String mediaType, int width, int height, String contentDigest) {
        public ValidatedAvatar {
            if (mediaType == null || contentDigest == null || width < 1 || height < 1) {
                throw new IllegalArgumentException("validated avatar facts are incomplete");
            }
        }
    }
}
