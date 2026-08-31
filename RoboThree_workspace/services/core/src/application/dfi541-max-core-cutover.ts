import { R2DP2_PRODUCTION_CONSUMPTION_DEFAULT_ENABLED } from
  "./local-desktop-r2d-production.js";
import { R2DP3_DESKTOP_V1ALPHA4_DEFAULT_ENABLED } from
  "./desktop-v1alpha4-cutover.js";

export const DFI541_MAX_CORE_DEFAULT_ENABLED = false as const;
export const DFI541_PRODUCTION_INSTALLED_SUBJECT_RELEASE_COUNT = 0 as const;

export type Dfi541CompleteGraph = Readonly<{
  entitlementSourceCount: 1;
  reasoningPlannerCount: 1;
  coordinationPersistenceCount: 1;
  taskBundlePersistenceCount: 1;
  admittedPolicyCount: 1;
  conformanceManifestCount: 1;
  releaseInstallerCount: 1;
  releaseRegistryCount: 1;
  timeoutFactPersistenceCount: 1;
  preferencePersistenceCount: 1;
}>;

export type Dfi541Composition = Readonly<{
  enabled: boolean;
  testOnly: boolean;
  graphComplete: boolean;
  desktopFeatureAdvertised: false;
  productionReleaseInstalled: false;
}>;

export function createDfi541MaxCoreComposition(input: Readonly<{
  enabled?: boolean;
  testOnly?: boolean;
  graph?: Dfi541CompleteGraph;
}> = {}): Dfi541Composition {
  const enabled = input.enabled ?? DFI541_MAX_CORE_DEFAULT_ENABLED;
  const testOnly = input.testOnly ?? false;
  if (!enabled) {
    if (input.graph !== undefined) {
      throw new Dfi541CompositionError("dfi541.disabled_graph_supplied");
    }
    return Object.freeze({
      enabled: false,
      testOnly: false,
      graphComplete: false,
      desktopFeatureAdvertised: false,
      productionReleaseInstalled: false,
    });
  }
  if (!testOnly) {
    throw new Dfi541CompositionError("dfi541.production_activation_forbidden");
  }
  if (input.graph === undefined || !isCompleteGraph(input.graph)) {
    throw new Dfi541CompositionError("dfi541.incomplete_graph");
  }
  return Object.freeze({
    enabled: true,
    testOnly: true,
    graphComplete: true,
    desktopFeatureAdvertised: false,
    productionReleaseInstalled: false,
  });
}

export function assertDfi541ProductionDecisionsRemainDisabled(): void {
  if (
    DFI541_MAX_CORE_DEFAULT_ENABLED
    || DFI541_PRODUCTION_INSTALLED_SUBJECT_RELEASE_COUNT !== 0
    || R2DP2_PRODUCTION_CONSUMPTION_DEFAULT_ENABLED
    || R2DP3_DESKTOP_V1ALPHA4_DEFAULT_ENABLED
  ) {
    throw new Dfi541CompositionError("dfi541.production_activation_forbidden");
  }
}

export class Dfi541CompositionError extends Error {
  public constructor(public readonly code:
    | "dfi541.disabled_graph_supplied"
    | "dfi541.production_activation_forbidden"
    | "dfi541.incomplete_graph") {
    super(code);
    this.name = "Dfi541CompositionError";
  }
}

function isCompleteGraph(graph: Dfi541CompleteGraph): boolean {
  return Object.values(graph).every((count) => count === 1)
    && Object.keys(graph).length === 10;
}
