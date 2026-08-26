import type { Clock } from "../ports/clock.js";
import type {
  DesktopReasoningModeOwnerAuthority,
  DesktopReasoningModeOwnerAuthorityProvider,
  DesktopReasoningModePreferencePersistence,
} from "../ports/desktop-reasoning-mode.js";
import {
  createDesktopExperienceOwnerNamespace,
  deriveDesktopExperiencePreferenceOwnerIdentity,
  type DesktopExperiencePreferenceOwnerIdentity,
} from "./desktop-reasoning-mode-domain.js";

export type ResolvedDesktopReasoningModeOwner = Readonly<{
  identity: DesktopExperiencePreferenceOwnerIdentity;
  authority: Extract<DesktopReasoningModeOwnerAuthority, { state: "available" }>;
}>;

export async function resolveDesktopReasoningModeOwner(input: Readonly<{
  authorityProvider: DesktopReasoningModeOwnerAuthorityProvider;
  persistence: DesktopReasoningModePreferencePersistence;
  clock: Clock;
  expectedClientInstanceId: string;
}>): Promise<ResolvedDesktopReasoningModeOwner | undefined> {
  const authority = await input.authorityProvider.resolve();
  if (authority.state === "unavailable") return undefined;
  if (authority.testIdentityUsed === authority.productionIdentityReady) {
    throw new Error("Reasoning Mode owner authority flags are invalid");
  }
  if (authority.currentClientInstanceId !== input.expectedClientInstanceId) {
    throw new Error("reasoning_mode.owner_session_rebound");
  }

  let namespace = await input.persistence.loadActiveOwnerNamespace();
  if (namespace === undefined) {
    const initialized = await input.persistence.initializeOwnerNamespace(
      createDesktopExperienceOwnerNamespace({ namespaceRevision: 1, createdAt: input.clock.now() }),
    );
    if (!initialized.ok) {
      namespace = await input.persistence.loadActiveOwnerNamespace();
      if (namespace === undefined) throw new Error(initialized.error.code);
    } else {
      namespace = initialized.value;
    }
  }
  try {
    return {
      authority,
      identity: deriveDesktopExperiencePreferenceOwnerIdentity(namespace, authority),
    };
  } finally {
    namespace.namespaceKey.fill(0);
  }
}
