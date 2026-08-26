import {
  ToolCapabilityDefinitionSchema,
  type ToolCapabilityDefinition,
} from "@robothree/contracts";

import type { ToolCatalogProvider } from "../../ports/tool-catalog-provider.js";

export class FakeToolCatalogProvider implements ToolCatalogProvider {
  readonly adapterKind = "tool_catalog_provider" as const;
  readonly adapterDescriptorId: string;
  readonly adapterDescriptorRevision: string;
  readonly #definitions: readonly ToolCapabilityDefinition[];

  public constructor(input: {
    adapterDescriptorId: string;
    adapterDescriptorRevision: string;
    definitions: readonly ToolCapabilityDefinition[];
  }) {
    this.adapterDescriptorId = input.adapterDescriptorId;
    this.adapterDescriptorRevision = input.adapterDescriptorRevision;
    this.#definitions = input.definitions.map((definition) =>
      ToolCapabilityDefinitionSchema.parse(definition));
  }

  public async list(): Promise<readonly ToolCapabilityDefinition[]> {
    return this.#definitions.map((definition) => ToolCapabilityDefinitionSchema.parse(definition));
  }
}
