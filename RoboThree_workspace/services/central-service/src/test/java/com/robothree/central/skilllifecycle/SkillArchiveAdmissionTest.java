package com.robothree.central.skilllifecycle;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.robothree.central.skilllifecycle.application.SkillArchiveAdmission;
import com.robothree.central.skilllifecycle.application.SkillLifecycleException;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.zip.CRC32;
import java.util.zip.GZIPOutputStream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;
import org.junit.jupiter.api.Test;

class SkillArchiveAdmissionTest {
    private static final String SKILL = """
            ---
            name: presentation-helper
            description: Reads source material and prepares a concise presentation.
            ---
            Read the authorized source material before producing a presentation.
            """;
    private static final Clock CLOCK = Clock.fixed(
            Instant.parse("2026-09-01T08:00:00Z"), ZoneOffset.UTC);
    private final SkillArchiveAdmission admission = new SkillArchiveAdmission(CLOCK);

    @Test
    void admitsZipAndProducesDeterministicRootNormalizedPackage() throws Exception {
        byte[] archive = zip(Map.of(
                "presentation-helper/SKILL.md", utf8(SKILL),
                "presentation-helper/references/format.md", utf8("Use short headings.")));

        var first = admission.admit(archive, SkillArchiveAdmission.Format.ZIP);
        var second = admission.admit(archive, SkillArchiveAdmission.Format.ZIP);

        assertThat(first.technicalName()).isEqualTo("presentation-helper");
        assertThat(first.fileCount()).isEqualTo(2);
        assertThat(first.expandedByteCount()).isPositive();
        assertThat(first.packageDigest()).isEqualTo(sha256(first.canonicalZipBytes()));
        assertThat(first.packageDigest()).isNotEqualTo(first.manifestDigest());
        assertThat(first.archiveDigest()).isNotEqualTo(first.packageDigest());
        assertThat(first.canonicalZipBytes()).isEqualTo(second.canonicalZipBytes());
        assertThat(zipEntries(first.canonicalZipBytes()))
                .containsExactly("SKILL.md", "references/format.md");
    }

    @Test
    void stagesUploadStreamWithExactLengthAndDigestBeforeAdmission() throws Exception {
        byte[] archive = zip(Map.of("SKILL.md", utf8(SKILL)));

        var result = admission.admit(new ByteArrayInputStream(archive), archive.length,
                sha256(archive), SkillArchiveAdmission.Format.ZIP);

        assertThat(result.archiveDigest()).isEqualTo(sha256(archive));
        assertThatThrownBy(() -> admission.admit(new ByteArrayInputStream(archive),
                archive.length - 1L, sha256(archive), SkillArchiveAdmission.Format.ZIP))
                .isInstanceOf(SkillLifecycleException.class);
        assertThatThrownBy(() -> admission.admit(new ByteArrayInputStream(archive),
                archive.length, "sha256:" + "0".repeat(64), SkillArchiveAdmission.Format.ZIP))
                .isInstanceOf(SkillLifecycleException.class);
    }

    @Test
    void admitsTarGzThroughTheSameCanonicalPackageBoundary() throws Exception {
        byte[] archive = tarGz(Map.of(
                "skill/SKILL.md", utf8(SKILL),
                "skill/references/notes.txt", utf8("bounded")));

        var result = admission.admit(archive, SkillArchiveAdmission.Format.TAR_GZ);

        assertThat(result.technicalName()).isEqualTo("presentation-helper");
        assertThat(zipEntries(result.canonicalZipBytes()))
                .containsExactly("SKILL.md", "references/notes.txt");
    }

    @Test
    void rejectsTraversalDuplicateAndContentOutsideTheSkillRoot() throws Exception {
        assertInvalid(zip(Map.of("../SKILL.md", utf8(SKILL))), SkillArchiveAdmission.Format.ZIP);

        LinkedHashMap<String, byte[]> duplicate = new LinkedHashMap<>();
        duplicate.put("skill/SKILL.md", utf8(SKILL));
        duplicate.put("skill/skill.md", utf8("collision"));
        assertInvalid(zip(duplicate), SkillArchiveAdmission.Format.ZIP);

        assertInvalid(zip(Map.of(
                "skill/SKILL.md", utf8(SKILL),
                "outside.txt", utf8("must not be ignored"))), SkillArchiveAdmission.Format.ZIP);
    }

    @Test
    void rejectsDependencyExecutableAndNestedArchivePayloads() throws Exception {
        assertInvalid(packageWith("package.json", utf8("{}")), SkillArchiveAdmission.Format.ZIP);
        assertInvalid(packageWith("bin/helper", new byte[] {0x7f, 'E', 'L', 'F'}),
                SkillArchiveAdmission.Format.ZIP);
        assertInvalid(packageWith("references/data.zip", zip(Map.of("x.txt", utf8("x")))),
                SkillArchiveAdmission.Format.ZIP);
    }

    @Test
    void rejectsMissingOrMultipleSkillMarkdownAndMalformedMetadata() throws Exception {
        assertInvalid(zip(Map.of("README.md", utf8("hello"))), SkillArchiveAdmission.Format.ZIP);
        assertInvalid(zip(Map.of("a/SKILL.md", utf8(SKILL), "b/SKILL.md", utf8(SKILL))),
                SkillArchiveAdmission.Format.ZIP);
        assertInvalid(zip(Map.of("SKILL.md", utf8("---\nname: Bad Name\n---\nbody"))),
                SkillArchiveAdmission.Format.ZIP);
    }

    @Test
    void rejectsTarLinksAndCorruptChecksums() throws Exception {
        byte[] link = tarGzEntry("skill/link", new byte[0], '2');
        assertInvalid(link, SkillArchiveAdmission.Format.TGZ);

        byte[] corrupt = tarGz(Map.of("skill/SKILL.md", utf8(SKILL)));
        corrupt[20] ^= 0x4;
        assertInvalid(corrupt, SkillArchiveAdmission.Format.TAR_GZ);
    }

    @Test
    void rejectsNonArchivesAndArchiveFormatConfusion() {
        assertInvalid(utf8("not an archive"), SkillArchiveAdmission.Format.ZIP);
        assertInvalid(utf8("not an archive"), SkillArchiveAdmission.Format.RAR);
        assertInvalid(utf8("not an archive"), SkillArchiveAdmission.Format.TGZ);
    }

    private static byte[] packageWith(String path, byte[] bytes) throws Exception {
        LinkedHashMap<String, byte[]> entries = new LinkedHashMap<>();
        entries.put("skill/SKILL.md", utf8(SKILL));
        entries.put("skill/" + path, bytes);
        return zip(entries);
    }

    private static String sha256(byte[] bytes) throws Exception {
        return "sha256:" + java.util.HexFormat.of().formatHex(
                MessageDigest.getInstance("SHA-256").digest(bytes));
    }

    private static byte[] zip(Map<String, byte[]> entries) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(output, StandardCharsets.UTF_8)) {
            for (Map.Entry<String, byte[]> item : entries.entrySet()) {
                ZipEntry entry = new ZipEntry(item.getKey());
                entry.setTime(0);
                zip.putNextEntry(entry);
                zip.write(item.getValue());
                zip.closeEntry();
            }
        }
        return output.toByteArray();
    }

    private static java.util.List<String> zipEntries(byte[] bytes) throws Exception {
        java.util.List<String> names = new java.util.ArrayList<>();
        try (ZipInputStream input = new ZipInputStream(
                new java.io.ByteArrayInputStream(bytes), StandardCharsets.UTF_8)) {
            ZipEntry entry;
            while ((entry = input.getNextEntry()) != null) names.add(entry.getName());
        }
        return names;
    }

    private static byte[] tarGz(Map<String, byte[]> entries) throws Exception {
        ByteArrayOutputStream tar = new ByteArrayOutputStream();
        for (Map.Entry<String, byte[]> item : entries.entrySet()) {
            writeTarEntry(tar, item.getKey(), item.getValue(), '0');
        }
        tar.write(new byte[1024]);
        return gzip(tar.toByteArray());
    }

    private static byte[] tarGzEntry(String path, byte[] bytes, int type) throws Exception {
        ByteArrayOutputStream tar = new ByteArrayOutputStream();
        writeTarEntry(tar, path, bytes, type);
        tar.write(new byte[1024]);
        return gzip(tar.toByteArray());
    }

    private static void writeTarEntry(ByteArrayOutputStream output, String path, byte[] bytes, int type)
            throws Exception {
        byte[] header = new byte[512];
        putAscii(header, 0, 100, path);
        putOctal(header, 100, 8, 0644);
        putOctal(header, 108, 8, 0);
        putOctal(header, 116, 8, 0);
        putOctal(header, 124, 12, bytes.length);
        putOctal(header, 136, 12, 0);
        for (int index = 148; index < 156; index++) header[index] = 32;
        header[156] = (byte) type;
        putAscii(header, 257, 6, "ustar");
        putAscii(header, 263, 2, "00");
        long checksum = 0;
        for (byte value : header) checksum += value & 0xff;
        String encoded = String.format("%06o\0 ", checksum);
        putAscii(header, 148, 8, encoded);
        output.write(header);
        output.write(bytes);
        int padding = (512 - (bytes.length % 512)) % 512;
        output.write(new byte[padding]);
    }

    private static byte[] gzip(byte[] bytes) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        try (GZIPOutputStream gzip = new GZIPOutputStream(output)) {
            gzip.write(bytes);
        }
        return output.toByteArray();
    }

    private static void putAscii(byte[] target, int offset, int length, String value) {
        byte[] bytes = value.getBytes(StandardCharsets.US_ASCII);
        System.arraycopy(bytes, 0, target, offset, Math.min(length, bytes.length));
    }

    private static void putOctal(byte[] target, int offset, int length, long value) {
        putAscii(target, offset, length, String.format("%0" + (length - 1) + "o\0", value));
    }

    private static byte[] utf8(String value) {
        return value.getBytes(StandardCharsets.UTF_8);
    }

    private void assertInvalid(byte[] bytes, SkillArchiveAdmission.Format format) {
        assertThatThrownBy(() -> admission.admit(bytes, format))
                .isInstanceOf(SkillLifecycleException.class)
                .extracting(error -> ((SkillLifecycleException) error).code())
                .isEqualTo("skilllifecycle.package_invalid");
    }
}
