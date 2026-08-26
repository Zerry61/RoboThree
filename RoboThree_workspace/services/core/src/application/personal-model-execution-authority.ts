import type { PersonalModelOwnerAuthority } from "../ports/personal-model-owner-authority.js";
import type { PersonalModelPersistence } from "../ports/personal-model-persistence.js";
import type {
  PersonalModelOwnerAuthorityContextProvider,
} from "../ports/personal-model-credential-coordination.js";
import type { PersonalModelOwnerAuthorityResolver } from
  "../ports/personal-model-owner-authority.js";

export interface PersonalModelExecutionAuthorityProvider {
  load(): Promise<PersonalModelOwnerAuthority>;
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

  public async load(): Promise<PersonalModelOwnerAuthority> {
    const [context, namespace] = await Promise.all([
      this.#contexts.load("use"),
      this.#personal.loadActiveOwnerNamespace(),
    ]);
    if (namespace === undefined) throw new Error("personal_model.owner_namespace_unavailable");
    return this.#resolver.resolve({ ...context, namespace, action: "use" });
  }
}
