package com.robothree.central.skilllifecycle.application;

import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.shared.json.CanonicalJson;
import java.util.List;
import java.util.UUID;

/** Content-safe read projections for the Desktop/Core and Admin skill consumers. */
public final class SkillLifecycleProjectionService {
    private static final String CONTRACT_VERSION = "skill-lifecycle.v1alpha1";
    private final SkillLifecycleStore store;

    public SkillLifecycleProjectionService(SkillLifecycleStore store) {
        this.store = store;
    }

    public ObjectNode listCreatorDrafts(String creatorSubject) {
        List<SkillLifecycleStore.DraftRevision> drafts =
                store.listCurrentDrafts(creatorSubject, "personal_creator");
        ObjectNode page = CanonicalJson.parseObject("{}", 2);
        page.put("contractVersion", CONTRACT_VERSION);
        page.put("queryRevision", digestOfDrafts(drafts));
        page.put("scope", "created");
        ArrayNode items = page.putArray("items");
        drafts.forEach(draft -> items.add(summary(draft)));
        return page;
    }

    public ObjectNode getCreatorDraft(String skillId, String creatorSubject) {
        SkillLifecycleStore.DraftRevision draft = store.findCurrentDraft(skillId)
                .filter(value -> value.sourceKind().equals("personal_creator"))
                .filter(value -> value.creatorSubject().equals(creatorSubject))
                .orElseThrow(SkillLifecycleException::notFound);
        return detail(draft, true);
    }

    public ObjectNode listSubmissions(String state) {
        List<SkillLifecycleStore.Submission> submissions = store.listSubmissions(state);
        ObjectNode page = CanonicalJson.parseObject("{}", 2);
        page.put("contractVersion", CONTRACT_VERSION);
        page.put("queryRevision", digestOfSubmissions(submissions));
        ArrayNode items = page.putArray("items");
        submissions.forEach(value -> items.add(submissionSummary(value)));
        return page;
    }

    public ObjectNode getSubmission(UUID submissionId) {
        SkillLifecycleStore.Submission submission = store.findSubmission(submissionId)
                .orElseThrow(SkillLifecycleException::notFound);
        SkillLifecycleStore.DraftRevision draft = store.findDraftRevision(
                        submission.skillId(), submission.draftRevision())
                .orElseThrow(SkillLifecycleException::notFound);
        SkillLifecycleStore.PackageBlob pack = store.findPackage(draft.packageDigest())
                .orElseThrow(SkillLifecycleException::notFound);
        SkillLifecycleStore.TestFact test = store.findTestFact(
                        draft.skillId(), draft.draftRevision())
                .orElseThrow(SkillLifecycleException::testRequired);
        ObjectNode result = submissionSummary(submission);
        ObjectNode metadata = metadata(draft);
        result.put("displayDescription", metadata.path("displayDescription").asText());
        result.put("primaryFunction", metadata.path("primaryFunction").asText());
        result.set("packageFacts", packageFacts(pack));
        result.set("testFact", testFact(test));
        result.put("changeSummary", submission.changeSummary());
        if (submission.rejectionReason() != null) {
            result.put("rejectionReason", submission.rejectionReason());
        }
        return result;
    }

    public ObjectNode getEnterpriseDraft(String skillId) {
        SkillLifecycleStore.DraftRevision draft = store.findCurrentDraft(skillId)
                .filter(value -> value.sourceKind().equals("admin_upload"))
                .orElseThrow(SkillLifecycleException::notFound);
        SkillLifecycleStore.PackageBlob pack = store.findPackage(draft.packageDigest())
                .orElseThrow(SkillLifecycleException::notFound);
        ObjectNode result = CanonicalJson.parseObject("{}", 2);
        result.put("contractVersion", CONTRACT_VERSION);
        result.put("skillId", draft.skillId());
        result.put("draftRevision", draft.draftRevision());
        result.put("technicalName", draft.technicalName());
        ObjectNode source = metadata(draft);
        ObjectNode metadata = result.putObject("metadata");
        metadata.put("displayTitle", source.path("displayTitle").asText());
        metadata.put("displayDescription", source.path("displayDescription").asText());
        metadata.put("semanticVersion", source.path("semanticVersion").asText());
        metadata.put("usageScope", source.path("usageScope").asText());
        metadata.set("allowedSubjectIds", source.path("allowedSubjectIds").deepCopy());
        result.set("packageFacts", packageFacts(pack));
        result.set("testFact", store.findTestFact(draft.skillId(), draft.draftRevision())
                .map(SkillLifecycleProjectionService::testFact)
                .orElseGet(() -> untested(draft.draftRevision())));
        result.put("updatedAt", draft.createdAt().toString());
        return result;
    }

    public ObjectNode listPublishedReleases() {
        ObjectNode result = CanonicalJson.parseObject("{}", 2);
        result.put("contractVersion", CONTRACT_VERSION);
        ArrayNode releases = result.putArray("items");
        store.listReleases().forEach(release -> {
            ObjectNode stored = CanonicalJson.parseObject(release.releaseJson(), 524_288);
            SkillLifecycleStore.PackageBlob pack = store.findPackage(release.packageDigest())
                    .orElseThrow(SkillLifecycleException::notFound);
            ObjectNode value = CanonicalJson.parseObject("{}", 2);
            value.put("contractVersion", CONTRACT_VERSION);
            value.put("skillId", release.skillId());
            value.put("releaseRevision", release.releaseRevision());
            value.set("packageFacts", packageFacts(pack));
            value.put("technicalName", stored.path("technicalName").asText());
            value.put("displayTitle", stored.path("displayTitle").asText());
            value.put("displayDescription", stored.path("displayDescription").asText());
            value.put("semanticVersion", release.semanticVersion());
            value.put("sourceKind", release.sourceKind());
            value.put("publishedAt", release.publishedAt().toString());
            releases.add(value);
        });
        return result;
    }

    public SkillLifecycleStore.PackageBlob packageForRelease(
            String skillId, String releaseRevision, String packageDigest) {
        SkillLifecycleStore.Release release = store.findRelease(skillId, releaseRevision)
                .filter(value -> value.packageDigest().equals(packageDigest))
                .orElseThrow(SkillLifecycleException::notFound);
        return store.findPackage(release.packageDigest())
                .orElseThrow(SkillLifecycleException::notFound);
    }

    public SkillLifecycleStore.PackageBlob packageForDraft(
            String skillId, String draftRevision) {
        SkillLifecycleStore.DraftRevision draft = store.findDraftRevision(skillId, draftRevision)
                .filter(value -> value.sourceKind().equals("admin_upload"))
                .orElseThrow(SkillLifecycleException::notFound);
        return store.findPackage(draft.packageDigest())
                .orElseThrow(SkillLifecycleException::notFound);
    }

    private ObjectNode detail(SkillLifecycleStore.DraftRevision draft, boolean includeSubmission) {
        ObjectNode value = summary(draft);
        SkillLifecycleStore.PackageBlob pack = store.findPackage(draft.packageDigest())
                .orElseThrow(SkillLifecycleException::notFound);
        value.set("packageFacts", packageFacts(pack));
        value.set("draftTestFact", store.findTestFact(draft.skillId(), draft.draftRevision())
                .map(SkillLifecycleProjectionService::testFact)
                .orElseGet(() -> untested(draft.draftRevision())));
        if (includeSubmission) {
            store.findPendingSubmission(draft.skillId()).ifPresent(submission -> {
                ObjectNode identity = value.putObject("submission");
                identity.put("submissionId", submission.submissionId().toString());
                identity.put("submissionRevision", submission.submissionRevision());
                identity.put("state", submission.state());
            });
        }
        return value;
    }

    private static ObjectNode summary(SkillLifecycleStore.DraftRevision draft) {
        ObjectNode metadata = metadata(draft);
        ObjectNode value = CanonicalJson.parseObject("{}", 2);
        value.put("skillId", draft.skillId());
        value.put("revision", draft.draftRevision());
        value.put("technicalName", draft.technicalName());
        value.put("displayTitle", draft.displayTitle());
        value.put("displayDescription", metadata.path("displayDescription").asText());
        value.put("sourceKind", draft.sourceKind());
        value.put("availability", "available");
        value.put("creatorDisplayName", safeCreator(draft.creatorSubject()));
        if (metadata.hasNonNull("semanticVersion")) {
            value.put("semanticVersion", metadata.path("semanticVersion").asText());
        }
        value.put("installed", false);
        value.put("updatedAt", draft.createdAt().toString());
        return value;
    }

    private ObjectNode submissionSummary(SkillLifecycleStore.Submission submission) {
        SkillLifecycleStore.DraftRevision draft = store.findDraftRevision(
                        submission.skillId(), submission.draftRevision())
                .orElseThrow(SkillLifecycleException::notFound);
        ObjectNode value = CanonicalJson.parseObject("{}", 2);
        value.put("submissionId", submission.submissionId().toString());
        value.put("submissionRevision", submission.submissionRevision());
        value.put("skillId", submission.skillId());
        value.put("draftRevision", submission.draftRevision());
        value.put("displayTitle", draft.displayTitle());
        value.put("technicalName", draft.technicalName());
        value.put("creatorDisplayName", safeCreator(submission.creatorSubject()));
        value.put("semanticVersion", submission.semanticVersion());
        value.put("state", submission.state());
        value.put("submittedAt", submission.submittedAt().toString());
        if (submission.reviewedAt() != null) value.put("reviewedAt", submission.reviewedAt().toString());
        return value;
    }

    private static ObjectNode packageFacts(SkillLifecycleStore.PackageBlob pack) {
        ObjectNode value = CanonicalJson.parseObject("{}", 2);
        value.put("packageDigest", pack.packageDigest());
        value.put("manifestDigest", pack.manifestDigest());
        value.put("skillMarkdownDigest", pack.skillMarkdownDigest());
        value.put("fileCount", pack.fileCount());
        value.put("expandedByteCount", pack.expandedByteCount());
        return value;
    }

    private static ObjectNode testFact(SkillLifecycleStore.TestFact fact) {
        ObjectNode value = CanonicalJson.parseObject("{}", 2);
        value.put("draftRevision", fact.draftRevision());
        value.put("state", fact.state());
        value.put("taskId", fact.taskId());
        if (fact.completedAt() != null) value.put("testedAt", fact.completedAt().toString());
        if (fact.safeSummary() != null) value.put("safeReason", fact.safeSummary());
        return value;
    }

    private static ObjectNode untested(String revision) {
        ObjectNode value = CanonicalJson.parseObject("{}", 2);
        value.put("draftRevision", revision);
        value.put("state", "untested");
        return value;
    }

    private static ObjectNode metadata(SkillLifecycleStore.DraftRevision draft) {
        return CanonicalJson.parseObject(draft.metadataJson(), 524_288);
    }

    private static String safeCreator(String creatorSubject) {
        int separator = creatorSubject.lastIndexOf(':');
        return separator >= 0 ? creatorSubject.substring(separator + 1) : creatorSubject;
    }

    private static String digestOfDrafts(List<SkillLifecycleStore.DraftRevision> values) {
        return "sha256:" + CanonicalJson.sha256(values.stream()
                .map(value -> value.skillId() + ":" + value.draftRevision())
                .sorted().toList().toString());
    }

    private static String digestOfSubmissions(List<SkillLifecycleStore.Submission> values) {
        return "sha256:" + CanonicalJson.sha256(values.stream()
                .map(value -> value.submissionId() + ":" + value.submissionRevision())
                .sorted().toList().toString());
    }
}
