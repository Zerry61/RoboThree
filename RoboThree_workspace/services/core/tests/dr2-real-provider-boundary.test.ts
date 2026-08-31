import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../..");

describe("DR-2 actual Central and Desktop internal-trial boundary", () => {
  it("keeps direct-provider credentials out of Electron and product surfaces", () => {
    const source = readFileSync(resolve(
      root,
      "services/central-service/src/test/java/com/robothree/central/modelgateway/development/MvpVs1RealProviderDesktopE2E.java",
    ), "utf8");
    const runner = readFileSync(resolve(root, "scripts/run-dr2-real-provider.mjs"), "utf8");
    const interactiveRunner = readFileSync(resolve(
      root,
      "scripts/run-deepseek-desktop-trial.mjs",
    ), "utf8");

    expect(source).toContain("environment.remove(KEY_ENV)");
    expect(source).toContain("InMemoryCentralPersistence");
    expect(source).toContain("OpenAiCompatibleModelProviderAdapter");
    expect(source).toContain("Arrays.fill(key, '\\0')");
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("jdbc:");
    expect(runner).toContain("dr2_lockfile_changed");
    expect(interactiveRunner).toContain("readHidden");
    expect(interactiveRunner).toContain("VITE_ROBOTHREE_RUNTIME_MODE: \"local_demo\"");
    expect(interactiveRunner).toContain("deepseek_trial_lockfile_changed");
    expect(interactiveRunner).not.toContain("writeFile");
    expect(interactiveRunner).not.toContain("localStorage");
  });
});
