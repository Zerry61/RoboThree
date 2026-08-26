import { execFileSync } from "node:child_process";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  JsonObjectSchema,
  MODEL_PROTOCOL_VERSION,
  type ModelRequest,
} from "@robothree/contracts";
import { afterEach, describe, expect, it } from "vitest";

import {
  InMemoryPersonalCredentialStore,
  FakeClock,
  LocalPersonalOpenAiCompatibleModelProvider,
  SystemScheduler,
  PersonalModelProviderProfileRegistry,
  allocatePersonalCredentialReference,
  calculateCredentialBindingDigest,
  createLocalPersonalOpenAiUsageFact,
  createModelRequestV1Alpha2,
  createChatCompletionsUrl,
  createPersonalModelDefinition,
  createPersonalModelOwnerNamespace,
  derivePersonalModelOwnerIdentity,
  mapPersonalModelProviderObservation,
  projectOpenAiCompatibleRequest,
  sha256CanonicalJson,
  validateModelStream,
  LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1,
} from "../src/index.js";
import type { PersonalCredentialStore } from "../src/index.js";

const digest = (marker: string) => `sha256:${marker.repeat(64)}` as const;
const at = "2026-08-21T08:00:00.000Z";
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) =>
    rm(path, { recursive: true, force: true })));
});

describe("DFI-4A.3.1 local Personal Model Provider", () => {
  it("freezes four provider profiles and rejects revision drift", () => {
    const registry = new PersonalModelProviderProfileRegistry();
    expect(registry.list().map((profile) => profile.providerKind)).toEqual([
      "custom", "deepseek", "kimi", "zhipu",
    ]);
    const profile = registry.resolve("deepseek");
    expect(profile).toMatchObject({
      protocol: "openai_compatible",
      endpointMode: "api_base",
      chatCompletionsRelativePath: "chat/completions",
    });
    expect(() => registry.resolve("deepseek", digest("f"))).toThrow("revision_mismatch");
  });

  it("projects only the locked provider model and neutral request fields", () => {
    const request = requestFixture("model.personal.one", digest("b"));
    const projection = projectOpenAiCompatibleRequest(request, "provider-model-one");
    expect(projection).toMatchObject({
      model: "provider-model-one",
      stream: true,
      stream_options: { include_usage: true },
    });
    expect(JSON.stringify(projection)).not.toContain(request.requestId);
    expect(JSON.stringify(projection)).not.toContain("prompt_cache");
  });

  it("treats Endpoint as API base and rejects an already-expanded request URL", () => {
    const profile = new PersonalModelProviderProfileRegistry().resolve("custom");
    expect(createChatCompletionsUrl("https://relay.example.com/v1", profile).toString())
      .toBe("https://relay.example.com/v1/chat/completions");
    expect(() => createChatCompletionsUrl(
      "https://relay.example.com/v1/chat/completions",
      profile,
    )).toThrow("endpoint_must_be_api_base");
  });

  it("does not fabricate Usage when the Provider omits it", () => {
    expect(createLocalPersonalOpenAiUsageFact({
      usageFactId: "019f7447-a784-77b2-a716-000000000721",
      authorityInvocationId: "019f7447-a784-77b2-a716-000000000722",
      fencingEpoch: 1,
      attemptDisposition: "terminal_winner",
      recordedAt: at,
    })).toBeUndefined();
    expect(createLocalPersonalOpenAiUsageFact({
      usageFactId: "019f7447-a784-77b2-a716-000000000721",
      authorityInvocationId: "019f7447-a784-77b2-a716-000000000722",
      fencingEpoch: 1,
      rawUsage: {
        prompt_tokens: 12,
        completion_tokens: 4,
        total_tokens: 16,
        prompt_tokens_details: { cached_tokens: 3 },
      },
      attemptDisposition: "terminal_winner",
      recordedAt: at,
    })).toMatchObject({
      providerInputTokens: 12,
      providerOutputTokens: 4,
      cacheReadInputTokens: 3,
      normalizedTotalInputTokens: 12,
    });
  });

  it("rejects reasoning requests before credential resolution or network dispatch", async () => {
    const registry = new PersonalModelProviderProfileRegistry();
    const credentialRef = allocatePersonalCredentialReference(Buffer.alloc(32, 7));
    const operationId = "019f7447-a784-77b2-a716-000000000711";
    const owner = derivePersonalModelOwnerIdentity(createPersonalModelOwnerNamespace({
      namespaceRevision: 1,
      namespaceKey: Buffer.alloc(32, 9),
      createdAt: at,
    }), { enterpriseId: "enterprise", userId: "user", deviceId: "device" });
    const definition = createPersonalModelDefinition({
      ownerIdentity: owner,
      personalModelId: "model.personal.one",
      providerKind: "custom",
      providerProfileRevision: registry.resolve("custom").profileRevision,
      protocol: "openai_compatible",
      endpoint: "https://provider.invalid/v1",
      providerModelId: "provider-model-one",
      displayName: "Personal One",
      capabilities: ["text", "streaming"],
      credentialRef,
      credentialRevision: 1,
      credentialBindingDigest: calculateCredentialBindingDigest({
        credentialRef,
        createdByOperationId: operationId,
        credentialRevision: 1,
      }),
      createdAt: at,
    });
    let credentialResolveCount = 0;
    let dnsLookupCount = 0;
    const credentials: PersonalCredentialStore = {
      async start() {},
      async stop() {},
      async store() { throw new Error("not used"); },
      async replace() { throw new Error("not used"); },
      async inspect() { throw new Error("not used"); },
      async resolve() {
        credentialResolveCount += 1;
        throw new Error("credential resolution must remain unreachable");
      },
      async delete() { throw new Error("not used"); },
    };
    const provider = new LocalPersonalOpenAiCompatibleModelProvider({
      definition,
      credentialStore: credentials,
      profileRegistry: registry,
      clock: new FakeClock(at),
      scheduler: new SystemScheduler(),
      timeoutPolicy: LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1,
      transport: {
        lookup: async () => {
          dnsLookupCount += 1;
          return [{ address: "192.0.2.1", family: 4 }];
        },
      },
    });
    const base = requestFixture(definition.personalModelId, definition.executionDefinitionDigest);
    const { schemaVersion: _schemaVersion, requestDigest: _requestDigest, ...material } = base;
    const request = createModelRequestV1Alpha2({
      ...material,
      schemaVersion: "v1alpha2",
      reasoning: {
        mode: "default_passthrough",
        reasoningModeLockId: "019f7447-a784-77b2-a716-000000000712",
        reasoningModeLockDigest: digest("d"),
      },
    });

    await expect(provider.stream(request, new AbortController().signal)[Symbol.asyncIterator]().next())
      .rejects.toMatchObject({ code: "reasoning_protocol_unavailable" });
    expect(credentialResolveCount).toBe(0);
    expect(dnsLookupCount).toBe(0);
  });

  it("streams through controlled TLS, ignores null Usage, and assembles Tool/Usage", async () => {
    const tls = await tlsFixture();
    let receivedAuthorization = "";
    let receivedBody = "";
    const server = createServer({ key: tls.key, cert: tls.cert }, (incoming, response) => {
      receivedAuthorization = String(incoming.headers.authorization ?? "");
      incoming.setEncoding("utf8");
      incoming.on("data", (chunk) => { receivedBody += String(chunk); });
      incoming.on("end", () => {
        response.writeHead(200, { "Content-Type": "text/event-stream" });
        const writeFrame = (payload: string) => {
          response.write(`data: ${payload}\r`);
          response.write("\n\r");
          response.write("\n");
        };
        writeFrame(JSON.stringify({ choices: [{ delta: { content: "" } }], usage: null }));
        writeFrame(JSON.stringify({ choices: [{ delta: { reasoning_content: "private" } }], usage: null }));
        writeFrame(JSON.stringify({ choices: [{ delta: { content: "hello" } }], usage: null }));
        writeFrame(JSON.stringify({ choices: [{ delta: { tool_calls: [{
          index: 0, id: "call-1", function: { name: "write_report", arguments: "{\"title\":" },
        }] } }], usage: null }));
        writeFrame(JSON.stringify({ choices: [{ delta: { tool_calls: [{
          index: 0, function: { arguments: "\"Q3\"}" },
        }] }, finish_reason: "tool_calls" }], usage: {
          prompt_tokens: 12, completion_tokens: 4, total_tokens: 16,
        } }));
        writeFrame("[DONE]");
        response.end();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      if (address === null || typeof address === "string") throw new Error("TLS fixture unavailable");
      const registry = new PersonalModelProviderProfileRegistry();
      const credentialRef = allocatePersonalCredentialReference(Buffer.alloc(32, 7));
      const operationId = "019f7447-a784-77b2-a716-000000000711";
      const binding = calculateCredentialBindingDigest({
        credentialRef,
        createdByOperationId: operationId,
        credentialRevision: 1,
      });
      const owner = derivePersonalModelOwnerIdentity(createPersonalModelOwnerNamespace({
        namespaceRevision: 1,
        namespaceKey: Buffer.alloc(32, 9),
        createdAt: at,
      }), { enterpriseId: "enterprise", userId: "user", deviceId: "device" });
      const definition = createPersonalModelDefinition({
        ownerIdentity: owner,
        personalModelId: "model.personal.one",
        providerKind: "custom",
        providerProfileRevision: registry.resolve("custom").profileRevision,
        protocol: "openai_compatible",
        endpoint: `https://localhost:${address.port}/v1`,
        providerModelId: "provider-model-one",
        displayName: "Personal One",
        capabilities: ["text", "streaming", "tool_calling"],
        credentialRef,
        credentialRevision: 1,
        credentialBindingDigest: binding,
        createdAt: at,
      });
      const credentials = new InMemoryPersonalCredentialStore();
      await credentials.start();
      const secret = Buffer.from("sk-test-placeholder-not-real", "utf8");
      expect(await credentials.store(operationId, credentialRef, secret)).toMatchObject({ ok: true });
      secret.fill(0);
      const provider = new LocalPersonalOpenAiCompatibleModelProvider({
        definition,
        credentialStore: credentials,
        profileRegistry: registry,
        clock: new FakeClock(at),
        scheduler: new SystemScheduler(),
        timeoutPolicy: LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1,
        transport: {
          ca: tls.cert,
          testOnlyAllowLoopback: true,
          lookup: async () => [{ address: "127.0.0.1", family: 4 }],
        },
      });
      const controller = new AbortController();
      const events = [];
      const request = requestFixture(definition.personalModelId, definition.executionDefinitionDigest);
      for await (const event of validateModelStream(provider.stream(request, controller.signal), controller.signal)) {
        events.push(event);
      }
      expect(events).toEqual([
        { type: "started" },
        { type: "text_delta", delta: "hello" },
        expect.objectContaining({
          type: "tool_call",
          call: expect.objectContaining({ capabilityId: "tool.write-report", arguments: { title: "Q3" } }),
        }),
        { type: "usage", inputTokens: 12, outputTokens: 4 },
        { type: "completed", finishReason: "tool_calls" },
      ]);
      expect(receivedAuthorization).toBe("Bearer sk-test-placeholder-not-real");
      expect(JSON.parse(receivedBody)).toMatchObject({ model: "provider-model-one", stream: true });
      expect(JSON.stringify(events)).not.toContain("private");
      await credentials.stop();
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it("maps status observations without treating cancellation/deadline as model health", () => {
    expect(mapPersonalModelProviderObservation("success")).toMatchObject({ status: "available" });
    expect(mapPersonalModelProviderObservation("authentication")).toMatchObject({
      status: "authentication_failed",
    });
    expect(mapPersonalModelProviderObservation("network")).toMatchObject({ status: "network_failed" });
    expect(mapPersonalModelProviderObservation("protocol")).toMatchObject({
      status: "protocol_incompatible",
    });
    expect(mapPersonalModelProviderObservation("provider_transient")).toMatchObject({
      status: "unavailable",
    });
    expect(mapPersonalModelProviderObservation("cancelled")).toBeUndefined();
    expect(mapPersonalModelProviderObservation("deadline")).toBeUndefined();
  });
});

function requestFixture(modelId: string, revision: `sha256:${string}`): ModelRequest {
  const material = JsonObjectSchema.parse({
    schemaVersion: MODEL_PROTOCOL_VERSION,
    requestId: "019f7447-a784-77b2-a716-000000000701",
    snapshotId: "019f7447-a784-77b2-a716-000000000702",
    contextSourceDigest: digest("a"),
    model: { capabilityId: modelId, capabilityRevision: revision },
    messages: [{
      schemaVersion: MODEL_PROTOCOL_VERSION,
      role: "user",
      content: [{ type: "text", text: "hello" }],
    }],
    tools: [{
      taskId: "019f7447-a784-77b2-a716-000000000703",
      lockId: "019f7447-a784-77b2-a716-000000000704",
      capabilityId: "tool.write-report",
      capabilityRevision: digest("c"),
      name: "write_report",
      description: "Write a report",
      inputSchema: { type: "object", properties: { title: { type: "string" } } },
    }],
    artifacts: [],
    maxOutputTokens: 1024,
  });
  return { ...material, requestDigest: sha256CanonicalJson(material) } as ModelRequest;
}

async function tlsFixture(): Promise<Readonly<{ key: Buffer; cert: Buffer }>> {
  const directory = await mkdtemp(join(tmpdir(), "robothree-dfi4a31-tls-"));
  temporaryDirectories.push(directory);
  const keyPath = join(directory, "server.key");
  const certPath = join(directory, "server.crt");
  execFileSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
    "-keyout", keyPath, "-out", certPath, "-subj", "/CN=localhost",
    "-addext", "subjectAltName=DNS:localhost",
  ], { stdio: "ignore" });
  return { key: await readFile(keyPath), cert: await readFile(certPath) };
}
