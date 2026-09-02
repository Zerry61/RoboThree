package com.robothree.central.skilllifecycle.adapter.http;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.admincontrol.application.AdminReadRequestAuthorizer;
import com.robothree.central.shared.json.CanonicalJson;
import com.robothree.central.skilllifecycle.application.SkillArchiveAdmission;
import com.robothree.central.skilllifecycle.application.AdminSkillDraftTestService;
import com.robothree.central.skilllifecycle.application.SkillLifecycleAuthority;
import com.robothree.central.skilllifecycle.application.SkillLifecycleException;
import com.robothree.central.skilllifecycle.application.SkillLifecycleProjectionService;
import com.robothree.central.skilllifecycle.application.SkillLifecycleStore;
import java.util.Set;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/** Exact, consumer-driven Admin Skill lifecycle routes. */
@RestController
@Profile({"development", "test"})
@ConditionalOnProperty(name = "robothree.skill-lifecycle.internal-trial-enabled",
        havingValue = "true")
@RequestMapping(path = "/admin/v1alpha2/skill-lifecycle",
        produces = MediaType.APPLICATION_JSON_VALUE)
public final class AdminSkillLifecycleHttpController {
    private static final long MAX_ARCHIVE_BYTES = 200L * 1024 * 1024;
    private final SkillLifecycleAuthority authority;
    private final SkillLifecycleProjectionService projections;
    private final SkillArchiveAdmission archives;
    private final AdminReadRequestAuthorizer authorizer;
    private final AdminSkillDraftTestService tests;

    public AdminSkillLifecycleHttpController(
            SkillLifecycleAuthority authority,
            SkillLifecycleProjectionService projections,
            SkillArchiveAdmission archives,
            AdminSkillDraftTestService tests,
            AdminReadRequestAuthorizer authorizer) {
        this.authority = authority;
        this.projections = projections;
        this.archives = archives;
        this.tests = tests;
        this.authorizer = authorizer;
    }

    @GetMapping("/submissions")
    public ResponseEntity<ObjectNode> listSubmissions(
            @RequestParam(required = false) String state) {
        authorize();
        if (state != null && !Set.of(
                "pending_review", "approved", "rejected", "withdrawn").contains(state)) {
            throw SkillLifecycleException.invalid();
        }
        return ok(projections.listSubmissions(state));
    }

    @GetMapping("/submissions/{submissionId}")
    public ResponseEntity<ObjectNode> getSubmission(@PathVariable UUID submissionId) {
        authorize();
        return ok(projections.getSubmission(submissionId));
    }

    @PostMapping("/submissions/commands")
    public ResponseEntity<ObjectNode> review(@RequestBody ObjectNode command) {
        authorize();
        String kind = text(command, "kind", 80);
        UUID submissionId = uuid(command, "submissionId");
        String expectedRevision = text(command, "expectedSubmissionRevision", 71);
        boolean approve = switch (kind) {
            case "approve_skill_submission" -> true;
            case "reject_skill_submission" -> false;
            default -> throw SkillLifecycleException.invalid();
        };
        String reason = approve ? null : text(command, "reason", 1000);
        return ok(authority.review(context(command), submissionId, expectedRevision, approve,
                "internal-trial-admin", reason));
    }

    @PostMapping(path = "/enterprise/uploads", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ObjectNode> upload(
            @RequestPart("metadata") String metadataJson,
            @RequestPart("archive") MultipartFile archive) throws Exception {
        authorize();
        ObjectNode command = CanonicalJson.parseObject(metadataJson, 65_536);
        requireKind(command, "upload_enterprise_skill_package");
        ObjectNode upload = object(command, "upload");
        long declaredLength = integer(upload, "byteLength");
        if (declaredLength < 1 || declaredLength > MAX_ARCHIVE_BYTES
                || archive.isEmpty() || archive.getSize() != declaredLength
                || archive.getSize() > MAX_ARCHIVE_BYTES) {
            throw SkillLifecycleException.packageInvalid();
        }
        String expectedDigest = text(upload, "archiveDigest", 71);
        SkillArchiveAdmission.Format format = switch (text(upload, "archiveFormat", 16)) {
            case "zip" -> SkillArchiveAdmission.Format.ZIP;
            case "rar" -> SkillArchiveAdmission.Format.RAR;
            case "tar_gz" -> SkillArchiveAdmission.Format.TAR_GZ;
            case "tgz" -> SkillArchiveAdmission.Format.TGZ;
            default -> throw SkillLifecycleException.packageInvalid();
        };
        SkillLifecycleStore.PackageBlob pack = archives.admit(
                archive.getInputStream(), declaredLength, expectedDigest, format);
        ObjectNode draft = CanonicalJson.parseObject("{}", 2);
        draft.put("skillId", "skill.enterprise." + pack.technicalName());
        draft.put("technicalName", pack.technicalName());
        draft.put("displayTitle", pack.technicalName());
        draft.put("displayDescription", "待完善技能展示说明");
        draft.put("primaryFunction", "待完善技能主要功能");
        draft.put("semanticVersion", "0.1.0");
        draft.put("usageScope", "enterprise_all");
        draft.putArray("allowedSubjectIds");
        return ok(authority.saveDraft(context(command), pack, draft,
                "internal-trial-admin", "admin_upload", null));
    }

    @GetMapping("/enterprise/drafts/{skillId}")
    public ResponseEntity<ObjectNode> getEnterpriseDraft(@PathVariable String skillId) {
        authorize();
        return ok(projections.getEnterpriseDraft(skillId));
    }

    @PostMapping("/enterprise/drafts/{skillId}/metadata")
    public ResponseEntity<ObjectNode> updateMetadata(
            @PathVariable String skillId, @RequestBody ObjectNode command) {
        authorize();
        requireKind(command, "update_enterprise_skill_draft_metadata");
        if (!skillId.equals(text(command, "skillId", 200))) {
            throw SkillLifecycleException.invalid();
        }
        ObjectNode metadata = object(command, "metadata");
        validateMetadata(metadata);
        return ok(authority.updateAdminMetadata(context(command), skillId,
                text(command, "expectedDraftRevision", 71), metadata,
                "internal-trial-admin"));
    }

    @PostMapping("/enterprise/drafts/{skillId}/tests")
    public ResponseEntity<ObjectNode> startTest(
            @PathVariable String skillId, @RequestBody ObjectNode command) {
        authorize();
        requireKind(command, "start_enterprise_skill_draft_test");
        if (!skillId.equals(text(command, "skillId", 200))) {
            throw SkillLifecycleException.invalid();
        }
        return ok(tests.start(uuid(command, "commandId"), uuid(command, "correlationId"),
                skillId, text(command, "expectedDraftRevision", 71),
                text(command, "testInput", 65_536)));
    }

    @GetMapping("/enterprise/operations/{operationId}")
    public ResponseEntity<ObjectNode> queryTest(@PathVariable UUID operationId) {
        authorize();
        return ok(tests.query(operationId));
    }

    @PostMapping("/enterprise/drafts/{skillId}/publish")
    public ResponseEntity<ObjectNode> publish(
            @PathVariable String skillId, @RequestBody ObjectNode command) {
        authorize();
        requireKind(command, "publish_enterprise_skill_draft");
        if (!skillId.equals(text(command, "skillId", 200))) {
            throw SkillLifecycleException.invalid();
        }
        return ok(authority.publishAdminDraft(context(command), skillId,
                text(command, "expectedDraftRevision", 71), "internal-trial-admin"));
    }

    private void authorize() {
        authorizer.authorizeCapability("admin.skill.write");
    }

    private static void validateMetadata(ObjectNode value) {
        requireExactFields(value, Set.of("displayTitle", "displayDescription", "semanticVersion",
                "usageScope", "allowedSubjectIds"));
        text(value, "displayTitle", 128);
        text(value, "displayDescription", 4096);
        String semanticVersion = text(value, "semanticVersion", 32);
        if (!semanticVersion.matches("^(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)$")) {
            throw SkillLifecycleException.invalid();
        }
        String scope = text(value, "usageScope", 32);
        JsonNode subjects = value.get("allowedSubjectIds");
        if (!Set.of("enterprise_all", "restricted").contains(scope)
                || subjects == null || !subjects.isArray() || subjects.size() > 1000
                || (scope.equals("enterprise_all") && !subjects.isEmpty())
                || (scope.equals("restricted") && subjects.isEmpty())) {
            throw SkillLifecycleException.invalid();
        }
        subjects.forEach(subject -> {
            if (!subject.isTextual() || subject.textValue().isBlank()
                    || subject.textValue().length() > 160) {
                throw SkillLifecycleException.invalid();
            }
        });
    }

    private static SkillLifecycleAuthority.CommandContext context(ObjectNode command) {
        requireContract(command);
        return new SkillLifecycleAuthority.CommandContext(
                uuid(command, "commandId"), uuid(command, "correlationId"));
    }

    private static void requireKind(ObjectNode command, String expected) {
        requireContract(command);
        if (!expected.equals(text(command, "kind", 80))) {
            throw SkillLifecycleException.invalid();
        }
    }

    private static void requireContract(ObjectNode value) {
        if (!"skill-lifecycle.v1alpha1".equals(text(value, "contractVersion", 64))) {
            throw SkillLifecycleException.invalid();
        }
    }

    private static ObjectNode object(ObjectNode value, String field) {
        JsonNode child = value.get(field);
        if (!(child instanceof ObjectNode object)) throw SkillLifecycleException.invalid();
        return object;
    }

    private static String text(ObjectNode value, String field, int maximum) {
        JsonNode child = value.get(field);
        if (child == null || !child.isTextual()) throw SkillLifecycleException.invalid();
        String text = child.textValue().trim();
        if (text.isEmpty() || text.length() > maximum) throw SkillLifecycleException.invalid();
        return text;
    }

    private static long integer(ObjectNode value, String field) {
        JsonNode child = value.get(field);
        if (child == null || !child.canConvertToLong()) throw SkillLifecycleException.invalid();
        return child.longValue();
    }

    private static UUID uuid(ObjectNode value, String field) {
        try {
            return UUID.fromString(text(value, field, 64));
        } catch (IllegalArgumentException exception) {
            throw SkillLifecycleException.invalid();
        }
    }

    private static void requireExactFields(ObjectNode value, Set<String> expected) {
        java.util.HashSet<String> actual = new java.util.HashSet<>();
        value.fieldNames().forEachRemaining(actual::add);
        if (!actual.equals(expected)) throw SkillLifecycleException.invalid();
    }

    private static ResponseEntity<ObjectNode> ok(ObjectNode body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }
}
