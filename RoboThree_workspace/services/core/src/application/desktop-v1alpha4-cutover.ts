import { R2DP2_PRODUCTION_CONSUMPTION_DEFAULT_ENABLED } from
  "./local-desktop-r2d-production.js";
import { R2D3_CORE_DELTA_DEFAULT_ENABLED } from
  "./r2d3-durable-acceptance-planner.js";

export const R2DP3_DESKTOP_V1ALPHA4_DEFAULT_ENABLED = false as const;

export function assertR2DP3ProductionReleaseDecision(): void {
  if (
    R2DP3_DESKTOP_V1ALPHA4_DEFAULT_ENABLED
    || R2DP2_PRODUCTION_CONSUMPTION_DEFAULT_ENABLED
    || R2D3_CORE_DELTA_DEFAULT_ENABLED
  ) {
    throw new Error("R2D production cutover decisions must remain jointly disabled");
  }
}
