import { describe, expect, it } from "vitest";

import { productionRouteNames } from "../src/renderer/app/router.js";
import {
  settingsSections,
} from "../src/renderer/pages/settings/settings-section-model.js";

describe("DFE-5B.2 settings section view model", () => {
  it("keeps stable settings sections and route names", () => {
    expect(settingsSections.map((item) => item.key)).toEqual([
      "models",
      "personalization",
      "memory",
      "feedback",
    ]);
    expect(settingsSections.map((item) => item.routeName)).toEqual([
      productionRouteNames.settingsModels,
      productionRouteNames.settingsPersonalization,
      productionRouteNames.settingsMemory,
      productionRouteNames.settingsFeedback,
    ]);
  });

  it("keeps only model management available while preview pages remain explicit", () => {
    expect(settingsSections).toHaveLength(4);
    expect(settingsSections[0]?.capabilityState).toBe("available");
    for (const item of settingsSections.slice(1)) {
      expect(item.capabilityState).toBe("gated");
      expect(item.statusLabel).toBe("待接入");
    }
  });
});
