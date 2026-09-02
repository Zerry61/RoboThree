package com.robothree.central.skilllifecycle.application;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.github.junrar.Archive;
import com.github.junrar.rarfile.FileHeader;
import com.robothree.central.shared.json.CanonicalJson;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.TreeMap;
import java.util.regex.Pattern;
import java.util.zip.GZIPInputStream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

/** Validates one bounded Skill archive and emits a deterministic canonical ZIP package. */
public final class SkillArchiveAdmission {
    public static final int MAX_ARCHIVE_BYTES = 200 * 1024 * 1024;
    public static final int MAX_ENTRY_BYTES = 32 * 1024 * 1024;
    public static final long MAX_EXPANDED_BYTES = 512L * 1024 * 1024;
    public static final int MAX_FILE_COUNT = 4096;
    private static final int MAX_COMPRESSION_RATIO = 100;
    private static final int MAX_SKILL_MARKDOWN_BYTES = 128 * 1024;
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Pattern TECHNICAL_NAME = Pattern.compile(
            "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$");
    private static final Set<String> DEPENDENCY_FILES = Set.of(
            "package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock",
            "pyproject.toml", "pipfile", "pipfile.lock");
    private static final Set<String> EXECUTABLE_EXTENSIONS = Set.of(
            "exe", "dll", "dylib", "so", "class", "jar", "wasm", "bin", "img", "dmg");
    private static final Set<String> ARCHIVE_EXTENSIONS = Set.of(
            "zip", "rar", "tar", "tgz", "gz", "7z");

    private final Clock clock;

    public SkillArchiveAdmission(Clock clock) {
        this.clock = clock;
    }

    public SkillLifecycleStore.PackageBlob admit(byte[] archiveBytes, Format format) {
        if (archiveBytes == null || archiveBytes.length == 0
                || archiveBytes.length > MAX_ARCHIVE_BYTES || format == null) {
            throw SkillLifecycleException.packageInvalid();
        }
        Accumulator files = new Accumulator(archiveBytes.length);
        try {
            switch (format) {
                case ZIP -> readZip(archiveBytes, files);
                case RAR -> readRar(archiveBytes, files);
                case TAR_GZ, TGZ -> readTarGz(archiveBytes, files);
            }
            return canonicalize(files, archiveBytes);
        } catch (SkillLifecycleException exception) {
            throw exception;
        } catch (Exception exception) {
            throw SkillLifecycleException.packageInvalid();
        }
    }

    /** Streams one upload through a private random staging file before bounded admission. */
    public SkillLifecycleStore.PackageBlob admit(
            InputStream source,
            long declaredByteLength,
            String expectedArchiveDigest,
            Format format) {
        if (source == null || declaredByteLength < 1 || declaredByteLength > MAX_ARCHIVE_BYTES
                || expectedArchiveDigest == null
                || !expectedArchiveDigest.matches("^sha256:[a-f0-9]{64}$")) {
            throw SkillLifecycleException.packageInvalid();
        }
        Path stagingRoot = null;
        Path stagedArchive = null;
        try {
            stagingRoot = Files.createTempDirectory("robothree-skill-upload-");
            try {
                Files.setPosixFilePermissions(stagingRoot, PosixFilePermissions.fromString("rwx------"));
            } catch (UnsupportedOperationException ignored) {
                // Windows ACLs are inherited from the service-private temp root.
            }
            stagedArchive = stagingRoot.resolve("archive.bin");
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            long copied = 0;
            try (var output = Files.newOutputStream(stagedArchive)) {
                byte[] buffer = new byte[64 * 1024];
                int count;
                while ((count = source.read(buffer)) != -1) {
                    copied = Math.addExact(copied, count);
                    if (copied > declaredByteLength || copied > MAX_ARCHIVE_BYTES) {
                        throw SkillLifecycleException.packageInvalid();
                    }
                    digest.update(buffer, 0, count);
                    output.write(buffer, 0, count);
                }
            }
            String actualDigest = "sha256:" + HexFormat.of().formatHex(digest.digest());
            if (copied != declaredByteLength || !actualDigest.equals(expectedArchiveDigest)) {
                throw SkillLifecycleException.packageInvalid();
            }
            return admit(Files.readAllBytes(stagedArchive), format);
        } catch (SkillLifecycleException exception) {
            throw exception;
        } catch (Exception exception) {
            throw SkillLifecycleException.packageInvalid();
        } finally {
            if (stagedArchive != null) {
                try { Files.deleteIfExists(stagedArchive); } catch (IOException ignored) { }
            }
            if (stagingRoot != null) {
                try { Files.deleteIfExists(stagingRoot); } catch (IOException ignored) { }
            }
        }
    }

    private static void readZip(byte[] bytes, Accumulator files) throws Exception {
        validateZipCentralDirectory(bytes);
        try (ZipInputStream input = new ZipInputStream(new ByteArrayInputStream(bytes),
                StandardCharsets.UTF_8)) {
            ZipEntry entry;
            while ((entry = input.getNextEntry()) != null) {
                if (entry.isDirectory()) continue;
                if (entry.getMethod() != ZipEntry.STORED && entry.getMethod() != ZipEntry.DEFLATED) {
                    throw SkillLifecycleException.packageInvalid();
                }
                long declared = entry.getSize();
                long compressed = entry.getCompressedSize();
                files.add(entry.getName(), declared, compressed,
                        sink -> copyBounded(input, sink, declared));
                input.closeEntry();
            }
        }
    }

    private static void validateZipCentralDirectory(byte[] bytes) {
        int eocd = -1;
        int lowerBound = Math.max(0, bytes.length - 65_557);
        for (int offset = bytes.length - 22; offset >= lowerBound; offset--) {
            if (u32(bytes, offset) == 0x06054b50L) {
                eocd = offset;
                break;
            }
        }
        if (eocd < 0 || u16(bytes, eocd + 4) != 0 || u16(bytes, eocd + 6) != 0) {
            throw SkillLifecycleException.packageInvalid();
        }
        int entryCount = u16(bytes, eocd + 10);
        long centralSize = u32(bytes, eocd + 12);
        long centralOffset = u32(bytes, eocd + 16);
        if (entryCount == 0xffff || centralSize == 0xffffffffL || centralOffset == 0xffffffffL
                || centralOffset + centralSize > eocd) {
            throw SkillLifecycleException.packageInvalid();
        }
        int cursor = Math.toIntExact(centralOffset);
        for (int index = 0; index < entryCount; index++) {
            if (cursor < 0 || cursor + 46 > bytes.length
                    || u32(bytes, cursor) != 0x02014b50L) {
                throw SkillLifecycleException.packageInvalid();
            }
            int flags = u16(bytes, cursor + 8);
            int madeBySystem = bytes[cursor + 5] & 0xff;
            long externalAttributes = u32(bytes, cursor + 38);
            int unixMode = (int) (externalAttributes >>> 16);
            int fileType = unixMode & 0170000;
            if ((flags & 0x1) != 0 || (madeBySystem == 3
                    && fileType != 0 && fileType != 0100000 && fileType != 0040000)) {
                throw SkillLifecycleException.packageInvalid();
            }
            int nameLength = u16(bytes, cursor + 28);
            int extraLength = u16(bytes, cursor + 30);
            int commentLength = u16(bytes, cursor + 32);
            cursor = Math.addExact(cursor,
                    Math.addExact(46, Math.addExact(nameLength, Math.addExact(extraLength, commentLength))));
        }
        if (cursor != centralOffset + centralSize) {
            throw SkillLifecycleException.packageInvalid();
        }
    }

    private static void readRar(byte[] bytes, Accumulator files) throws Exception {
        if (!rarSignatureAtStart(bytes)) throw SkillLifecycleException.packageInvalid();
        try (Archive archive = new Archive(new ByteArrayInputStream(bytes))) {
            if (archive.isEncrypted() || archive.isPasswordProtected()
                    || archive.getMainHeader() == null
                    || archive.getMainHeader().isMultiVolume()) {
                throw SkillLifecycleException.packageInvalid();
            }
            FileHeader header;
            while ((header = archive.nextFileHeader()) != null) {
                if (header.isDirectory()) continue;
                if (header.isEncrypted() || header.isSplitBefore() || header.isSplitAfter()
                        || header.isBrokenHeader() || header.getRedirection() != null
                        || header.isUnpSizeUnknown()
                        || header.getRar5WinSize() > (64L * 1024 * 1024)) {
                    throw SkillLifecycleException.packageInvalid();
                }
                FileHeader current = header;
                files.add(header.getFileName(), header.getFullUnpackSize(),
                        header.getFullPackSize(), sink -> archive.extractFile(current, sink));
            }
        }
    }

    private static void readTarGz(byte[] bytes, Accumulator files) throws Exception {
        try (InputStream gzip = new GZIPInputStream(new ByteArrayInputStream(bytes))) {
            byte[] header = new byte[512];
            while (true) {
                readFully(gzip, header);
                if (allZero(header)) break;
                validateTarChecksum(header);
                String name = tarString(header, 0, 100);
                String prefix = tarString(header, 345, 155);
                if (!prefix.isEmpty()) name = prefix + "/" + name;
                long size = tarOctal(header, 124, 12);
                int type = header[156] & 0xff;
                if (type == '5') {
                    skipExactly(gzip, padded(size));
                    continue;
                }
                if (type != 0 && type != '0') throw SkillLifecycleException.packageInvalid();
                long declared = size;
                files.add(name, declared, -1, sink -> copyExactly(gzip, sink, declared));
                skipExactly(gzip, padded(size) - size);
            }
        }
    }

    private SkillLifecycleStore.PackageBlob canonicalize(Accumulator source, byte[] archiveBytes)
            throws IOException {
        if (source.entries.isEmpty()) throw SkillLifecycleException.packageInvalid();
        List<EntryBytes> ordered = source.entries.values().stream()
                .sorted(Comparator.comparing(EntryBytes::path, SkillArchiveAdmission::utf8Compare))
                .toList();
        List<EntryBytes> skillFiles = ordered.stream()
                .filter(entry -> entry.path().equals("SKILL.md")
                        || entry.path().endsWith("/SKILL.md"))
                .toList();
        if (skillFiles.size() != 1) throw SkillLifecycleException.packageInvalid();
        String root = skillFiles.getFirst().path().equals("SKILL.md") ? ""
                : skillFiles.getFirst().path().substring(
                        0, skillFiles.getFirst().path().length() - "SKILL.md".length());
        List<EntryBytes> logical = new ArrayList<>();
        for (EntryBytes entry : ordered) {
            if (!entry.path().startsWith(root)) {
                throw SkillLifecycleException.packageInvalid();
            }
            String relative = entry.path().substring(root.length());
            if (relative.isEmpty()) continue;
            validateLogicalContent(relative, entry.bytes());
            logical.add(new EntryBytes(relative, entry.bytes(), entry.digest()));
        }
        if (logical.stream().filter(entry -> entry.path().equals("SKILL.md")).count() != 1) {
            throw SkillLifecycleException.packageInvalid();
        }
        EntryBytes skill = logical.stream().filter(entry -> entry.path().equals("SKILL.md"))
                .findFirst().orElseThrow(SkillLifecycleException::packageInvalid);
        if (skill.bytes().length > MAX_SKILL_MARKDOWN_BYTES) {
            throw SkillLifecycleException.packageInvalid();
        }
        String markdown = strictUtf8(skill.bytes());
        if (markdown.startsWith("\uFEFF")) throw SkillLifecycleException.packageInvalid();
        String technicalName = frontmatter(markdown, "name");
        String description = frontmatter(markdown, "description");
        if (!TECHNICAL_NAME.matcher(technicalName).matches()
                || technicalName.length() > 64
                || description.isBlank() || description.length() > 500
                || markdownBody(markdown).isBlank()) {
            throw SkillLifecycleException.packageInvalid();
        }
        logical.sort(Comparator.comparing(EntryBytes::path, SkillArchiveAdmission::utf8Compare));
        ObjectNode manifest = JSON.createObjectNode();
        manifest.put("format", "robothree.skill-package.v1");
        manifest.put("technicalName", technicalName);
        ArrayNode manifestFiles = manifest.putArray("files");
        for (EntryBytes entry : logical) {
            ObjectNode item = manifestFiles.addObject();
            item.put("path", entry.path());
            item.put("byteLength", entry.bytes().length);
            item.put("sha256", entry.digest());
        }
        String manifestJson = CanonicalJson.canonicalize(manifest);
        byte[] canonicalZip = canonicalZip(logical);
        return new SkillLifecycleStore.PackageBlob(
                digest(canonicalZip), digest(archiveBytes),
                digest(manifestJson.getBytes(StandardCharsets.UTF_8)), skill.digest(),
                technicalName, logical.size(),
                logical.stream().mapToLong(entry -> entry.bytes().length).sum(), canonicalZip,
                clock.instant());
    }

    private static byte[] canonicalZip(List<EntryBytes> files) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(bytes, StandardCharsets.UTF_8)) {
            zip.setLevel(9);
            for (EntryBytes file : files) {
                ZipEntry entry = new ZipEntry(file.path());
                entry.setTime(0);
                entry.setExtra(null);
                entry.setComment(null);
                zip.putNextEntry(entry);
                zip.write(file.bytes());
                zip.closeEntry();
            }
        }
        return bytes.toByteArray();
    }

    private static void validateLogicalContent(String path, byte[] bytes) {
        String lower = path.toLowerCase(Locale.ROOT);
        String base = lower.substring(lower.lastIndexOf('/') + 1);
        if (lower.startsWith("node_modules/") || lower.contains("/node_modules/")
                || lower.startsWith(".venv/") || lower.contains("/.venv/")
                || lower.startsWith("venv/") || lower.contains("/venv/")
                || lower.startsWith("vendor/") || lower.contains("/vendor/")
                || DEPENDENCY_FILES.contains(base) || base.startsWith("requirements")
                || base.startsWith("pipfile") || lower.contains("mcp-server")
                || lower.contains("mcp_connection")) {
            throw SkillLifecycleException.packageInvalid();
        }
        String extension = base.contains(".") ? base.substring(base.lastIndexOf('.') + 1) : "";
        if (EXECUTABLE_EXTENSIONS.contains(extension)
                || ARCHIVE_EXTENSIONS.contains(extension)
                || looksExecutable(bytes)) {
            throw SkillLifecycleException.packageInvalid();
        }
    }

    private static boolean looksExecutable(byte[] bytes) {
        return starts(bytes, new byte[] {0x7f, 'E', 'L', 'F'})
                || starts(bytes, new byte[] {'M', 'Z'})
                || starts(bytes, new byte[] {(byte) 0xca, (byte) 0xfe, (byte) 0xba, (byte) 0xbe})
                || starts(bytes, new byte[] {(byte) 0xcf, (byte) 0xfa, (byte) 0xed, (byte) 0xfe})
                || starts(bytes, new byte[] {(byte) 0xfe, (byte) 0xed, (byte) 0xfa, (byte) 0xcf});
    }

    private static String frontmatter(String markdown, String key) {
        if (!markdown.startsWith("---\n")) throw SkillLifecycleException.packageInvalid();
        int end = markdown.indexOf("\n---\n", 4);
        if (end < 0) throw SkillLifecycleException.packageInvalid();
        String prefix = key + ":";
        for (String line : markdown.substring(4, end).split("\n", -1)) {
            if (line.startsWith(prefix)) {
                String value = line.substring(prefix.length()).trim();
                if ((value.startsWith("\"") && value.endsWith("\""))
                        || (value.startsWith("'") && value.endsWith("'"))) {
                    value = value.substring(1, value.length() - 1);
                }
                return value;
            }
        }
        throw SkillLifecycleException.packageInvalid();
    }

    private static String markdownBody(String markdown) {
        int end = markdown.indexOf("\n---\n", 4);
        return end < 0 ? "" : markdown.substring(end + 5).trim();
    }

    private static String strictUtf8(byte[] bytes) {
        try {
            return StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(bytes)).toString();
        } catch (CharacterCodingException exception) {
            throw SkillLifecycleException.packageInvalid();
        }
    }

    private static String normalizePath(String raw) {
        if (raw == null || raw.isBlank() || raw.indexOf('\0') >= 0
                || raw.startsWith("/") || raw.startsWith("\\")
                || raw.matches("^[A-Za-z]:.*") || raw.contains("://")) {
            throw SkillLifecycleException.packageInvalid();
        }
        String slash = raw.replace('\\', '/');
        List<String> segments = new ArrayList<>();
        for (String segment : slash.split("/", -1)) {
            if (segment.isEmpty() || segment.equals(".")) continue;
            if (segment.equals("..") || segment.chars().anyMatch(Character::isISOControl)) {
                throw SkillLifecycleException.packageInvalid();
            }
            segments.add(segment);
        }
        if (segments.isEmpty()) throw SkillLifecycleException.packageInvalid();
        return String.join("/", segments);
    }

    private static void copyBounded(InputStream input, ByteArrayOutputStream output, long declared)
            throws IOException {
        byte[] buffer = new byte[8192];
        int read;
        while ((read = input.read(buffer)) != -1) {
            if ((long) output.size() + read > MAX_ENTRY_BYTES) {
                throw SkillLifecycleException.packageInvalid();
            }
            output.write(buffer, 0, read);
        }
        if (declared >= 0 && output.size() != declared) {
            throw SkillLifecycleException.packageInvalid();
        }
    }

    private static void copyExactly(InputStream input, ByteArrayOutputStream output, long count)
            throws IOException {
        if (count < 0 || count > MAX_ENTRY_BYTES) throw SkillLifecycleException.packageInvalid();
        byte[] buffer = new byte[8192];
        long remaining = count;
        while (remaining > 0) {
            int read = input.read(buffer, 0, (int) Math.min(buffer.length, remaining));
            if (read < 0) throw SkillLifecycleException.packageInvalid();
            output.write(buffer, 0, read);
            remaining -= read;
        }
    }

    private static void readFully(InputStream input, byte[] target) throws IOException {
        int offset = 0;
        while (offset < target.length) {
            int read = input.read(target, offset, target.length - offset);
            if (read < 0) throw SkillLifecycleException.packageInvalid();
            offset += read;
        }
    }

    private static void skipExactly(InputStream input, long count) throws IOException {
        long remaining = count;
        while (remaining > 0) {
            long skipped = input.skip(remaining);
            if (skipped <= 0) {
                if (input.read() < 0) throw SkillLifecycleException.packageInvalid();
                skipped = 1;
            }
            remaining -= skipped;
        }
    }

    private static long padded(long size) {
        return ((size + 511) / 512) * 512;
    }

    private static String tarString(byte[] header, int offset, int length) {
        int end = offset;
        while (end < offset + length && header[end] != 0) end++;
        return strictUtf8(java.util.Arrays.copyOfRange(header, offset, end));
    }

    private static long tarOctal(byte[] header, int offset, int length) {
        String raw = new String(header, offset, length, StandardCharsets.US_ASCII)
                .replace("\0", "").trim();
        try {
            return raw.isEmpty() ? 0 : Long.parseLong(raw, 8);
        } catch (NumberFormatException exception) {
            throw SkillLifecycleException.packageInvalid();
        }
    }

    private static void validateTarChecksum(byte[] header) {
        long expected = tarOctal(header, 148, 8);
        long actual = 0;
        for (int index = 0; index < header.length; index++) {
            actual += index >= 148 && index < 156 ? 32 : header[index] & 0xff;
        }
        if (expected != actual) throw SkillLifecycleException.packageInvalid();
    }

    private static boolean allZero(byte[] bytes) {
        for (byte value : bytes) if (value != 0) return false;
        return true;
    }

    private static boolean rarSignatureAtStart(byte[] bytes) {
        return starts(bytes, new byte[] {'R', 'a', 'r', '!', 0x1a, 0x07, 0x00})
                || starts(bytes, new byte[] {'R', 'a', 'r', '!', 0x1a, 0x07, 0x01, 0x00});
    }

    private static boolean starts(byte[] bytes, byte[] prefix) {
        if (bytes.length < prefix.length) return false;
        for (int index = 0; index < prefix.length; index++) {
            if (bytes[index] != prefix[index]) return false;
        }
        return true;
    }

    private static int u16(byte[] bytes, int offset) {
        if (offset < 0 || offset + 2 > bytes.length) throw SkillLifecycleException.packageInvalid();
        return (bytes[offset] & 0xff) | ((bytes[offset + 1] & 0xff) << 8);
    }

    private static long u32(byte[] bytes, int offset) {
        if (offset < 0 || offset + 4 > bytes.length) throw SkillLifecycleException.packageInvalid();
        return (bytes[offset] & 0xffL) | ((bytes[offset + 1] & 0xffL) << 8)
                | ((bytes[offset + 2] & 0xffL) << 16)
                | ((bytes[offset + 3] & 0xffL) << 24);
    }

    private static int utf8Compare(String left, String right) {
        return java.util.Arrays.compareUnsigned(
                left.getBytes(StandardCharsets.UTF_8), right.getBytes(StandardCharsets.UTF_8));
    }

    private static String digest(byte[] bytes) {
        try {
            return "sha256:" + HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    public enum Format { ZIP, RAR, TAR_GZ, TGZ }

    private record EntryBytes(String path, byte[] bytes, String digest) {
        private EntryBytes {
            bytes = bytes.clone();
        }

        @Override public byte[] bytes() { return bytes.clone(); }
    }

    @FunctionalInterface
    private interface EntryWriter { void write(ByteArrayOutputStream output) throws Exception; }

    private static final class Accumulator {
        private final int archiveSize;
        private final TreeMap<String, EntryBytes> entries = new TreeMap<>();
        private final Set<String> foldedPaths = new HashSet<>();
        private long expanded;

        private Accumulator(int archiveSize) { this.archiveSize = archiveSize; }

        private void add(String rawPath, long declaredSize, long compressedSize,
                EntryWriter writer) throws Exception {
            String path = normalizePath(rawPath);
            String folded = path.toLowerCase(Locale.ROOT);
            if (entries.containsKey(path) || !foldedPaths.add(folded)
                    || entries.size() >= MAX_FILE_COUNT || declaredSize > MAX_ENTRY_BYTES
                    || declaredSize < -1) {
                throw SkillLifecycleException.packageInvalid();
            }
            if (compressedSize > 0 && declaredSize > compressedSize * MAX_COMPRESSION_RATIO) {
                throw SkillLifecycleException.packageInvalid();
            }
            ByteArrayOutputStream output = new ByteArrayOutputStream(
                    declaredSize > 0 ? (int) Math.min(declaredSize, MAX_ENTRY_BYTES) : 1024);
            writer.write(output);
            if (output.size() > MAX_ENTRY_BYTES || (declaredSize >= 0 && output.size() != declaredSize)) {
                throw SkillLifecycleException.packageInvalid();
            }
            expanded += output.size();
            if (expanded > MAX_EXPANDED_BYTES
                    || (archiveSize > 0 && expanded > (long) archiveSize * MAX_COMPRESSION_RATIO)) {
                throw SkillLifecycleException.packageInvalid();
            }
            byte[] bytes = output.toByteArray();
            entries.put(path, new EntryBytes(path, bytes, digest(bytes)));
        }
    }
}
