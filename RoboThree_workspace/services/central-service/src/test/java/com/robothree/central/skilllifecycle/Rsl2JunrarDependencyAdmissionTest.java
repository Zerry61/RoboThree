package com.robothree.central.skilllifecycle;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.github.junrar.Archive;
import com.github.junrar.exception.CorruptHeaderException;
import com.github.junrar.rarfile.FileHeader;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.time.Duration;
import java.util.Base64;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;

/**
 * Dependency-admission proof only. Production archive validation remains gated behind the
 * RSL-2 package-authority batch. Fixtures are byte-identical excerpts from junrar v8.1.0
 * (commit 57091f9ccd43661cf8f12c389917cc24950df707) test resources under the UnRAR License.
 */
class Rsl2JunrarDependencyAdmissionTest {

    private static final byte[] CLEAN_RAR = decode(
            "UmFyIRoHAM+QcwAADQAAAAAAAAB8zXQgkC0ADQAAAAQAAAAD4Tl7zCeTJEEdMwsAtIEAAGZvb1xiYXIudHh0AMAACL8IrvLDGH6f/ZLdiiN04IAjAAAAAAAAAAAAAwAAAAAnkyRBFDADAP1BAABmb2/EPXsAQAcA");
    private static final byte[] PARENT_TRAVERSAL_RAR = decode(
            "UmFyIRoHAM+QcwAADQAAAAAAAAAIi3QAgDcADAAAAAwAAAADGIIPiQAAIVoAMBcApIEAAC4uXC4uXHRtcFxleGlzdGluZy1maWxlT3ZlcndyaXR0ZW4KxD17AEAHAA==");
    private static final byte[] BAD_HEADER_CRC_RAR = decode(
            "UmFyIRoHAM+QcwAADQAAAAAAAAA8mXQggCsAGwAAABsAAAADbrMCHQAIIVwUMAsApIEAAHBheWxvYWQudHh0aGVhZGVyLWNyYy1maXh0dXJlLXBheWxvYWQKxD17AEAHAA==");
    private static final byte[] TRUNCATED_NAME_RAR = decode(
            "UmFyIRoHAM+QcwAADQAAAAAAAAD+t3Qggj8AEgAAABIAAAAD5cTt7A0N8lwdMB8ApIEAAGNhZsOpLXLDqXN1bcOpLeaXpeacrOiqni50eHQAAAB1dGY4LW5hbWUtcGF5bG9hZArEPXsAQAcA");
    private static final byte[] ONE_GIB_DICTIONARY_CLAIM_RAR = decode(
            "UmFyIRoHAQDz4YLrCwEFBwAGAQGAgIAATM4JKiYCAwu8AASAGaSDAh212u2AawEIdGlueS5iaW4KAxPncl5qhOgTEMOgOTRTMvhQM8VeAhWZAI/KCRRApv9MMXl7ofl2VdX2U79xJoP6QwhL3MKTM7VC65Vvg2oV4hwFcpXKEB13VlEDBQQA");

    @Test
    void readsHeadersAndExtractsSynchronouslyToABoundedCallerOwnedSink() throws Exception {
        try (Archive archive = new Archive(new ByteArrayInputStream(CLEAN_RAR))) {
            FileHeader header = archive.nextFileHeader();
            assertThat(header).isNotNull();
            assertThat(header.getFileName()).isEqualTo("foo\\bar.txt");
            assertThat(header.getUnpSize()).isEqualTo(4L);

            ByteArrayOutputStream sink = new ByteArrayOutputStream(4);
            archive.extractFile(header, sink);
            assertThat(sink.toByteArray()).containsExactly('b', 'a', 'z', '\n');

            FileHeader directory = archive.nextFileHeader();
            assertThat(directory).isNotNull();
            assertThat(directory.getFileName()).isEqualTo("foo");
            assertThat(directory.isDirectory()).isTrue();
            assertThat(archive.nextFileHeader()).isNull();
        }
    }

    @Test
    void exposesTraversalBeforeAnyEntryBytesAreWritten() throws Exception {
        try (Archive archive = new Archive(new ByteArrayInputStream(PARENT_TRAVERSAL_RAR))) {
            FileHeader header = archive.nextFileHeader();
            assertThat(header).isNotNull();
            String normalizedName = header.getFileName().replace('\\', '/');
            assertThat(normalizedName).startsWith("../");
        }
    }

    @Test
    void marksBrokenHeaderCrcAndRefusesExtraction() throws Exception {
        try (Archive archive = new Archive(new ByteArrayInputStream(BAD_HEADER_CRC_RAR))) {
            FileHeader header = archive.nextFileHeader();
            assertThat(header).isNotNull();
            assertThat(header.isBrokenHeader()).isTrue();
            assertThatThrownBy(() -> archive.extractFile(header, new ByteArrayOutputStream()))
                    .isExactlyInstanceOf(CorruptHeaderException.class);
        }
    }

    @Test
    void rejectsTruncatedHeaderWithoutProducingAnEntry() {
        assertThatThrownBy(() -> {
            try (Archive ignored = new Archive(new ByteArrayInputStream(TRUNCATED_NAME_RAR))) {
                // Construction/header parsing is the operation under test.
            }
        }).isInstanceOf(Exception.class);
    }

    @Test
    @Timeout(10)
    void oneGibDictionaryClaimDoesNotRequireAnEagerOneGibHeapAllocation() throws Exception {
        org.junit.jupiter.api.Assertions.assertTimeoutPreemptively(Duration.ofSeconds(5), () -> {
            try (Archive archive = new Archive(
                    new ByteArrayInputStream(ONE_GIB_DICTIONARY_CLAIM_RAR))) {
                FileHeader header = archive.nextFileHeader();
                assertThat(header).isNotNull();
                assertThat(header.getRar5WinSize()).isEqualTo(1L << 30);
                ByteArrayOutputStream sink = new ByteArrayOutputStream(3_200);
                archive.extractFile(header, sink);
                assertThat(sink.size()).isEqualTo(3_200);
            }
        });
    }

    private static byte[] decode(String encoded) {
        return Base64.getDecoder().decode(encoded);
    }
}
