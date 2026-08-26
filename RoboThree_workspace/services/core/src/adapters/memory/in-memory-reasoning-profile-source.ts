import type {
  ReasoningProfile,
  ReasoningProfileSubject,
} from "@robothree/contracts/reasoning-mode/v1alpha1";

import {
  sameReasoningProfileSubject,
  validateReasoningProfile,
} from "../../application/desktop-reasoning-mode-domain.js";
import type { ReasoningProfileSource } from "../../ports/desktop-reasoning-mode.js";

export class InMemoryReasoningProfileSource implements ReasoningProfileSource {
  readonly #profiles: ReasoningProfile[];

  public constructor(profiles: readonly ReasoningProfile[] = []) {
    this.#profiles = profiles.map(validateReasoningProfile);
  }

  public async loadExact(subject: ReasoningProfileSubject): Promise<ReasoningProfile | undefined> {
    return this.#profiles.find((profile) => sameReasoningProfileSubject(profile.subject, subject));
  }
}
