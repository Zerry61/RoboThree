import type { PersonalModelOwnerAuthority } from "../ports/personal-model-owner-authority.js";
import type { PersonalModelPersistence } from "../ports/personal-model-persistence.js";
import type {
  PersonalModelOwnerAuthorityContextProvider,
} from "../ports/personal-model-credential-coordination.js";
import type { PersonalModelOwnerAuthorityResolver } from
  "../ports/personal-model-owner-authority.js";
import {
  deriveLocalDesktopSubjectAuthority,
  validateLocalDesktopSubjectAuthority,
} from "./local-desktop-subject-authority.js";

export type TaskLockedPersonalModelExecutionAuthority =
  | Readonly<{
    authorityKind: "runtime_active_enterprise_identity";
    ownerIdentity: PersonalModelOwnerAuthority["ownerIdentity"];
    authorityRevision: string;
    offlineState: PersonalModelOwnerAuthority["offlineState"];
  }>
  | Readonly<{
    authorityKind: "local_desktop_owner";
    ownerIdentity: PersonalModelOwnerAuthority["ownerIdentity"];
    authorityRevision: string;
    productionLocalAuthorityReady: true;
    productionEnterpriseIdentityReady: false;
    testIdentityUsed: false;
  }>;

export interface PersonalModelExecutionAuthorityProvider {
  load(): Promise<TaskLockedPersonalModelExecutionAuthority>;
}

/** Reuses Runtime Active identity/offline facts; it does not create a second session clock. */
export class ContextBackedPersonalModelExecutionAuthorityProvider
implements PersonalModelExecutionAuthorityProvider {
  readonly #contexts: PersonalModelOwnerAuthorityContextProvider;
  readonly #personal: PersonalModelPersistence;
  readonly #resolver: PersonalModelOwnerAuthorityResolver;

  public constructor(input: Readonly<{
    contexts: PersonalModelOwnerAuthorityContextProvider;
    personal: PersonalModelPersistence;
    resolver: PersonalModelOwnerAuthorityResolver;
  }>) {
    this.#contexts = input.contexts;
    this.#personal = input.personal;
    this.#resolver = input.resolver;
  }

  public async load(): Promise<TaskLockedPersonalModelExecutionAuthority> {
    const [context, namespace] = await Promise.all([
      this.#contexts.load("use"),
      this.#personal.loadActiveOwnerNamespace(),
    ]);
    if (namespace === undefined) throw new Error("personal_model.owner_namespace_unavailable");
    const authority = this.#resolver.resolve({ ...context, namespace, action: "use" });
    return Object.freeze({
      authorityKind: "runtime_active_enterprise_identity" as const,
      ownerIdentity: authority.ownerIdentity,
      authorityRevision: authority.entitlementRevision,
      offlineState: authority.offlineState,
    });
  }
}

/** Execution-only local authority. It cannot configure, reveal or delete models. */
export class LocalDesktopPersonalModelExecutionAuthorityProvider
implements PersonalModelExecutionAuthorityProvider {
  public constructor(private readonly personal: PersonalModelPersistence) {}

  public async load(): Promise<TaskLockedPersonalModelExecutionAuthority> {
    const namespace = await this.personal.loadActiveOwnerNamespace();
    if (namespace === undefined) {
      throw new Error("personal_model.owner_namespace_unavailable");
    }
    const authority = validateLocalDesktopSubjectAuthority(
      namespace,
      deriveLocalDesktopSubjectAuthority(namespace),
    );
    return Object.freeze({
      authorityKind: "local_desktop_owner" as const,
      ownerIdentity: Object.freeze({
        ownerScopeNamespaceRevision: authority.ownerScopeNamespaceRevision,
        ownerScopeDigest: authority.ownerScopeDigest,
      }),
      authorityRevision: authority.authorityRevision,
      productionLocalAuthorityReady: true as const,
      productionEnterpriseIdentityReady: false as const,
      testIdentityUsed: false as const,
    });
  }
}
