import {
  RegistrySnapshotSchema,
  type RegistrySnapshot,
} from "@robothree/contracts";

import type { TrustedRegistrySnapshotProvider } from "../../ports/catalog-query.js";

export class FrozenRegistrySnapshotProvider implements TrustedRegistrySnapshotProvider {
  readonly #snapshot: RegistrySnapshot;

  constructor(snapshot: RegistrySnapshot) {
    this.#snapshot = structuredClone(RegistrySnapshotSchema.parse(snapshot));
  }

  async loadCurrentRegistrySnapshot(): Promise<RegistrySnapshot> {
    return structuredClone(this.#snapshot);
  }
}
