import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

type JsonObject = Record<string, unknown>;

type FixtureCase = {
  schema: string;
  file: string;
  valid: boolean;
};

type FixtureManifest = {
  contractVersion: string;
  canonicalDigest: {
    value: unknown;
    canonicalJson: string;
    sha256: string;
  };
  cases: FixtureCase[];
};

const contractRoot = resolve(
  process.cwd(),
  "contracts/enterprise-gateway/v1alpha1",
);
const schemasRoot = join(contractRoot, "schemas");

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function asObject(value: unknown): JsonObject | undefined {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return undefined;
  }
  return value as JsonObject;
}

function resolveJsonPointer(root: unknown, pointer: string): unknown {
  let current = root;
  for (const segment of pointer.split("/").slice(1)) {
    const object = asObject(current);
    if (object === undefined) {
      return undefined;
    }
    current = object[segment.replaceAll("~1", "/").replaceAll("~0", "~")];
  }
  return current;
}

function validateSchema(
  schema: unknown,
  value: unknown,
  schemaPath: string,
  rootSchema: unknown = schema,
): string[] {
  const object = asObject(schema);
  if (object === undefined) {
    return ["schema is not an object"];
  }

  if (typeof object.$ref === "string") {
    if (object.$ref.startsWith("#")) {
      const target = resolveJsonPointer(rootSchema, object.$ref.slice(1));
      return validateSchema(target, value, schemaPath, rootSchema);
    }
    const [fileName, fragment] = object.$ref.split("#");
    const externalPath = resolve(dirname(schemaPath), fileName);
    const externalSchema = readJson(externalPath);
    const target =
      fragment === undefined || fragment === ""
        ? externalSchema
        : resolveJsonPointer(externalSchema, fragment);
    return validateSchema(target, value, externalPath, externalSchema);
  }

  if (Array.isArray(object.oneOf)) {
    const matches = object.oneOf.filter(
      (candidate) =>
        validateSchema(candidate, value, schemaPath, rootSchema).length === 0,
    ).length;
    return matches === 1 ? [] : [`oneOf matched ${matches} branches`];
  }

  const errors: string[] = [];

  if (Object.hasOwn(object, "const") && value !== object.const) {
    errors.push("const mismatch");
  }
  if (
    Array.isArray(object.enum) &&
    !object.enum.some((candidate) => candidate === value)
  ) {
    errors.push("enum mismatch");
  }

  if (typeof object.type === "string") {
    const typeMatches =
      object.type === "object"
        ? asObject(value) !== undefined
        : object.type === "array"
          ? Array.isArray(value)
          : object.type === "integer"
            ? typeof value === "number" && Number.isInteger(value)
            : typeof value === object.type;
    if (!typeMatches) {
      return [...errors, `expected ${object.type}`];
    }
  }

  if (typeof value === "string") {
    if (
      typeof object.minLength === "number" &&
      value.length < object.minLength
    ) {
      errors.push("string below minLength");
    }
    if (
      typeof object.maxLength === "number" &&
      value.length > object.maxLength
    ) {
      errors.push("string exceeds maxLength");
    }
    if (
      typeof object.pattern === "string" &&
      !new RegExp(object.pattern, "u").test(value)
    ) {
      errors.push("pattern mismatch");
    }
    if (
      object.format === "uuid" &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        value,
      )
    ) {
      errors.push("invalid uuid");
    }
    if (
      object.format === "date-time" &&
      Number.isNaN(Date.parse(value))
    ) {
      errors.push("invalid date-time");
    }
    if (
      typeof object["x-robothree-maxUtf8Bytes"] === "number" &&
      Buffer.byteLength(value, "utf8") > object["x-robothree-maxUtf8Bytes"]
    ) {
      errors.push("UTF-8 byte limit exceeded");
    }
  }

  if (typeof value === "number") {
    if (typeof object.minimum === "number" && value < object.minimum) {
      errors.push("number below minimum");
    }
    if (typeof object.maximum === "number" && value > object.maximum) {
      errors.push("number exceeds maximum");
    }
  }

  if (Array.isArray(value)) {
    if (typeof object.minItems === "number" && value.length < object.minItems) {
      errors.push("array below minItems");
    }
    if (typeof object.maxItems === "number" && value.length > object.maxItems) {
      errors.push("array exceeds maxItems");
    }
    if (object.uniqueItems === true) {
      const unique = new Set(value.map((item) => JSON.stringify(item)));
      if (unique.size !== value.length) {
        errors.push("array items are not unique");
      }
    }
    if (object.items !== undefined) {
      for (const [index, item] of value.entries()) {
        errors.push(
          ...validateSchema(
            object.items,
            item,
            schemaPath,
            rootSchema,
          ).map((error) => `[${index}] ${error}`),
        );
      }
    }
  }

  const valueObject = asObject(value);
  if (valueObject !== undefined) {
    const properties = asObject(object.properties) ?? {};
    if (Array.isArray(object.required)) {
      for (const required of object.required) {
        if (typeof required === "string" && !Object.hasOwn(valueObject, required)) {
          errors.push(`missing required ${required}`);
        }
      }
    }
    if (object.additionalProperties === false) {
      for (const key of Object.keys(valueObject)) {
        if (!Object.hasOwn(properties, key)) {
          errors.push(`unknown property ${key}`);
        }
      }
    }
    if (
      typeof object.maxProperties === "number" &&
      Object.keys(valueObject).length > object.maxProperties
    ) {
      errors.push("object exceeds maxProperties");
    }
    for (const [key, propertySchema] of Object.entries(properties)) {
      if (Object.hasOwn(valueObject, key)) {
        errors.push(
          ...validateSchema(
            propertySchema,
            valueObject[key],
            schemaPath,
            rootSchema,
          ).map((error) => `${key}: ${error}`),
        );
      }
    }
  }

  if (
    typeof object["x-robothree-maxDocumentBytes"] === "number" &&
    Buffer.byteLength(JSON.stringify(value), "utf8") >
      object["x-robothree-maxDocumentBytes"]
  ) {
    errors.push("document byte limit exceeded");
  }

  return errors;
}

function containsKey(value: unknown, forbiddenKey: string): boolean {
  if (Array.isArray(value)) {
    return value.some((entry) => containsKey(entry, forbiddenKey));
  }
  const object = asObject(value);
  if (object === undefined) {
    return false;
  }
  return (
    Object.hasOwn(object, forbiddenKey) ||
    Object.values(object).some((entry) => containsKey(entry, forbiddenKey))
  );
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  const object = asObject(value);
  if (object !== undefined) {
    return `{${Object.keys(object)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalJson(object[key])}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function normalizeProviderStub(value: unknown): unknown[] {
  const fixture = asObject(value);
  if (fixture === undefined || !Array.isArray(fixture.frames)) {
    throw new Error("provider stub fixture is malformed");
  }
  const protocol = fixture.protocol;
  const events: unknown[] = [];

  for (const frameValue of fixture.frames) {
    const frame = asObject(frameValue);
    if (frame === undefined) {
      throw new Error("provider stub frame is malformed");
    }
    if (protocol === "anthropic_compatible") {
      if (frame.type === "message_start") {
        events.push({ eventType: "started", payload: {} });
      } else if (frame.type === "content_block_delta") {
        const delta = asObject(frame.delta);
        if (delta?.type === "text_delta") {
          events.push({
            eventType: "text_delta",
            payload: { delta: delta.text },
          });
        }
      } else if (frame.type === "message_delta") {
        const usage = asObject(frame.usage);
        events.push({
          eventType: "completed",
          payload: {
            finishReason: frame.stop_reason === "end_turn" ? "stop" : frame.stop_reason,
            usage: {
              inputTokens: usage?.input_tokens,
              outputTokens: usage?.output_tokens,
            },
          },
        });
      }
    } else if (protocol === "openai_compatible") {
      const choices = Array.isArray(frame.choices) ? frame.choices : [];
      const choice = asObject(choices[0]);
      const delta = asObject(choice?.delta);
      if (delta?.role === "assistant") {
        events.push({ eventType: "started", payload: {} });
      }
      if (typeof delta?.content === "string") {
        events.push({
          eventType: "text_delta",
          payload: { delta: delta.content },
        });
      }
      if (typeof choice?.finish_reason === "string") {
        const usage = asObject(frame.usage);
        events.push({
          eventType: "completed",
          payload: {
            finishReason: choice.finish_reason,
            usage: {
              inputTokens: usage?.prompt_tokens,
              outputTokens: usage?.completion_tokens,
            },
          },
        });
      }
    } else {
      throw new Error(`unsupported test protocol ${String(protocol)}`);
    }
  }
  return events;
}

function lifecycleEventMatchesPayload(value: unknown): boolean {
  const event = asObject(value);
  const payload = asObject(event?.eventPayload);
  if (event?.eventClass !== "durable" || payload === undefined) {
    return false;
  }
  const expectedStatus = new Map<unknown, unknown>([
    ["accepted", "accepted"],
    ["dispatch_decided", "running"],
    ["completed", "completed"],
    ["failed", "failed"],
    ["cancelled", "cancelled"],
    ["timed_out", "timed_out"],
    ["uncertain", "uncertain"],
  ]).get(event.eventType);
  return expectedStatus !== undefined && payload.status === expectedStatus;
}

describe("Enterprise Gateway canonical Contract v1alpha1", () => {
  const manifest = readJson(
    join(contractRoot, "fixtures/manifest.json"),
  ) as FixtureManifest;

  it("has exactly one canonical root and the required documents", () => {
    expect(manifest.contractVersion).toBe("v1alpha1");
    expect(readFileSync(join(contractRoot, "openapi.yaml"), "utf8")).toContain(
      "openapi: 3.1.0",
    );
    expect(
      readdirSync(schemasRoot).sort(),
    ).toEqual([
      "access-token-claims.schema.json",
      "compatibility.schema.json",
      "configuration-snapshot.schema.json",
      "descriptor.schema.json",
      "device-challenge.schema.json",
      "enrollment.schema.json",
      "error.schema.json",
      "exact-package-read.schema.json",
      "model-invocation-recovery.schema.json",
      "model-invocation.schema.json",
      "package-document.schema.json",
      "token.schema.json",
    ]);
  });

  it("accepts and rejects the shared fixture corpus", () => {
    for (const fixtureCase of manifest.cases) {
      const schemaPath = join(
        schemasRoot,
        `${fixtureCase.schema}.schema.json`,
      );
      const schema = readJson(schemaPath);
      const fixture = readJson(join(contractRoot, "fixtures", fixtureCase.file));
      const errors = validateSchema(schema, fixture, schemaPath);
      expect(
        errors.length === 0,
        `${fixtureCase.file}: ${errors.join("; ")}`,
      ).toBe(fixtureCase.valid);
    }
  });

  it("freezes canonical JSON and SHA-256 digest behavior", () => {
    const canonical = canonicalJson(manifest.canonicalDigest.value);
    expect(canonical).toBe(manifest.canonicalDigest.canonicalJson);
    expect(createHash("sha256").update(canonical).digest("hex")).toBe(
      manifest.canonicalDigest.sha256,
    );
  });

  it("keeps enterprise credential references out of client configuration", () => {
    for (const fixtureCase of manifest.cases.filter((item) => item.valid)) {
      const fixture = readJson(join(contractRoot, "fixtures", fixtureCase.file));
      if (
        fixtureCase.schema === "descriptor" ||
        fixtureCase.schema === "configuration-snapshot"
      ) {
        expect(containsKey(fixture, "credentialRef")).toBe(false);
      }
    }
  });

  it("keeps OA wire details and local device private-key handles out of the canonical identity protocol", () => {
    const openApi = readFileSync(join(contractRoot, "openapi.yaml"), "utf8");
    for (const forbidden of [
      "/oidc",
      "authorizationCode:",
      "codeVerifier:",
      "username:",
      "password:",
    ]) {
      expect(openApi).not.toContain(forbidden);
    }
    const identitySchemas = [
      "device-challenge.schema.json",
      "enrollment.schema.json",
      "token.schema.json",
      "access-token-claims.schema.json",
    ]
      .map((file) => readFileSync(join(schemasRoot, file), "utf8"))
      .join("\n");
    for (const forbidden of [
      '"authorizationCode"',
      '"codeVerifier"',
      '"username"',
      '"password"',
      '"privateKey"',
      '"keychainHandle"',
      '"providerReference"',
    ]) {
      expect(identitySchemas).not.toContain(forbidden);
    }

    for (const fixtureFile of [
      "valid/device-challenge-request.json",
      "valid/device-enrollment-challenge-request.json",
      "valid/device-challenge.json",
      "valid/enrollment-request.json",
      "valid/token-request.json",
      "valid/access-token-claims.json",
    ]) {
      const fixture = readJson(join(contractRoot, "fixtures", fixtureFile));
      for (const forbidden of [
        "privateKey",
        "keychainHandle",
        "providerReference",
        "clientCredential",
        "refreshCredential",
        "oaTicket",
      ]) {
        expect(containsKey(fixture, forbidden), `${fixtureFile}: ${forbidden}`).toBe(
          false,
        );
      }
    }
  });

  it("binds each identity HTTP operation to an exact request or response schema branch", () => {
    const openApi = readFileSync(join(contractRoot, "openapi.yaml"), "utf8");
    for (const schemaRef of [
      "device-challenge.schema.json#/$defs/deviceChallengeRequest",
      "device-challenge.schema.json#/$defs/deviceChallenge",
      "enrollment.schema.json#/$defs/enrollDeviceRequest",
      "enrollment.schema.json#/$defs/enrollDeviceResult",
      "token.schema.json#/$defs/issueAccessTokenRequest",
      "token.schema.json#/$defs/tokenResult",
    ]) {
      expect(openApi, schemaRef).toContain(schemaRef);
    }
  });

  it("requires enterprise identity, managed device trust, and bound access-token claims", () => {
    const compatibility = readJson(
      join(contractRoot, "fixtures/valid/compatibility.json"),
    ) as JsonObject;
    expect(compatibility.features).toEqual(
      expect.arrayContaining([
        "enterprise_identity",
        "managed_device_trust",
        "manual_device_enrollment",
        "enterprise_model_gateway",
      ]),
    );
    expect(compatibility.features).not.toContain("enterprise_sso");

    const claims = readJson(
      join(contractRoot, "fixtures/valid/access-token-claims.json"),
    ) as JsonObject;
    for (const field of [
      "enterpriseId",
      "userId",
      "deviceId",
      "clientInstanceId",
      "tokenId",
      "permissions",
      "contractVersion",
    ]) {
      expect(Object.hasOwn(claims, field), field).toBe(true);
    }
  });

  it("publishes the complete device trust and anti-replay typed error corpus", () => {
    const expectedCodes = [
      "device_not_managed",
      "device_not_compliant",
      "device_access_denied",
      "device_challenge_expired",
      "device_challenge_replayed",
      "device_signature_invalid",
      "device_context_mismatch",
    ];
    const manifest = readJson(
      join(contractRoot, "fixtures/manifest.json"),
    ) as FixtureManifest;
    const actualCodes = manifest.cases
      .filter(
        (fixtureCase) =>
          fixtureCase.valid &&
          fixtureCase.schema === "error" &&
          fixtureCase.file.includes("device-"),
      )
      .map((fixtureCase) => {
        const fixture = readJson(
          join(contractRoot, "fixtures", fixtureCase.file),
        ) as JsonObject;
        return fixture.code;
      });
    expect(actualCodes).toEqual(expectedCodes);
  });

  it("enforces UTF-8 package file and document safety limits", () => {
    const schemaPath = join(schemasRoot, "package-document.schema.json");
    const schema = readJson(schemaPath);
    const fixture = readJson(
      join(contractRoot, "fixtures/valid/skill-package.json"),
    ) as JsonObject;
    const files = fixture.files as JsonObject[];
    const oversized = {
      ...fixture,
      files: [{ ...files[0], utf8Content: "界".repeat(174_763) }],
    };

    expect(validateSchema(schema, fixture, schemaPath)).toEqual([]);
    expect(validateSchema(schema, oversized, schemaPath)).toContain(
      "files: [0] utf8Content: UTF-8 byte limit exceeded",
    );
  });

  it("freezes the Model Invocation HTTP surface and GET/POST-only boundary", () => {
    const openApi = readFileSync(join(contractRoot, "openapi.yaml"), "utf8");
    for (const required of [
      "/v1alpha1/model-invocations:",
      "/v1alpha1/model-invocations/{invocationId}:",
      "/v1alpha1/model-invocations/{invocationId}/cancel:",
      "/v1alpha1/model-invocations/{invocationId}/events:",
      "acceptModelInvocation",
      "getModelInvocation",
      "cancelModelInvocation",
      "streamModelInvocationEvents",
      "model-invocation.schema.json#/$defs/acceptRequest",
      "model-invocation.schema.json#/$defs/acceptedResponse",
      "model-invocation.schema.json#/$defs/statusResponse",
      "model-invocation.schema.json#/$defs/cancelRequest",
      "model-invocation.schema.json#/$defs/eventEnvelope",
      "text/event-stream",
    ]) {
      expect(openApi, required).toContain(required);
    }
    expect(openApi).not.toMatch(/^\s+(put|patch|delete):/mu);
  });

  it("keeps identity, credentials, Provider endpoints, and recovery lease control out of Model accept requests", () => {
    for (const fixtureFile of [
      "valid/model-invocation-accept-synthetic.json",
      "valid/model-invocation-accept-user-confirmed.json",
    ]) {
      const fixture = readJson(join(contractRoot, "fixtures", fixtureFile));
      for (const forbidden of [
        "enterpriseId",
        "userId",
        "deviceId",
        "credentialRef",
        "apiKey",
        "accessToken",
        "providerEndpoint",
        "leaseTtlMillis",
        "recoveryQueryDeadlineMillis",
      ]) {
        expect(containsKey(fixture, forbidden), `${fixtureFile}: ${forbidden}`).toBe(
          false,
        );
      }
      const object = asObject(fixture);
      expect(object?.audience).toBe("enterprise-model-gateway");
      expect(object?.requiredPermission).toBe("model.use");
    }
  });

  it("separates durable facts from ephemeral Model stream events", () => {
    const durable = readJson(
      join(contractRoot, "fixtures/valid/model-invocation-event-durable.json"),
    ) as JsonObject;
    const ephemeral = readJson(
      join(contractRoot, "fixtures/valid/model-invocation-event-text-delta.json"),
    ) as JsonObject;
    expect(durable.eventClass).toBe("durable");
    expect(durable).toHaveProperty("durableSequence");
    expect(durable).toHaveProperty("durableCursor");
    expect(durable).not.toHaveProperty("streamSequence");
    expect(ephemeral.eventClass).toBe("ephemeral");
    expect(ephemeral).toHaveProperty("streamSequence");
    expect(ephemeral).not.toHaveProperty("durableSequence");
    expect(ephemeral).not.toHaveProperty("durableCursor");
    expect(lifecycleEventMatchesPayload(durable)).toBe(true);

    const mismatched = structuredClone(durable);
    (mismatched.eventPayload as JsonObject).status = "completed";
    expect(lifecycleEventMatchesPayload(mismatched)).toBe(false);
  });

  it("enforces non-bypassable UTF-8 limits for Model content and stream deltas", () => {
    const schemaPath = join(schemasRoot, "model-invocation.schema.json");
    const schema = readJson(schemaPath);
    const definitions = asObject((schema as JsonObject).$defs);
    const accept = readJson(
      join(contractRoot, "fixtures/valid/model-invocation-accept-synthetic.json"),
    ) as JsonObject;
    const messages = (accept.modelRequest as JsonObject).messages as JsonObject[];
    const content = messages[1]?.content as JsonObject[];
    const oversizedRequest = structuredClone(accept);
    const oversizedMessages =
      (oversizedRequest.modelRequest as JsonObject).messages as JsonObject[];
    const oversizedContent = oversizedMessages[1]?.content as JsonObject[];
    oversizedContent[0].text = "界".repeat(174_763);

    const event = readJson(
      join(contractRoot, "fixtures/valid/model-invocation-event-text-delta.json"),
    ) as JsonObject;
    const oversizedEvent = structuredClone(event);
    (oversizedEvent.eventPayload as JsonObject).delta = "界".repeat(43_691);

    expect(content[0]?.text).toBeTypeOf("string");
    expect(
      validateSchema(
        definitions?.textPart,
        oversizedContent[0],
        schemaPath,
        schema,
      ),
    ).toContain("text: UTF-8 byte limit exceeded");
    expect(
      validateSchema(
        definitions?.ephemeralTextDeltaEvent,
        oversizedEvent,
        schemaPath,
        schema,
      ),
    ).toContain("eventPayload: delta: UTF-8 byte limit exceeded");
  });

  it("keeps recovery policy server-owned and requires fencing on every durable commit", () => {
    const policy = readJson(
      join(contractRoot, "fixtures/valid/model-invocation-recovery-policy.json"),
    ) as JsonObject;
    const lease = readJson(
      join(contractRoot, "fixtures/valid/model-invocation-recovery-lease.json"),
    ) as JsonObject;
    const commit = readJson(
      join(contractRoot, "fixtures/valid/model-invocation-recovery-fenced-commit.json"),
    ) as JsonObject;
    expect(policy).toHaveProperty("leaseTtlMillis");
    expect(policy).toHaveProperty("recoveryQueryDeadlineMillis");
    expect(policy).not.toHaveProperty("providerRequestDeadlineAt");
    expect(policy).not.toHaveProperty("providerStreamIdleTimeoutMillis");
    expect(lease.fencingEpoch).toBeGreaterThan(0);
    expect(commit.fencingEpoch).toBeGreaterThan(0);
    expect(commit).toHaveProperty("expectedStatusRevision");
    expect(commit).toHaveProperty("nextDurableSequence");
  });

  it("normalizes Anthropic-compatible and OpenAI-compatible private frames to one provider-neutral projection", () => {
    const fixtureRoot = join(contractRoot, "fixtures/provider-stubs");
    const expected = readJson(
      join(fixtureRoot, "provider-neutral-projection.json"),
    ) as JsonObject;
    const anthropic = normalizeProviderStub(
      readJson(join(fixtureRoot, "anthropic-compatible-stream.json")),
    );
    const openAi = normalizeProviderStub(
      readJson(join(fixtureRoot, "openai-compatible-stream.json")),
    );
    expect(anthropic).toEqual(expected.events);
    expect(openAi).toEqual(expected.events);
  });

  it("evaluates the shared durable-sequence, idempotency, timeout, and fencing scenarios", () => {
    const conformanceRoot = join(contractRoot, "fixtures/conformance");
    const sequenceFixture = readJson(
      join(conformanceRoot, "model-invocation-sequences.json"),
    ) as JsonObject;
    for (const scenarioValue of sequenceFixture.scenarios as unknown[]) {
      const scenario = asObject(scenarioValue);
      expect(scenario).toBeDefined();
      const events = scenario?.events as unknown[];
      let currentStatus: unknown;
      let expectedSequence = 1;
      const eventIds = new Map<unknown, unknown>();
      let valid = true;
      for (const eventValue of events) {
        const event = asObject(eventValue);
        if (event === undefined || event.durableSequence !== expectedSequence) {
          valid = false;
          break;
        }
        expectedSequence += 1;
        const existingDigest = eventIds.get(event.eventId);
        if (existingDigest !== undefined) {
          valid = false;
          break;
        }
        eventIds.set(event.eventId, event.eventDigest);
        const expectedStatus = new Map<unknown, unknown>([
          ["accepted", "accepted"],
          ["dispatch_decided", "running"],
          ["completed", "completed"],
          ["failed", "failed"],
          ["cancelled", "cancelled"],
          ["timed_out", "timed_out"],
          ["uncertain", "uncertain"],
        ]).get(event.eventType);
        if (event.status !== expectedStatus) {
          valid = false;
          break;
        }
        const allowed =
          currentStatus === undefined
            ? event.status === "accepted"
            : currentStatus === "accepted"
              ? ["running", "failed", "cancelled", "timed_out"].includes(
                  String(event.status),
                )
              : currentStatus === "running"
                ? ["completed", "failed", "cancelled", "timed_out", "uncertain"].includes(
                    String(event.status),
                  )
                : false;
        if (!allowed) {
          valid = false;
          break;
        }
        currentStatus = event.status;
      }
      expect(valid, String(scenario?.name)).toBe(scenario?.expectedValid);
    }

    const decisionFixture = readJson(
      join(conformanceRoot, "model-invocation-decisions.json"),
    ) as JsonObject;
    for (const caseValue of decisionFixture.idempotency as unknown[]) {
      const item = asObject(caseValue);
      const decision =
        item?.existingClientRequestId !== item?.candidateClientRequestId
          ? "accept"
          : item?.existingDigest === item?.candidateDigest
            ? "replay"
            : "conflict";
      expect(decision, String(item?.name)).toBe(item?.expectedDecision);
    }
    for (const caseValue of decisionFixture.outcomes as unknown[]) {
      const item = asObject(caseValue);
      const status =
        item?.dispatchPersisted === false
          ? "timed_out"
          : item?.trustedProviderTimeout === true
            ? "timed_out"
            : item?.providerOutcomeKnown === false &&
                item?.recoveryEvidenceExhausted === true
              ? "uncertain"
              : "running";
      expect(status, String(item?.name)).toBe(item?.expectedStatus);
    }
    for (const caseValue of decisionFixture.recovery as unknown[]) {
      const item = asObject(caseValue);
      let decision = "rejected";
      let resultEpoch = item?.currentEpoch;
      if (
        item?.claimType === "acquire" &&
        item.currentEpoch === 0 &&
        item.expectedEpoch === 0
      ) {
        decision = "acquired";
        resultEpoch = 1;
      } else if (
        item?.claimType === "renew" &&
        item.currentEpoch === item.expectedEpoch &&
        item.ownerMatches === true
      ) {
        decision = "renewed";
      } else if (
        item?.claimType === "takeover" &&
        item.currentEpoch === item.expectedEpoch &&
        item.leaseExpired === true
      ) {
        decision = "taken_over";
        resultEpoch = Number(item.currentEpoch) + 1;
      } else if (
        item?.claimType === "commit" &&
        (item.currentEpoch !== item.expectedEpoch || item.ownerMatches !== true)
      ) {
        decision = "fencing_conflict";
      }
      expect(decision, String(item?.name)).toBe(item?.expectedDecision);
      expect(resultEpoch, String(item?.name)).toBe(item?.resultEpoch);
    }
  });

  it("does not permit a second editable enterprise schema tree", () => {
    const schemaFileNames = readdirSync(schemasRoot);
    expect(
      schemaFileNames.every((file) => basename(file).endsWith(".schema.json")),
    ).toBe(true);
    expect(
      readdirSync(resolve(process.cwd(), "packages/contracts/src")).includes(
        "enterprise-gateway",
      ),
    ).toBe(false);
  });
});

describe("Enterprise Model Gateway additive Contract v1alpha2", () => {
  const v1alpha2Root = resolve(
    process.cwd(),
    "contracts/enterprise-gateway/v1alpha2",
  );
  const v1alpha2Schemas = join(v1alpha2Root, "schemas");
  const manifest = readJson(
    join(v1alpha2Root, "fixtures/manifest.json"),
  ) as FixtureManifest;

  it("accepts and rejects the shared v1alpha2 fixture corpus", () => {
    expect(manifest.contractVersion).toBe("v1alpha2");
    for (const fixtureCase of manifest.cases) {
      const schemaPath = join(
        v1alpha2Schemas,
        `${fixtureCase.schema}.schema.json`,
      );
      const fixture = readJson(join(v1alpha2Root, "fixtures", fixtureCase.file));
      const errors = validateSchema(readJson(schemaPath), fixture, schemaPath);
      expect(
        errors.length === 0,
        `${fixtureCase.file}: ${errors.join("; ")}`,
      ).toBe(fixtureCase.valid);
    }
  });

  it("keeps the cache sidecar opaque, strict and independently self-digesting", () => {
    const accept = readJson(join(
      v1alpha2Root,
      "fixtures/valid/model-invocation-accept-assistant.json",
    )) as JsonObject;
    const context = accept.cacheContext as JsonObject;
    expect(Object.keys(context)).toEqual(["sessionScopeDigest"]);
    expect(String(context.sessionScopeDigest)).toMatch(/^[a-f0-9]{64}$/u);
    expect(accept.cacheContextDigest).toBe(
      createHash("sha256").update(canonicalJson(context)).digest("hex"),
    );
    for (const forbidden of [
      "sessionId",
      "taskId",
      "runId",
      "enterpriseId",
      "userId",
      "credentialRef",
      "endpoint",
      "apiKey",
    ]) {
      expect(containsKey(context, forbidden), forbidden).toBe(false);
    }
  });

  it("freezes all four Model routes to v1alpha2 and advertises the exact feature", () => {
    const openApi = readFileSync(join(v1alpha2Root, "openapi.yaml"), "utf8");
    for (const route of [
      "/v1alpha2/model-invocations:",
      "/v1alpha2/model-invocations/{invocationId}:",
      "/v1alpha2/model-invocations/{invocationId}/cancel:",
      "/v1alpha2/model-invocations/{invocationId}/events:",
    ]) expect(openApi).toContain(route);
    const compatibility = readJson(join(
      v1alpha2Root,
      "fixtures/valid/compatibility.json",
    )) as JsonObject;
    expect(compatibility.features).toContain(
      "enterprise_model_prompt_cache_v1alpha2",
    );
  });

  it("matches the published v1alpha2 canonical file digests", () => {
    const digestFile = readFileSync(join(
      v1alpha2Root,
      "CANONICAL-DIGESTS.sha256",
    ), "utf8").trim().split("\n");
    for (const line of digestFile) {
      const [expected, relativePath] = line.split(/\s{2}/u);
      expect(createHash("sha256")
        .update(readFileSync(join(v1alpha2Root, relativePath!)))
        .digest("hex"), relativePath).toBe(expected);
    }
  });

  it("keeps the semantic request digest independent from cache context drift", () => {
    const accept = readJson(join(
      v1alpha2Root,
      "fixtures/valid/model-invocation-accept-assistant.json",
    )) as JsonObject;
    const drift = structuredClone(accept);
    (drift.cacheContext as JsonObject).sessionScopeDigest = "b".repeat(64);
    expect(drift.requestDigest).toBe(accept.requestDigest);
    expect(createHash("sha256")
      .update(canonicalJson(drift.cacheContext))
      .digest("hex"))
      .not.toBe(accept.cacheContextDigest);
  });

  it("shares a semantic fixture whose cache context digest is intentionally invalid", () => {
    const mismatch = readJson(join(
      v1alpha2Root,
      "fixtures/invalid/model-invocation-accept-cache-context-digest-mismatch.json",
    )) as JsonObject;
    expect(createHash("sha256")
      .update(canonicalJson(mismatch.cacheContext))
      .digest("hex"))
      .not.toBe(mismatch.cacheContextDigest);
  });

  it("guards the v1alpha1 Contract bytes and rejects a sidecar on the old schema", () => {
    const expected = new Map([
      ["schemas/model-invocation.schema.json", "435bc8ce0815f0ed10de6b3a567b1ecade82418f24c4aec062c8ed480cf19da7"],
      ["schemas/compatibility.schema.json", "476608f494ae9271185b03269148ca208ce45687a13e6559a6e287798750fa69"],
      ["openapi.yaml", "0b872be7678bb4451203f16213ff372fdf2da9fff224769eb37cc82b3cdac3c4"],
      ["fixtures/manifest.json", "56549c2e277ef7d270dd2922a00329139539e8fe54f7c535021c755002469648"],
    ]);
    for (const [path, digest] of expected) {
      expect(createHash("sha256")
        .update(readFileSync(join(contractRoot, path)))
        .digest("hex"), path).toBe(digest);
    }
    const legacySchemaPath = join(schemasRoot, "model-invocation.schema.json");
    const legacy = readJson(join(
      contractRoot,
      "fixtures/valid/model-invocation-accept-user-confirmed.json",
    )) as JsonObject;
    legacy.cacheContext = { sessionScopeDigest: "a".repeat(64) };
    legacy.cacheContextDigest = "6d93dc7d3c929d1506fc29c38137666a5dd9393cb34eeda555e815ad5fc52ee3";
    expect(validateSchema(readJson(legacySchemaPath), legacy, legacySchemaPath))
      .not.toEqual([]);
  });
});
