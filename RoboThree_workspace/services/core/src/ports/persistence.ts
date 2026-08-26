import type { RuntimeComponent } from "./runtime-component.js";

/**
 * KAF-0 only fixes the persistence lifecycle boundary.
 * Storage operations are intentionally deferred until ADR-007 is frozen.
 */
export interface PersistenceAdapter extends RuntimeComponent {
  readonly adapterKind: "persistence";
}
