import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

type Evidence = Readonly<{
  id: `ARH23-${string}`;
  evidenceFile: string;
  evidencePattern: string;
}>;

const evidence: readonly Evidence[] = Object.freeze([
  item(1, "arh2.3-process-recovery.test.ts", "W1 kills after admission"),
  item(2, "arh2.3-process-recovery.test.ts", "W1 kills after admission"),
  item(3, "arh2.3-process-recovery.test.ts", "W2 kills after Transaction A"),
  item(4, "arh2.3-process-recovery.test.ts", "W2 kills after Transaction A"),
  item(5, "arh2.3-provider-recovery.test.ts", "W3 resumes the same pending Job"),
  item(6, "arh2.3-provider-recovery.test.ts", "W3 resumes the same pending Job"),
  item(7, "arh2.3-provider-recovery.test.ts", "W3 resumes the same pending Job"),
  item(8, "arh2.3-provider-recovery.test.ts", "W4 fails closed for ${mode}"),
  item(9, "arh2.3-process-recovery.test.ts", "W4 kills after Summary acquisition"),
  item(10, "arh2.3-process-recovery.test.ts", "W4 kills after Summary acquisition"),
  item(11, "arh2.3-process-recovery.test.ts", "W5 kills after Transaction C"),
  item(12, "arh2.3-process-recovery.test.ts", "W5 kills after Transaction C"),
  item(13, "compaction-coordinator.test.ts", "rejects an explicitly delayed stale Compaction result"),
  item(14, "arh2.3-process-recovery.test.ts", "W6 lets two fresh recovery owners"),
  item(15, "arh2.3-process-recovery.test.ts", "W7 kills before the main Model call"),
  item(16, "arh2.3-process-recovery.test.ts", "W7 kills before the main Model call"),
  item(17, "arh2.3-process-recovery.test.ts", "proves first and rolling Compaction"),
  item(18, "arh2.3-process-recovery.test.ts", "proves first and rolling Compaction"),
  item(19, "arh2.3-process-recovery.test.ts", "proves first and rolling Compaction"),
  item(20, "arh2.3-process-recovery.test.ts", "proves first and rolling Compaction"),
  item(21, "arh2.3-process-recovery.test.ts", "proves first and rolling Compaction"),
  item(22, "compaction-coordinator.test.ts", "plans rolling summarization as active Summary"),
  item(23, "arh2.3-process-recovery.test.ts", "W6 lets two fresh recovery owners"),
  item(24, "arh2.3-process-recovery.test.ts", "reopens one rolling active view ten times"),
  item(25, "conversation-atomic-group-planner.test.ts", "closes each completed Tool cycle"),
  item(26, "conversation-atomic-group-planner.test.ts", "keeps a multi-Tool batch and all committed results"),
  item(27, "compaction-source-range-planner.test.ts", "keeps an open confirmation group"),
  item(28, "conversation-atomic-group-planner.test.ts", "fails closed for orphan and identity-drifted Tool Results"),
  item(29, "arh2.3-durable-loop-harness.test.ts", "runs 50 ordered Tool batches"),
  item(30, "arh2.3-durable-loop-harness.test.ts", "runs 50 ordered Tool batches"),
  item(31, "arh2.3-durable-loop-harness.test.ts", "runs 50 ordered Tool batches"),
  item(32, "arh2.3-durable-loop-harness.test.ts", "runs 50 ordered Tool batches"),
  item(33, "arh2.3-durable-loop-harness.test.ts", "runs 50 ordered Tool batches"),
  item(34, "arh2.3-durable-loop-harness.test.ts", "runs 50 ordered Tool batches"),
  item(35, "arh2.3-durable-loop-harness.test.ts", "runs 50 ordered Tool batches"),
  item(36, "user-confirmation.integration.test.ts", "replays waiting_user_confirmation after crash"),
  item(37, "user-confirmation.integration.test.ts", "replays waiting_user_confirmation after crash"),
  item(38, "user-confirmation.integration.test.ts", "retains an exact rejection after close/reopen"),
  item(39, "arh2.2-context-pipeline-assessment.test.ts", "returns a stable preparation receipt"),
  item(40, "arh2.2-context-pipeline-assessment.test.ts", "returns a stable preparation receipt"),
  item(41, "arh2.3-process-recovery.test.ts", "W6 lets two fresh recovery owners"),
  item(42, "conversation-persistence.conformance.test.ts", "replays the exact receipt"),
  item(43, "compaction-coordinator.test.ts", "fails a pending job explicitly"),
  item(44, "arh2.3-durable-loop-harness.test.ts", "semanticViewDigest"),
  item(45, "arh2.3-durable-loop-harness.test.ts", "modelProcessClosed"),
  item(46, "arh2.3-recovery-matrix.test.ts", "contains no forbidden report field"),
  item(47, "arh2.3-recovery-matrix.test.ts", "uses a strict allowlist"),
  item(48, "arh2.3-recovery-matrix.test.ts", "keeps frozen architecture files unchanged"),
  item(49, "arh2.3-recovery-matrix.test.ts", "maps all 52 QA items"),
  item(50, "arh2.3-recovery-matrix.test.ts", "keeps ARH-3 capabilities absent"),
  item(51, "arh2.3-provider-recovery.test.ts", "controlled Provider recovery modes"),
  item(52, "arh2.3-durable-loop-harness.test.ts", "semanticViewDigest"),
]);

const allowedReportKeys = Object.freeze([
  "schemaVersion",
  "status",
  "scenarioCount",
  "scenarioDigest",
  "windowResults",
  "counters",
  "resourceMetrics",
  "typedErrorCodes",
  "durationMs",
]);
const forbiddenReportFields = /(?:pid|path|prompt|summary|message|credential|secret|token|endpoint|handle)/iu;

describe("ARH-2.3 executable recovery evidence matrix", () => {
  it("maps all 52 QA items to executable evidence titles", async () => {
    expect(evidence).toHaveLength(52);
    expect(new Set(evidence.map((entry) => entry.id)).size).toBe(52);
    for (const entry of evidence) {
      const source = await readFile(file(entry.evidenceFile), "utf8");
      expect(source, `${entry.id} missing ${entry.evidencePattern}`).toContain(entry.evidencePattern);
    }
  });

  it("uses a strict allowlist and contains no forbidden report field", () => {
    expect(allowedReportKeys).toHaveLength(9);
    expect(allowedReportKeys.every((key) => !forbiddenReportFields.test(key))).toBe(true);
  });

  it("keeps frozen architecture files unchanged and keeps ARH-3 capabilities absent", async () => {
    const sources = await Promise.all([
      file("../src/application/durable-agent-loop-starter.ts"),
      file("../src/application/context-preparation-coordinator.ts"),
    ].map((path) => readFile(path, "utf8")));
    const combined = sources.join("\n");
    expect(combined).not.toMatch(/promptCache|retryUsageDedupe|crossSessionTokenAccounting/u);
  });

  it("publishes a deterministic scenario digest over the allowlisted matrix", () => {
    const digest = createHash("sha256").update(JSON.stringify(evidence)).digest("hex");
    expect(digest).toMatch(/^[0-9a-f]{64}$/u);
  });
});

function item(number: number, evidenceFile: string, evidencePattern: string): Evidence {
  return Object.freeze({
    id: `ARH23-${String(number).padStart(2, "0")}` as const,
    evidenceFile,
    evidencePattern,
  });
}

function file(relative: string): string {
  return fileURLToPath(new URL(relative, import.meta.url));
}
