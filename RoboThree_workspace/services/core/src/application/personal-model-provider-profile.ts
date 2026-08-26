import {
  JsonValueSchema,
  PersonalModelProviderSchema,
  Sha256DigestSchema,
  canonicalJsonStringify,
  type PersonalModelProvider,
  type Sha256Digest,
} from "@robothree/contracts";
import { createHash } from "node:crypto";
import { z } from "zod";

const PROFILE_DOMAIN = "robothree.personal-model.provider-profile.v1";

export const PersonalModelProviderProfileSchema = z.object({
  providerKind: PersonalModelProviderSchema,
  profileRevision: Sha256DigestSchema,
  protocol: z.literal("openai_compatible"),
  endpointMode: z.literal("api_base"),
  chatCompletionsRelativePath: z.literal("chat/completions"),
  authScheme: z.literal("bearer"),
  requestProjectionRevision: Sha256DigestSchema,
  responseProjectionRevision: Sha256DigestSchema,
  transportPolicyRevision: Sha256DigestSchema,
}).strict();

export type PersonalModelProviderProfile = z.infer<
  typeof PersonalModelProviderProfileSchema
>;

export class PersonalModelProviderProfileRegistry {
  readonly #profiles: ReadonlyMap<PersonalModelProvider, PersonalModelProviderProfile>;

  public constructor(profiles: readonly PersonalModelProviderProfile[] = builtinProfiles()) {
    const parsed = profiles.map((profile) => validateProfile(profile));
    if (new Set(parsed.map((profile) => profile.providerKind)).size !== parsed.length) {
      throw new PersonalModelProviderProfileError("personal_model.provider_profile_duplicate");
    }
    this.#profiles = new Map(parsed.map((profile) => [profile.providerKind, profile]));
  }

  public resolve(
    providerKind: PersonalModelProvider,
    expectedRevision?: string,
  ): PersonalModelProviderProfile {
    const profile = this.#profiles.get(PersonalModelProviderSchema.parse(providerKind));
    if (profile === undefined) {
      throw new PersonalModelProviderProfileError("personal_model.provider_profile_not_found");
    }
    if (expectedRevision !== undefined && profile.profileRevision !== expectedRevision) {
      throw new PersonalModelProviderProfileError("personal_model.provider_profile_revision_mismatch");
    }
    return profile;
  }

  public list(): readonly PersonalModelProviderProfile[] {
    return Object.freeze([...this.#profiles.values()].sort((left, right) =>
      left.providerKind.localeCompare(right.providerKind)));
  }
}

export class PersonalModelProviderProfileError extends Error {
  public constructor(public readonly code:
    | "personal_model.provider_profile_duplicate"
    | "personal_model.provider_profile_not_found"
    | "personal_model.provider_profile_revision_mismatch"
    | "personal_model.provider_profile_integrity_invalid") {
    super(code);
    this.name = "PersonalModelProviderProfileError";
  }
}

function builtinProfiles(): readonly PersonalModelProviderProfile[] {
  return (["deepseek", "zhipu", "kimi", "custom"] as const).map((providerKind) =>
    createProfile(providerKind));
}

function createProfile(providerKind: PersonalModelProvider): PersonalModelProviderProfile {
  const material = {
    providerKind,
    protocol: "openai_compatible",
    endpointMode: "api_base",
    chatCompletionsRelativePath: "chat/completions",
    authScheme: "bearer",
    requestProjectionRevision: digest("request", providerKind),
    responseProjectionRevision: digest("response", providerKind),
    transportPolicyRevision: digest("transport", providerKind),
  } as const;
  return PersonalModelProviderProfileSchema.parse({
    ...material,
    profileRevision: profileDigest(material),
  });
}

function validateProfile(profile: PersonalModelProviderProfile): PersonalModelProviderProfile {
  const parsed = PersonalModelProviderProfileSchema.parse(profile);
  const { profileRevision, ...material } = parsed;
  if (profileRevision !== profileDigest(material)) {
    throw new PersonalModelProviderProfileError(
      "personal_model.provider_profile_integrity_invalid",
    );
  }
  return parsed;
}

function profileDigest(material: Omit<PersonalModelProviderProfile, "profileRevision">): Sha256Digest {
  return sha256(`${PROFILE_DOMAIN}\u0000${canonicalJsonStringify(JsonValueSchema.parse(material))}`);
}

function digest(kind: "request" | "response" | "transport", providerKind: string): Sha256Digest {
  return sha256(`${PROFILE_DOMAIN}.${kind}\u0000${providerKind}\u0000revision-1`);
}

function sha256(value: string): Sha256Digest {
  return Sha256DigestSchema.parse(
    `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`,
  );
}
