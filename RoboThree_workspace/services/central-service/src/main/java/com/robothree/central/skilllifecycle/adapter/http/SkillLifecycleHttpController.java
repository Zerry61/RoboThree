package com.robothree.central.skilllifecycle.adapter.http;

import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.shared.adapter.http.EnterpriseBearerTokenFilter;
import com.robothree.central.skilllifecycle.application.InternalTrialSkillLifecycleTokenAuthorizer;
import com.robothree.central.skilllifecycle.application.AdminSkillDraftTestService;
import com.robothree.central.skilllifecycle.application.SkillArchiveAdmission;
import com.robothree.central.skilllifecycle.application.SkillLifecycleAuthority;
import com.robothree.central.skilllifecycle.application.SkillLifecycleException;
import com.robothree.central.skilllifecycle.application.SkillLifecycleProjectionService;
import com.robothree.central.skilllifecycle.application.SkillLifecycleStore;
import java.util.UUID;
import java.util.Base64;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/** Private authenticated pull/creator surface consumed only by Core. */
@RestController
@Profile({"development", "test"})
@ConditionalOnProperty(name = "robothree.skill-lifecycle.internal-trial-enabled",
        havingValue = "true")
@RequestMapping(path = "/internal-trial/v1/skill-lifecycle")
public final class SkillLifecycleHttpController {
    private final SkillLifecycleAuthority authority;
    private final SkillLifecycleProjectionService projections;
    private final InternalTrialSkillLifecycleTokenAuthorizer tokens;
    private final SkillArchiveAdmission archives;
    private final AdminSkillDraftTestService adminTests;

    public SkillLifecycleHttpController(
            SkillLifecycleAuthority authority,
            SkillLifecycleProjectionService projections,
            InternalTrialSkillLifecycleTokenAuthorizer tokens,
            SkillArchiveAdmission archives,
            AdminSkillDraftTestService adminTests) {
        this.authority = authority;
        this.projections = projections;
        this.tokens = tokens;
        this.archives = archives;
        this.adminTests = adminTests;
    }

    @PostMapping(path = "/drafts/sync", consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ObjectNode> syncDraft(
            @RequestPart("metadata") String metadataJson,
            @RequestPart("archive") MultipartFile archive,
            @RequestAttribute(EnterpriseBearerTokenFilter.ACCESS_TOKEN_ATTRIBUTE) String token)
            throws Exception {
        InternalTrialSkillLifecycleTokenAuthorizer.Principal principal = tokens.authorize(token);
        ObjectNode command = com.robothree.central.shared.json.CanonicalJson.parseObject(
                metadataJson, 65_536);
        if (!"skill-lifecycle.v1alpha1".equals(text(command, "contractVersion", 64))
                || !"sync_skill_draft".equals(text(command, "kind", 80))) {
            throw SkillLifecycleException.invalid();
        }
        long declaredLength = integer(command, "archiveByteLength");
        if (!"base64".equals(text(command, "archiveTransferEncoding", 16))) {
            throw SkillLifecycleException.packageInvalid();
        }
        long encodedLength = Math.multiplyExact(Math.floorDiv(declaredLength + 2L, 3L), 4L);
        if (declaredLength < 1 || declaredLength > SkillArchiveAdmission.MAX_ARCHIVE_BYTES
                || archive.isEmpty() || archive.getSize() != encodedLength) {
            throw SkillLifecycleException.packageInvalid();
        }
        String expectedDigest = text(command, "archiveDigest", 71);
        SkillArchiveAdmission.Format format = switch (text(command, "archiveFormat", 16)) {
            case "zip" -> SkillArchiveAdmission.Format.ZIP;
            case "tar_gz" -> SkillArchiveAdmission.Format.TAR_GZ;
            case "tgz" -> SkillArchiveAdmission.Format.TGZ;
            default -> throw SkillLifecycleException.packageInvalid();
        };
        var metadata = command.get("material");
        if (!(metadata instanceof ObjectNode material)) throw SkillLifecycleException.invalid();
        String expected = command.hasNonNull("expectedDraftRevision")
                ? text(command, "expectedDraftRevision", 71) : null;
        return ok(authority.saveDraft(
                new SkillLifecycleAuthority.CommandContext(
                        uuid(command, "commandId"), uuid(command, "correlationId")),
                archives.admit(Base64.getDecoder().wrap(archive.getInputStream()),
                        declaredLength, expectedDigest, format),
                material, principal.creatorSubject(),
                "personal_creator", expected));
    }

    @GetMapping(path = "/drafts", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ObjectNode> listDrafts(
            @RequestAttribute(EnterpriseBearerTokenFilter.ACCESS_TOKEN_ATTRIBUTE) String token) {
        return ok(projections.listCreatorDrafts(tokens.authorize(token).creatorSubject()));
    }

    @GetMapping(path = "/drafts/{skillId}", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ObjectNode> getDraft(
            @PathVariable String skillId,
            @RequestAttribute(EnterpriseBearerTokenFilter.ACCESS_TOKEN_ATTRIBUTE) String token) {
        return ok(projections.getCreatorDraft(
                skillId, tokens.authorize(token).creatorSubject()));
    }

    @PostMapping(path = "/commands", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ObjectNode> command(
            @RequestBody ObjectNode command,
            @RequestAttribute(EnterpriseBearerTokenFilter.ACCESS_TOKEN_ATTRIBUTE) String token) {
        InternalTrialSkillLifecycleTokenAuthorizer.Principal principal = tokens.authorize(token);
        if (!"skill-lifecycle.v1alpha1".equals(text(command, "contractVersion", 64))) {
            throw SkillLifecycleException.invalid();
        }
        String kind = text(command, "kind", 80);
        SkillLifecycleAuthority.CommandContext context = new SkillLifecycleAuthority.CommandContext(
                uuid(command, "commandId"), uuid(command, "correlationId"));
        ObjectNode result = switch (kind) {
            case "submit_skill_draft" -> authority.submit(context,
                    text(command, "skillId", 200), text(command, "expectedDraftRevision", 71),
                    text(command, "semanticVersion", 32), text(command, "changeSummary", 2000),
                    principal.creatorSubject());
            case "withdraw_skill_submission" -> authority.withdraw(context,
                    uuid(command, "submissionId"),
                    text(command, "expectedSubmissionRevision", 71),
                    principal.creatorSubject());
            case "begin_skill_draft_test" -> authority.beginTest(context,
                    text(command, "skillId", 200), text(command, "expectedDraftRevision", 71),
                    text(command, "taskId", 160), principal.creatorSubject());
            case "complete_skill_draft_test" -> {
                String testResult = text(command, "result", 16);
                if (!testResult.equals("passed") && !testResult.equals("failed")) {
                    throw SkillLifecycleException.invalid();
                }
                yield authority.completeTest(context,
                        text(command, "skillId", 200), text(command, "expectedDraftRevision", 71),
                        text(command, "taskId", 160), testResult.equals("passed"),
                        command.hasNonNull("safeReason") ? text(command, "safeReason", 1000) : null,
                        text(command, "resultDigest", 71), principal.creatorSubject());
            }
            default -> throw SkillLifecycleException.invalid();
        };
        return ok(result);
    }

    @GetMapping(path = "/published-releases", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ObjectNode> published(
            @RequestAttribute(EnterpriseBearerTokenFilter.ACCESS_TOKEN_ATTRIBUTE) String token) {
        tokens.authorize(token);
        return ok(projections.listPublishedReleases());
    }

    @GetMapping(path = "/admin-test-requests", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ObjectNode> listAdminTestRequests(
            @RequestAttribute(EnterpriseBearerTokenFilter.ACCESS_TOKEN_ATTRIBUTE) String token) {
        tokens.authorize(token);
        return ok(adminTests.listAcceptedForCore(8));
    }

    @GetMapping(path = "/admin-test-recovery", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ObjectNode> listRunningAdminTestRequests(
            @RequestAttribute(EnterpriseBearerTokenFilter.ACCESS_TOKEN_ATTRIBUTE) String token) {
        tokens.authorize(token);
        return ok(adminTests.listRunningForCore(64));
    }

    @GetMapping(path = "/admin-test-requests/{operationId}",
            produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ObjectNode> queryAdminTestRequest(
            @PathVariable UUID operationId,
            @RequestAttribute(EnterpriseBearerTokenFilter.ACCESS_TOKEN_ATTRIBUTE) String token) {
        tokens.authorize(token);
        return ok(adminTests.query(operationId));
    }

    @PostMapping(path = "/admin-test-requests/{operationId}/claim",
            produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ObjectNode> claimAdminTestRequest(
            @PathVariable UUID operationId,
            @RequestBody ObjectNode command,
            @RequestAttribute(EnterpriseBearerTokenFilter.ACCESS_TOKEN_ATTRIBUTE) String token) {
        tokens.authorize(token);
        return ok(adminTests.claim(operationId, text(command, "taskId", 160)));
    }

    @PostMapping(path = "/admin-test-requests/{operationId}/complete",
            produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ObjectNode> completeAdminTestRequest(
            @PathVariable UUID operationId,
            @RequestBody ObjectNode command,
            @RequestAttribute(EnterpriseBearerTokenFilter.ACCESS_TOKEN_ATTRIBUTE) String token) {
        tokens.authorize(token);
        String result = text(command, "result", 16);
        if (!result.equals("passed") && !result.equals("failed")) {
            throw SkillLifecycleException.invalid();
        }
        return ok(adminTests.complete(operationId, text(command, "taskId", 160),
                result.equals("passed"), command.hasNonNull("safeReason")
                        ? text(command, "safeReason", 1000) : null,
                text(command, "resultDigest", 71)));
    }

    @GetMapping(path = "/published-releases/{skillId}/{releaseRevision}/{packageDigest}",
            produces = "application/zip")
    public ResponseEntity<byte[]> download(
            @PathVariable String skillId,
            @PathVariable String releaseRevision,
            @PathVariable String packageDigest,
            @RequestAttribute(EnterpriseBearerTokenFilter.ACCESS_TOKEN_ATTRIBUTE) String token) {
        tokens.authorize(token);
        SkillLifecycleStore.PackageBlob pack = projections.packageForRelease(
                skillId, releaseRevision, packageDigest);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=skill-package.zip")
                .header("X-RoboThree-Package-Digest", pack.packageDigest())
                .header("X-RoboThree-Manifest-Digest", pack.manifestDigest())
                .contentLength(pack.canonicalZipBytes().length)
                .body(pack.canonicalZipBytes());
    }

    @GetMapping(path = "/admin-test-requests/{operationId}/package",
            produces = "application/zip")
    public ResponseEntity<byte[]> downloadAdminTestPackage(
            @PathVariable UUID operationId,
            @RequestAttribute(EnterpriseBearerTokenFilter.ACCESS_TOKEN_ATTRIBUTE) String token) {
        tokens.authorize(token);
        ObjectNode operation = adminTests.query(operationId);
        SkillLifecycleStore.PackageBlob pack = projections.packageForDraft(
                operation.path("skillId").asText(), operation.path("targetRevision").asText());
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=skill-test.zip")
                .header("X-RoboThree-Package-Digest", pack.packageDigest())
                .header("X-RoboThree-Manifest-Digest", pack.manifestDigest())
                .contentLength(pack.canonicalZipBytes().length)
                .body(pack.canonicalZipBytes());
    }

    private static String text(ObjectNode value, String field, int maximum) {
        var node = value.get(field);
        if (node == null || !node.isTextual()) throw SkillLifecycleException.invalid();
        String text = node.textValue().trim();
        if (text.isEmpty() || text.length() > maximum) throw SkillLifecycleException.invalid();
        return text;
    }

    private static UUID uuid(ObjectNode value, String field) {
        try {
            return UUID.fromString(text(value, field, 64));
        } catch (IllegalArgumentException exception) {
            throw SkillLifecycleException.invalid();
        }
    }

    private static long integer(ObjectNode value, String field) {
        var node = value.get(field);
        if (node == null || !node.canConvertToLong()) throw SkillLifecycleException.invalid();
        return node.longValue();
    }

    private static ResponseEntity<ObjectNode> ok(ObjectNode body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }
}
