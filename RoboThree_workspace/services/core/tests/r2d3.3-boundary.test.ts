import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CPC_INSTRUCTION_RUNTIME_DEFAULT_ENABLED,
  R2D3_CORE_DELTA_DEFAULT_ENABLED,
  R2D3_PRODUCTION_ENTERPRISE_ENTITLEMENT_READY,
} from "../src/index.js";

const root = process.cwd();

describe("R2D-3.3 activation and task_committed boundary", () => {
  it("keeps all production activation authorities disabled", () => {
    expect(R2D3_CORE_DELTA_DEFAULT_ENABLED).toBe(false);
    expect(R2D3_PRODUCTION_ENTERPRISE_ENTITLEMENT_READY).toBe(false);
    expect(CPC_INSTRUCTION_RUNTIME_DEFAULT_ENABLED).toBe(false);
  });

  it("fails startup closed when the R2D gate has no complete planner", async () => {
    const source = await readFile(resolve(
      root,
      "services/core/src/application/submit-turn-coordinator.ts",
    ), "utf8");
    expect(source).toMatch(
      /#r2dCoreDeltaEnabled\s*&&\s*this\.#r2d3AcceptancePlanner\s*===\s*undefined/u,
    );
    expect(source).toContain(
      "R2D3 activation requires the complete durable acceptance planner",
    );
  });

  it("orders the durable Task bundle before task_committed and Agent Loop", async () => {
    const source = await readFile(resolve(
      root,
      "services/core/src/application/submit-turn-coordinator.ts",
    ), "utf8");
    const r2dStart = source.indexOf("async #progressR2D3");
    const r2dEnd = source.indexOf("async #submit(", r2dStart);
    const r2d = source.slice(r2dStart, r2dEnd);
    const commit = r2d.indexOf("commitR2D3SubmitTurnTaskBundle");
    const transition = r2d.indexOf('status: "task_committed"', commit);
    const complete = r2d.indexOf("this.#coordination.complete", transition);
    const loop = r2d.indexOf("this.#loopStarter.start", complete);
    expect(r2dStart).toBeGreaterThanOrEqual(0);
    expect(commit).toBeGreaterThanOrEqual(0);
    expect(transition).toBeGreaterThan(commit);
    expect(complete).toBeGreaterThan(transition);
    expect(loop).toBeGreaterThan(complete);
  });

  it("does not place R2D activation or authority inputs in Desktop or Admin", async () => {
    for (const file of [
      "apps/desktop/src/preload/index.ts",
      "apps/desktop/src/main/index.ts",
      "apps/admin-console/src/main.ts",
    ]) {
      const source = await readFile(resolve(root, file), "utf8");
      expect(source, file).not.toMatch(
        /r2dCoreDeltaEnabled|R2D3AcceptanceAuthority|TaskResourceEntitlementSource/u,
      );
    }
  });

  it("keeps Provider and invocation layers free of R2D coordination logic", async () => {
    for (const file of [
      "services/core/src/adapters/https/local-personal-openai-compatible-model-provider.ts",
      "services/core/src/application/durable-local-personal-model-provider.ts",
      "services/core/src/application/durable-agent-loop-starter.ts",
    ]) {
      const source = await readFile(resolve(root, file), "utf8");
      expect(source, file).not.toMatch(
        /PersistedR2D3CoordinationEnvelope|prepareAcceptedR2D3|r2dCoreDeltaEnabled/u,
      );
    }
  });
});
