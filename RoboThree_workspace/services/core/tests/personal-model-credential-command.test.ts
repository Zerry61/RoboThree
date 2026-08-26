import { describe, expect, it } from "vitest";

import {
  ConservativePersonalCredentialReferenceUsage,
  ConservativePersonalModelDeletionGuard,
  FakeClock,
  InMemoryPersonalCredentialStore,
  InMemoryPersonalModelPersistence,
  PersonalModelCredentialCoordinator,
  PreparePersonalModelCredentialMutationCommandSchema,
  UnavailablePersonalModelOwnerAuthorityContextProvider,
  calculatePersonalModelCredentialCommandDigest,
  createPersonalModelCredentialCommand,
  type PersonalModelCredentialCommandMaterial,
} from "../src/index.js";

const digest = (marker: string) => `sha256:${marker.repeat(64)}` as const;

describe("DFI-4A.2.2 command and production boundary", () => {
  it("uses the same digest for canonical-equivalent Endpoint, Unicode and capability material", () => {
    const first = createMaterial({
      endpoint: "https://EXAMPLE.com:443/v1",
      displayName: "Mode\u0301l",
      capabilities: ["text", "streaming", "text"],
    });
    const second = createMaterial({
      endpoint: "https://example.com/v1",
      displayName: "Modél",
      capabilities: ["streaming", "text"],
    });
    expect(calculatePersonalModelCredentialCommandDigest(first))
      .toBe(calculatePersonalModelCredentialCommandDigest(second));
  });

  it.each([
    ["model", (value: ReturnType<typeof createMaterial>) => ({ ...value, personalModelId: "model.personal.changed" })],
    ["provider", (value: ReturnType<typeof createMaterial>) => ({
      ...value,
      target: { ...value.target, providerKind: "zhipu" as const },
    })],
    ["profile", (value: ReturnType<typeof createMaterial>) => ({
      ...value,
      target: { ...value.target, providerProfileRevision: digest("b") },
    })],
    ["endpoint", (value: ReturnType<typeof createMaterial>) => ({
      ...value,
      target: { ...value.target, endpoint: "https://other.example.com/v1" },
    })],
    ["provider model", (value: ReturnType<typeof createMaterial>) => ({
      ...value,
      target: { ...value.target, providerModelId: "different-model" },
    })],
    ["display name", (value: ReturnType<typeof createMaterial>) => ({
      ...value,
      target: { ...value.target, displayName: "Different" },
    })],
  ])("binds %s changes into the request digest", (_label, change) => {
    const original = createMaterial();
    expect(calculatePersonalModelCredentialCommandDigest(change(original)))
      .not.toBe(calculatePersonalModelCredentialCommandDigest(original));
  });

  it("strictly rejects unknown fields and inconsistent Secret expectation", () => {
    const create = createPersonalModelCredentialCommand(createMaterial());
    expect(PreparePersonalModelCredentialMutationCommandSchema.safeParse({
      ...create,
      rendererOwnerId: "forbidden",
    }).success).toBe(false);
    expect(PreparePersonalModelCredentialMutationCommandSchema.safeParse({
      commandId: uuid(2),
      commandType: "update",
      requestDigest: digest("c"),
      personalModelId: "model.personal.test",
      expectedConfigurationRevision: digest("d"),
      expectedExecutionDefinitionDigest: digest("e"),
      target: create.target,
      credentialMutation: "replace_secret",
      credentialInputExpected: false,
    }).success).toBe(false);
  });

  it("does not provide a field in which callers can submit Secret or owner authority", () => {
    const command = createPersonalModelCredentialCommand(createMaterial());
    expect(Object.keys(command).sort()).toEqual([
      "commandId",
      "commandType",
      "credentialInputExpected",
      "personalModelId",
      "requestDigest",
      "target",
    ]);
    expect(JSON.stringify(command)).not.toMatch(/secret|credentialRef|owner|enterprise|userId|deviceId/iu);
  });

  it("keeps default production authority unavailable without blocking persistence startup", async () => {
    const persistence = new InMemoryPersonalModelPersistence();
    const credentials = new InMemoryPersonalCredentialStore();
    await persistence.start();
    await credentials.start();
    try {
      const coordinator = new PersonalModelCredentialCoordinator({
        persistence,
        credentials,
        authorityContexts: new UnavailablePersonalModelOwnerAuthorityContextProvider(),
        deletionGuard: new ConservativePersonalModelDeletionGuard(),
        credentialUsage: new ConservativePersonalCredentialReferenceUsage(),
        clock: new FakeClock("2026-08-21T10:00:00.000Z"),
      });
      expect(await coordinator.prepare(createPersonalModelCredentialCommand(createMaterial())))
        .toMatchObject({
          ok: false,
          error: { code: "personal_model.permission_denied" },
        });
      expect(await persistence.loadActiveOwnerNamespace()).toBeDefined();
    } finally {
      await credentials.stop();
      await persistence.stop();
    }
  });
});

function createMaterial(overrides: Readonly<{
  endpoint?: string;
  displayName?: string;
  capabilities?: readonly ("streaming" | "text")[];
}> = {}): Extract<PersonalModelCredentialCommandMaterial, { commandType: "create" }> {
  return {
    commandId: uuid(1),
    commandType: "create",
    personalModelId: "model.personal.test",
    target: {
      providerKind: "deepseek",
      providerProfileRevision: digest("a"),
      protocol: "openai_compatible",
      endpoint: overrides.endpoint ?? "https://example.com/v1",
      providerModelId: "deepseek-test",
      displayName: overrides.displayName ?? "Personal Model",
      capabilities: [...(overrides.capabilities ?? ["streaming", "text"])],
    },
    credentialInputExpected: true,
  };
}

function uuid(offset: number): string {
  return `10000000-0000-4000-8000-${offset.toString().padStart(12, "0")}`;
}
