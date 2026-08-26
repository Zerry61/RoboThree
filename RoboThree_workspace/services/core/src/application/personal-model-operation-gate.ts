import type { PersonalModelOwnerIdentity } from "./personal-model-domain.js";

export type PersonalModelOperationKind = "mutation" | "reveal";

export interface PersonalModelOperationLease {
  readonly kind: PersonalModelOperationKind;
  release(): void;
}

export interface PersonalModelOperationGate {
  tryAcquire(
    owner: PersonalModelOwnerIdentity,
    personalModelId: string,
    kind: PersonalModelOperationKind,
  ): PersonalModelOperationLease | undefined;
  activeCount(): number;
}

export class InMemoryPersonalModelOperationGate implements PersonalModelOperationGate {
  readonly #active = new Map<string, PersonalModelOperationKind>();

  public tryAcquire(
    owner: PersonalModelOwnerIdentity,
    personalModelId: string,
    kind: PersonalModelOperationKind,
  ): PersonalModelOperationLease | undefined {
    const key = `${owner.ownerScopeNamespaceRevision}:${owner.ownerScopeDigest}:${personalModelId}`;
    if (this.#active.has(key)) return undefined;
    this.#active.set(key, kind);
    let released = false;
    return {
      kind,
      release: () => {
        if (released) return;
        released = true;
        this.#active.delete(key);
      },
    };
  }

  public activeCount(): number {
    return this.#active.size;
  }
}
