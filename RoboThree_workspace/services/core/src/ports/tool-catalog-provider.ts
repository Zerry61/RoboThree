import type { ToolCapabilityDefinition } from "@robothree/contracts";

import type { RuntimeAdapterHandle } from "./runtime-adapter-handle.js";

export interface ToolCatalogProvider extends RuntimeAdapterHandle {
  readonly adapterKind: "tool_catalog_provider";
  list(): Promise<readonly ToolCapabilityDefinition[]>;
}
