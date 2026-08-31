package com.robothree.central.agentlifecycle.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Arrays;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;

class RobotAvatarImageValidatorTest {

    private final RobotAvatarImageValidator validator = new RobotAvatarImageValidator();

    @Test
    void decodesRealPngAndJpegWithoutAdditionalDependencies() throws IOException {
        RobotAvatarImageValidator.ValidatedAvatar png = validator.validate(image("png", 4, 3));
        RobotAvatarImageValidator.ValidatedAvatar jpeg = validator.validate(image("jpeg", 3, 4));

        assertEquals("image/png", png.mediaType());
        assertEquals(4, png.width());
        assertEquals(3, png.height());
        assertEquals("image/jpeg", jpeg.mediaType());
        assertEquals(3, jpeg.width());
        assertEquals(4, jpeg.height());
    }

    @Test
    void rejectsFakeHeadersAndTruncatedContent() throws IOException {
        assertInvalid(new byte[] {(byte) 0x89, 0x50, 0x4e, 0x47});
        byte[] png = image("png", 4, 4);
        assertInvalid(Arrays.copyOf(png, png.length / 2));
    }

    @Test
    void rejectsUnsupportedAndOversizedImages() throws IOException {
        assertInvalid(image("gif", 2, 2));
        assertInvalid(image("png", RobotAvatarImageValidator.MAX_WIDTH + 1, 1));
        assertInvalid(new byte[RobotAvatarImageValidator.MAX_BYTES + 1]);
    }

    private void assertInvalid(byte[] content) {
        IllegalArgumentException exception = assertThrows(
                IllegalArgumentException.class,
                () -> validator.validate(content));
        assertEquals("agentlifecycle.avatar_invalid", exception.getMessage());
    }

    private static byte[] image(String format, int width, int height) throws IOException {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        if (!ImageIO.write(image, format, output)) {
            throw new IOException("test image format is unavailable: " + format);
        }
        return output.toByteArray();
    }
}
