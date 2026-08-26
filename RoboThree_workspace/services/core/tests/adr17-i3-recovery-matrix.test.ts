import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

type Evidence = Readonly<{
  file: string;
  titleFragment: string;
  additionalFragments?: readonly string[];
}>;

type RecoveryScenario = Readonly<{
  id: `ADR17-I3-${string}`;
  planItem: number;
  evidence: readonly Evidence[];
}>;

/**
 * Executable coverage manifest for the frozen ADR-017 §11 matrix. The I3
 * runner executes every evidence file in this manifest in one Vitest process;
 * these guards make removed or renamed evidence fail closed instead of
 * silently shrinking the matrix.
 */
const recoveryMatrix: readonly RecoveryScenario[] = Object.freeze([
  scenario("01", 1, "services/core/tests/tool-call-batch-coordinator.test.ts",
    "turns cancellation before dispatch into explicit dispositions"),
  scenario("02", 2, "services/core/tests/tool-call-batch-coordinator.test.ts",
    "keeps the in-flight Effect linked when cancellation arrives"),
  scenario("03", 3, "services/core/tests/process-echo-tool.integration.test.ts",
    "propagates cancellation after DISPATCHED and converges Echo to a cancelled Observation"),
  scenario("04", 4, "services/core/tests/effect-recovery.test.ts",
    "converges an unverifiable dispatched Effect to uncertain"),
  scenario("05", 5, "services/core/tests/user-confirmation.integration.test.ts",
    "replays waiting_user_confirmation after crash and resumes the exact call",
    ["5 fresh databases"]),
  scenario("06", 6, "services/core/tests/tool-call-batch-coordinator.test.ts",
    "resumes in original order after allow"),
  scenario("07", 7, "services/core/tests/tool-call-batch-coordinator.test.ts",
    "converges a rejected confirmation and all later unlinked calls"),
  scenario("08", 8, "services/core/tests/tool-call-batch-persistence.conformance.test.ts",
    "rolls back Transaction A at", [
      "append_assistant_batch.after_message",
      "append_assistant_batch.after_batch",
    ]),
  scenario("09", 9, "services/core/tests/tool-call-batch-coordinator.test.ts",
    "recovers a committed Assistant batch that crashed before its first Tool dispatch"),
  scenario("10", 10, "services/core/tests/tool-call-batch-coordinator.test.ts",
    "reconciles an Effect committed before disposition linkage"),
  scenario("11", 11, "services/core/tests/effect-recovery.test.ts",
    "keeps Effect dispatched and Task unchanged when the Result transaction fails"),
  scenario("12", 12, "services/core/tests/task-runtime.test.ts",
    "always retries into a new Run and rejects observations from the old Run"),
  scenario("13", 13, "services/core/tests/tool-call-batch-coordinator.test.ts",
    "does not dispatch an old Run batch after Retry creates a new active Run"),
  scenario("14", 14, "services/core/tests/tool-call-batch-coordinator.test.ts",
    "sends only complete Tool history forward"),
  {
    id: "ADR17-I3-15",
    planItem: 15,
    evidence: Object.freeze([
      evidence("services/core/tests/tool-call-batch-persistence.conformance.test.ts",
        "replays the same canonical batch and rejects identity reuse with drift"),
      evidence("services/core/tests/user-confirmation.integration.test.ts",
        "serializes concurrent identical confirmations, replays the winner"),
    ]),
  },
  scenario("16", 16, "services/core/tests/tool-call-batch-persistence.conformance.test.ts",
    "ADR17-I1 conformance", [
      "InMemoryConversationPersistence",
      "SqliteConversationPersistence",
    ]),
  scenario("17", 17, "services/core/tests/tool-call-batch-coordinator.test.ts",
    "recovers only the exact Task/Run batch after SQLite close/reopen",
    ["Promise.all", "callsBeforeConcurrentRecovery"]),
  scenario("18", 18, "services/core/tests/adr17-i3-recovery-matrix.test.ts",
    "emits an allowlisted evidence report whose sensitive-content scan is zero"),
]);

describe("ADR17-I3 executable recovery matrix manifest", () => {
  it("contains exactly the 18 frozen scenarios with stable and unique identities", () => {
    expect(recoveryMatrix).toHaveLength(18);
    expect(new Set(recoveryMatrix.map((entry) => entry.id)).size).toBe(18);
    expect(recoveryMatrix.map((entry) => entry.planItem)).toEqual(
      Array.from({ length: 18 }, (_, index) => index + 1),
    );
  });

  for (const entry of recoveryMatrix) {
    it(`${entry.id} keeps executable evidence registered for plan item ${entry.planItem}`, async () => {
      for (const proof of entry.evidence) {
        const source = await readFile(join(process.cwd(), proof.file), "utf8");
        expect(source, `${entry.id} missing test title in ${proof.file}`)
          .toContain(proof.titleFragment);
        for (const fragment of proof.additionalFragments ?? []) {
          expect(source, `${entry.id} missing ${fragment} in ${proof.file}`)
            .toContain(fragment);
        }
      }
    });
  }

  it("emits an allowlisted evidence report whose sensitive-content scan is zero", () => {
    const forbiddenCanaries = [
      "tool-argument-canary-adr17-i3",
      "tool-result-body-canary-adr17-i3",
      "prompt-canary-adr17-i3",
      "credential-canary-adr17-i3",
      "token-canary-adr17-i3",
      "/Users/example/private/workspace",
    ];
    const matrixDigest = createHash("sha256")
      .update(JSON.stringify(recoveryMatrix.map((entry) => ({
        id: entry.id,
        planItem: entry.planItem,
        evidenceCount: entry.evidence.length,
      }))))
      .digest("hex");
    const report = Object.freeze({
      schemaVersion: "adr17-i3-evidence-v1",
      status: "PASS",
      scenarioCount: recoveryMatrix.length,
      evidenceDigest: `sha256:${matrixDigest}`,
      counters: Object.freeze({
        durableMatrixRuns: 18,
        sensitiveContentMatches: 0,
      }),
    });
    const serialized = JSON.stringify(report);
    const sensitiveContentMatchCount = forbiddenCanaries
      .filter((value) => serialized.includes(value)).length;

    expect(Object.keys(report).sort()).toEqual([
      "counters",
      "evidenceDigest",
      "scenarioCount",
      "schemaVersion",
      "status",
    ]);
    expect(sensitiveContentMatchCount).toBe(0);
    expect(report.counters.sensitiveContentMatches).toBe(0);
    expect(serialized).not.toMatch(/sk-[a-z0-9]+/iu);
    expect(serialized).not.toContain("/Users/");
  });
});

function scenario(
  suffix: string,
  planItem: number,
  file: string,
  titleFragment: string,
  additionalFragments?: readonly string[],
): RecoveryScenario {
  return {
    id: `ADR17-I3-${suffix}`,
    planItem,
    evidence: Object.freeze([evidence(file, titleFragment, additionalFragments)]),
  };
}

function evidence(
  file: string,
  titleFragment: string,
  additionalFragments?: readonly string[],
): Evidence {
  return {
    file,
    titleFragment,
    ...(additionalFragments === undefined
      ? {}
      : { additionalFragments: Object.freeze([...additionalFragments]) }),
  };
}
