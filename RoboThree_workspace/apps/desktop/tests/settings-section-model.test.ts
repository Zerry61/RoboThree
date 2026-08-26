import { describe, expect, it } from "vitest";

import { productionRouteNames } from "../src/renderer/app/router.js";
import {
  getSettingsGateConfig,
  settingsGatePages,
  settingsSections,
} from "../src/renderer/pages/settings/settings-section-model.js";

describe("DFE-5B.2 settings section view model", () => {
  it("keeps stable settings sections and route names", () => {
    expect(settingsSections.map((item) => item.key)).toEqual([
      "models",
      "personalization",
      "memory",
      "feedback",
      "identity",
    ]);
    expect(settingsSections.map((item) => item.routeName)).toEqual([
      productionRouteNames.settingsModels,
      productionRouteNames.settingsPersonalization,
      productionRouteNames.settingsMemory,
      productionRouteNames.settingsFeedback,
      productionRouteNames.settingsIdentity,
    ]);
  });

  it("separates runtime readiness from gated capability state", () => {
    for (const config of Object.values(settingsGatePages)) {
      expect(config.dataOrigin).toBe("static_product_copy");
      expect(config.capabilityState).toBe("gated");
      expect(config.capabilityLabel).toBe("功能尚未接入");
      expect(config.runtimeStatusLabel).toBe("Desktop/Core 正常");
      expect(JSON.stringify(config)).not.toMatch(/保存成功|提交成功|同步完成|登录成功|查看成功/u);
    }
  });

  it("keeps all DFE-5B.2 gated pages static and non-interactive", () => {
    expect(getSettingsGateConfig("personalization").disabledReason).toContain("尚未接入");
    expect(getSettingsGateConfig("memory").noticeText).toContain("不展示假记忆");
    expect(getSettingsGateConfig("feedback").noticeText).toContain("不声明提交结果");
    expect(getSettingsGateConfig("identity").noticeText).toContain("不展示身份凭据");
  });
});
