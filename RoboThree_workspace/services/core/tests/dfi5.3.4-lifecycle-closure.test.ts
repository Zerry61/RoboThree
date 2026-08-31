import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workspace = process.cwd();
const historical = {
  dfi531: "sha256:303d342b2744511601e5ee565c5c3d02648269c74d393a6764d7dbe553cc2841",
  dfi532: "sha256:d8fcaa832b0aa689d6d939e143fc56e3cf3180b28f77f50c4f14e5e020ef60fb",
  dfi533: "sha256:b8ede54d8d22e0458ab80cd7fe059c2c97a105c2101c9cb47622fea48ed9d826",
} as const;

describe("DFI-5.3.4 stage closure invariants", () => {
  it("retains all three historical evidence identities without rewriting them", () => {
    for (const [batch, evidenceDigest] of Object.entries(historical)) {
      const evidence = JSON.parse(text(`artifacts/${batch}/evidence.json`)) as {
        evidenceDigest: string;
      };
      expect(evidence.evidenceDigest).toBe(evidenceDigest);
    }
  });

  it("keeps default omission and sealed max mappings owned by their focused tests", () => {
    const local = text("services/core/tests/dfi5.3.2-local-personal-reasoning-mapping.test.ts");
    const enterprise = text("services/core/tests/dfi5.3.3-enterprise-reasoning-mapping.test.ts");
    expect(local).toContain("not.toHaveProperty");
    expect(local).toContain("reasoning_effort");
    expect(enterprise).toContain("default_passthrough");
    expect(enterprise).toContain("locked_max_strategy");
  });

  it("retains exact deadline and terminal replay invariants in durable wrappers", () => {
    const local = text("services/core/src/application/durable-local-personal-model-provider.ts");
    const enterprise = text("services/core/src/application/durable-enterprise-model-provider.ts");
    expect(local).toContain("invocationDeadlineAt");
    expect(local).toContain('status: "terminal"');
    expect(enterprise).toContain("messageCommittedAt");
    expect(enterprise).toContain("reasoning");
  });

  it("keeps migration 25 as the DFI-4A.3.1 repair.2 Timeout Fact authority", () => {
    const migrations = text("services/core/src/adapters/sqlite/migrations.ts");
    expect(migrations).toContain("dfi_4a31_local_personal_invocation_timeout_facts");
    expect(migrations).toMatch(/id:\s*25,[\s\S]*dfi_4a31_local_personal_invocation_timeout_facts/u);
  });

  it("parses the focused 96-item matrix continuously", () => {
    const plan = text(
      "docs/development/frontend/DFI-5.3.4-LIFECYCLE-CUTOVER-STAGE-CLOSURE-DEVELOPMENT-PLAN.md",
    );
    const ids = [...plan.matchAll(/^\d+\. QA-(\d{3})\b/gmu)].map((match) => Number(match[1]));
    expect(ids).toEqual(Array.from({ length: 96 }, (_, index) => index + 1));
  });

  it("does not introduce focused test escape hatches", () => {
    const focused = [
      "services/core/tests/dfi5.3.4-process-lifecycle.test.ts",
      "services/core/tests/dfi5.3.4-boundary.test.ts",
    ].map(text).join("\n");
    expect(focused).not.toMatch(/\.skip\(|\.only\(|@Disabled|\bsleep\b/u);
  });
});

function text(relative: string) {
  return readFileSync(`${workspace}/${relative}`, "utf8");
}
