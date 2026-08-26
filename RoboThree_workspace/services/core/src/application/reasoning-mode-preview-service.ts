import {
  PreviewReasoningModeQuerySchema,
  ReasoningModePreviewSchema,
  type PreviewReasoningModeQuery,
  type ReasoningModePreview,
} from "@robothree/contracts";

import type { Clock } from "../ports/clock.js";
import type {
  DesktopReasoningModeOwnerAuthorityProvider,
  DesktopReasoningModePreferencePersistence,
  EffectiveReasoningModelResolver,
  ReasoningProfileSource,
} from "../ports/desktop-reasoning-mode.js";
import {
  calculateReasoningSupportRevision,
  validateReasoningProfile,
} from "./desktop-reasoning-mode-domain.js";
import { resolveDesktopReasoningModeOwner } from "./desktop-reasoning-mode-owner.js";

export class ReasoningModePreviewService {
  public constructor(private readonly dependencies: Readonly<{
    models: EffectiveReasoningModelResolver<PreviewReasoningModeQuery>;
    profiles: ReasoningProfileSource;
    preferences: DesktopReasoningModePreferencePersistence;
    ownerAuthority: DesktopReasoningModeOwnerAuthorityProvider;
    clock: Clock;
  }>) {}

  public async preview(raw: PreviewReasoningModeQuery): Promise<ReasoningModePreview> {
    const query = PreviewReasoningModeQuerySchema.parse(raw);
    const model = await this.dependencies.models.resolve(query);
    if (model.modelId !== model.subject.modelCapabilityId
      || model.modelRevision !== model.subject.modelCapabilityRevision) {
      throw new Error("Reasoning Mode effective model identity is inconsistent");
    }
    const loadedProfile = await this.dependencies.profiles.loadExact(model.subject);
    const profile = loadedProfile === undefined ? undefined : validateReasoningProfile(loadedProfile);
    const maxSupport = profile?.support ?? "unknown";
    const maxSupportRevision = calculateReasoningSupportRevision({
      subject: model.subject,
      ...(profile === undefined ? {} : { profile }),
    });

    const owner = await resolveDesktopReasoningModeOwner({
      authorityProvider: this.dependencies.ownerAuthority,
      persistence: this.dependencies.preferences,
      clock: this.dependencies.clock,
      expectedClientInstanceId: query.clientInstanceId,
    });
    const preference = owner === undefined
      ? undefined
      : await this.dependencies.preferences.loadPreference(owner.identity);

    return ReasoningModePreviewSchema.parse({
      effectiveModelId: model.modelId,
      effectiveModelRevision: model.modelRevision,
      maxSupport,
      maxSupportRevision,
      ...(maxSupport === "supported" ? {} : {
        safeUnavailableReason: safeUnavailableReason(maxSupport, profile?.safeUnavailableReasonCode),
      }),
      preference: preference?.requestedMode ?? "default",
      ...(owner === undefined ? {} : { preferenceRevision: preference?.preferenceRevision ?? 0 }),
      preferencePersistence: owner === undefined ? "unavailable" : "available",
      testIdentityUsed: owner?.authority.testIdentityUsed ?? false,
      productionIdentityReady: owner?.authority.productionIdentityReady ?? false,
    });
  }
}

function safeUnavailableReason(
  support: "unsupported" | "unknown",
  safeCode: string | undefined,
): string {
  if (safeCode !== undefined) return safeCode;
  return support === "unsupported"
    ? "当前模型不支持 Max，将使用模型默认模式。"
    : "当前模型的 Max 支持状态尚未验证，将使用模型默认模式。";
}
