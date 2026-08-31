import { describe, expect, it } from "vitest";

import { primaryNavigationItems } from "../src/renderer/app/navigation.js";
import {
  frontendCloseoutAreas,
  frontendCloseoutStates,
  gatedInventoryItems,
  legacyWorkbenchCloseoutDecision,
  missingStatesForArea,
  primaryCloseoutAreaKeys,
  remainingMockInventory,
} from "../src/renderer/presentation/frontend-closeout-presentation.js";

describe("DFE-6B frontend foundation closeout model", () => {
  it("covers every primary navigation area exactly once", () => {
    expect(primaryCloseoutAreaKeys()).toEqual(primaryNavigationItems.map((item) => item.key));
    expect(new Set(primaryCloseoutAreaKeys()).size).toBe(primaryNavigationItems.length);
    expect(frontendCloseoutAreas.map((area) => area.key)).toEqual([
      "workbench",
      "tasks",
      "intelligence",
      "knowledge",
      "settings",
    ]);
    expect(frontendCloseoutAreas.every((area) => area.closesFoundation)).toBe(true);
  });

  it("requires the full state matrix for every primary area", () => {
    expect(frontendCloseoutStates).toEqual([
      "loading",
      "empty",
      "error",
      "disabled",
      "permission_denied",
      "unavailable",
      "partial",
    ]);
    for (const area of frontendCloseoutAreas) {
      expect(missingStatesForArea(area), `${area.key} has missing states`).toEqual([]);
    }
  });

  it("keeps remaining Mock and GATED inventory explicit", () => {
    const inventoryKeys = remainingMockInventory.map((item) => item.area);
    expect(inventoryKeys).toEqual([
      "workbench.authorizationModes",
      "workbench.knowledgeSelection",
      "tasks.localPinning",
      "tasks.workspaceFiles",
      "intelligence.skills",
      "intelligence.tools",
      "intelligence.creation",
      "knowledge.fixtureSources",
      "settings.personalModel",
      "settings.p1Pages",
      "legacy.workbench",
    ]);
    expect(gatedInventoryItems().map((item) => item.area)).toEqual([
      "workbench.knowledgeSelection",
      "tasks.localPinning",
      "intelligence.skills",
      "intelligence.tools",
      "intelligence.creation",
      "knowledge.fixtureSources",
      "settings.personalModel",
      "settings.p1Pages",
    ]);
    expect(remainingMockInventory.find((item) => item.area === "tasks.workspaceFiles")?.productionShape)
      .toBe("real");
  });

  it("freezes LegacyWorkbench as a hidden maintenance route, not a primary product page", () => {
    expect(legacyWorkbenchCloseoutDecision).toEqual({
      decision: "hidden_maintenance_route",
      routePath: "/legacy",
      visibleInPrimaryNavigation: false,
      deletionGate: "Delete only after route coverage proves no remaining production-only flow and no Main/Preload/Core changes are needed.",
    });
    expect(primaryNavigationItems.some((item) => item.routeName === "legacy")).toBe(false);
  });
});
