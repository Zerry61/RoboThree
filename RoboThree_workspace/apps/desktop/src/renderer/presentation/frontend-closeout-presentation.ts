import type { PrimaryNavigationKey } from "../app/navigation.js";

export type FrontendCloseoutState =
  | "loading"
  | "empty"
  | "error"
  | "disabled"
  | "permission_denied"
  | "unavailable"
  | "partial";

export type FrontendCloseoutArea = {
  key: PrimaryNavigationKey;
  routePath: string;
  currentDataMode: "real" | "real_plus_gated" | "gated_default" | "mixed";
  closesFoundation: boolean;
  remainingGate: string;
  states: readonly FrontendCloseoutState[];
};

export type RemainingMockInventoryItem = {
  area: string;
  productionShape: "real" | "gated_copy" | "prototype_marked" | "fixture_test_only" | "hidden_maintenance";
  removalGate: string;
  mustRemainGated: boolean;
};

export type LegacyWorkbenchCloseoutDecision = {
  decision: "hidden_maintenance_route";
  routePath: "/legacy";
  visibleInPrimaryNavigation: false;
  deletionGate: string;
};

export const frontendCloseoutStates = Object.freeze<readonly FrontendCloseoutState[]>([
  "loading",
  "empty",
  "error",
  "disabled",
  "permission_denied",
  "unavailable",
  "partial",
]);

export const frontendCloseoutAreas = Object.freeze<readonly FrontendCloseoutArea[]>([
  {
    key: "workbench",
    routePath: "/workbench",
    currentDataMode: "real_plus_gated",
    closesFoundation: true,
    remainingGate: "DFI-2B authorization mode projection and Knowledge Provider selection remain gated.",
    states: frontendCloseoutStates,
  },
  {
    key: "tasks",
    routePath: "/tasks",
    currentDataMode: "real_plus_gated",
    closesFoundation: true,
    remainingGate: "Persistent pinning, physical delete audit expansion and file-content operations remain gated.",
    states: frontendCloseoutStates,
  },
  {
    key: "intelligence",
    routePath: "/intelligence",
    currentDataMode: "mixed",
    closesFoundation: true,
    remainingGate: "Agent/Skill creation, skill catalog and TGM tool catalog remain gated.",
    states: frontendCloseoutStates,
  },
  {
    key: "knowledge",
    routePath: "/knowledge",
    currentDataMode: "gated_default",
    closesFoundation: true,
    remainingGate: "Knowledge Provider, indexing, retrieval, permissions and citation facts remain gated.",
    states: frontendCloseoutStates,
  },
  {
    key: "settings",
    routePath: "/settings/models",
    currentDataMode: "mixed",
    closesFoundation: true,
    remainingGate: "Personal Model/Credential, Memory, Feedback and Identity projections remain gated.",
    states: frontendCloseoutStates,
  },
]);

export const remainingMockInventory = Object.freeze<readonly RemainingMockInventoryItem[]>([
  {
    area: "workbench.authorizationModes",
    productionShape: "gated_copy",
    removalGate: "DFI-2B requested/resolved authorization mode Contract and Core projection.",
    mustRemainGated: true,
  },
  {
    area: "workbench.knowledgeSelection",
    productionShape: "gated_copy",
    removalGate: "Knowledge Provider Feature Spec and safe source projection.",
    mustRemainGated: true,
  },
  {
    area: "tasks.localPinning",
    productionShape: "gated_copy",
    removalGate: "Task/session preference persistence spec and projection.",
    mustRemainGated: true,
  },
  {
    area: "tasks.workspaceFiles",
    productionShape: "real",
    removalGate: "DFE-6A has replaced fixed placeholders; DFE-6B keeps regression coverage only.",
    mustRemainGated: false,
  },
  {
    area: "intelligence.skills",
    productionShape: "prototype_marked",
    removalGate: "Agent/Skill catalog projection with install/local/my-created lifecycle.",
    mustRemainGated: true,
  },
  {
    area: "intelligence.tools",
    productionShape: "prototype_marked",
    removalGate: "TGM tool catalog projection with modelCallable/risk/lifecycle facts.",
    mustRemainGated: true,
  },
  {
    area: "intelligence.creation",
    productionShape: "prototype_marked",
    removalGate: "Agent/Skill creation persistence, avatar storage, test and publish specs.",
    mustRemainGated: true,
  },
  {
    area: "knowledge.fixtureSources",
    productionShape: "fixture_test_only",
    removalGate: "Knowledge Provider status/query/result projection.",
    mustRemainGated: true,
  },
  {
    area: "settings.personalModel",
    productionShape: "gated_copy",
    removalGate: "DFI-4A.2-4A.4 Personal Model/Credential backend and projections.",
    mustRemainGated: true,
  },
  {
    area: "settings.p1Pages",
    productionShape: "gated_copy",
    removalGate: "Personalization, Memory, Feedback and Identity feature specs and projections.",
    mustRemainGated: true,
  },
  {
    area: "legacy.workbench",
    productionShape: "hidden_maintenance",
    removalGate: "Route coverage proves no remaining production-only flow and deletion requires no Main/Preload/Core changes.",
    mustRemainGated: false,
  },
]);

export const legacyWorkbenchCloseoutDecision: LegacyWorkbenchCloseoutDecision = Object.freeze({
  decision: "hidden_maintenance_route",
  routePath: "/legacy",
  visibleInPrimaryNavigation: false,
  deletionGate: "Delete only after route coverage proves no remaining production-only flow and no Main/Preload/Core changes are needed.",
});

export function primaryCloseoutAreaKeys(): readonly PrimaryNavigationKey[] {
  return frontendCloseoutAreas.map((area) => area.key);
}

export function missingStatesForArea(area: FrontendCloseoutArea): readonly FrontendCloseoutState[] {
  return frontendCloseoutStates.filter((state) => !area.states.includes(state));
}

export function gatedInventoryItems(): readonly RemainingMockInventoryItem[] {
  return remainingMockInventory.filter((item) => item.mustRemainGated);
}
