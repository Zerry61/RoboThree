import { randomUUID } from "node:crypto";
import { request as requestHttp } from "node:http";
import { request as requestHttps } from "node:https";

import {
  SkillDetailSchema,
  SkillLifecycleMutationReceiptSchema,
  SkillLifecycleSafeErrorSchema,
  SkillPageSchema,
  SubmitSkillDraftCommandSchema,
  SubmitSkillDraftReceiptSchema,
  WithdrawSkillSubmissionCommandSchema,
  PublishedSkillReleaseSchema,
  type SkillDetail,
  type SkillLifecycleMutationReceipt,
  type SkillPage,
  type SubmitSkillDraftCommand,
  type SubmitSkillDraftReceipt,
  type WithdrawSkillSubmissionCommand,
  type PublishedSkillRelease,
  SkillDraftMaterialSchema,
} from "@robothree/contracts/skill-lifecycle/v1alpha1";
import { z } from "zod";

import type { InternalTrialSkillLifecycleAccessToken } from
  "../environment/internal-trial-skill-lifecycle-access-token.js";

const PublishedPageSchema = z.object({
  contractVersion: z.literal("skill-lifecycle.v1alpha1"),
  items: z.array(PublishedSkillReleaseSchema).max(500),
}).strict();

const BeginTestSchema = z.object({
  contractVersion: z.literal("skill-lifecycle.v1alpha1"),
  kind: z.literal("begin_skill_draft_test"),
  commandId: z.uuid(), correlationId: z.uuid(),
  skillId: z.string(), expectedDraftRevision: z.string(), taskId: z.string(),
}).strict();

const CompleteTestSchema = z.object({
  contractVersion: z.literal("skill-lifecycle.v1alpha1"),
  kind: z.literal("complete_skill_draft_test"),
  commandId: z.uuid(), correlationId: z.uuid(),
  skillId: z.string(), expectedDraftRevision: z.string(), taskId: z.string(),
  result: z.enum(["passed", "failed"]), safeReason: z.string().optional(),
  resultDigest: z.string(),
}).strict();

// Test completion is a Core-to-Central private transition. Its receipt states
// intentionally do not widen the frozen Renderer-facing mutation state union.
const CompleteTestReceiptSchema = SkillLifecycleMutationReceiptSchema.omit({ state: true })
  .extend({ state: z.enum(["test_passed", "test_failed"]) })
  .strict();

const AdminTestRequestSchema = z.object({
  operationId: z.uuid(),
  correlationId: z.uuid(),
  skillId: z.string().min(1).max(200),
  draftRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
  packageDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
  manifestDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
  skillMarkdownDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
  testInput: z.string().min(1).max(65_536),
}).strict();

const AdminTestRequestPageSchema = z.object({
  items: z.array(AdminTestRequestSchema).max(8),
}).strict();

const AdminTestOperationSchema = z.object({
  contractVersion: z.literal("skill-lifecycle.v1alpha1"),
  operationId: z.uuid(), correlationId: z.uuid(),
  operationKind: z.literal("admin_draft_test"),
  state: z.enum(["accepted", "running", "succeeded", "failed"]),
  skillId: z.string(), targetRevision: z.string(), taskId: z.string().optional(),
  safeReason: z.string().optional(), updatedAt: z.iso.datetime(),
}).strict();

const AdminTestRecoveryPageSchema = z.object({
  items: z.array(AdminTestOperationSchema.extend({
    state: z.literal("running"),
    taskId: z.string().min(1),
  })).max(64),
}).strict();

export type AdminSkillDraftTestRequest = z.infer<typeof AdminTestRequestSchema>;

type SkillDraftMaterial = z.infer<typeof SkillDraftMaterialSchema>;

type Command = SubmitSkillDraftCommand | WithdrawSkillSubmissionCommand
  | z.infer<typeof BeginTestSchema> | z.infer<typeof CompleteTestSchema>;

export class HttpSkillLifecycleClient {
  readonly #origin: URL;
  readonly #token: InternalTrialSkillLifecycleAccessToken;
  readonly #allowInsecureLoopback: boolean;

  constructor(input: Readonly<{
    baseUrl: string;
    token: InternalTrialSkillLifecycleAccessToken;
    allowInsecureLoopback?: boolean;
  }>) {
    this.#origin = new URL(input.baseUrl);
    this.#allowInsecureLoopback = input.allowInsecureLoopback ?? false;
    if (this.#origin.username !== "" || this.#origin.password !== ""
      || this.#origin.search !== "" || this.#origin.hash !== ""
      || (this.#origin.protocol !== "https:" && !(this.#allowInsecureLoopback
        && this.#origin.protocol === "http:"
        && ["127.0.0.1", "localhost"].includes(this.#origin.hostname)))) {
      throw new Error("skill_lifecycle_origin_invalid");
    }
    this.#token = input.token;
  }

  listDrafts(): Promise<SkillPage> {
    return this.#json("/internal-trial/v1/skill-lifecycle/drafts", "GET", undefined,
      SkillPageSchema);
  }

  getDraft(skillId: string): Promise<SkillDetail> {
    return this.#json(`/internal-trial/v1/skill-lifecycle/drafts/${encodeURIComponent(skillId)}`,
      "GET", undefined, SkillDetailSchema);
  }

  async syncDraft(input: Readonly<{
    commandId: string;
    correlationId: string;
    material: SkillDraftMaterial;
    expectedDraftRevision?: string;
    archiveBytes: Uint8Array;
    archiveDigest: string;
  }>): Promise<SkillLifecycleMutationReceipt> {
    if (input.archiveBytes.byteLength < 1 || input.archiveBytes.byteLength > 200 * 1024 * 1024) {
      throw new Error("skilllifecycle.package_too_large");
    }
    const metadata = {
      contractVersion: "skill-lifecycle.v1alpha1" as const,
      kind: "sync_skill_draft" as const,
      commandId: z.uuid().parse(input.commandId),
      correlationId: z.uuid().parse(input.correlationId),
      material: SkillDraftMaterialSchema.parse(input.material),
      ...(input.expectedDraftRevision === undefined
        ? {} : { expectedDraftRevision: input.expectedDraftRevision }),
      archiveFormat: "tar_gz" as const,
      archiveTransferEncoding: "base64" as const,
      archiveByteLength: input.archiveBytes.byteLength,
      archiveDigest: input.archiveDigest,
    };
    const multipart = encodeSkillArchiveMultipart(
      JSON.stringify(metadata),
      Buffer.from(input.archiveBytes.buffer, input.archiveBytes.byteOffset,
        input.archiveBytes.byteLength).toString("base64"),
    );
    const response = await postSkillArchiveMultipart(
      new URL("/internal-trial/v1/skill-lifecycle/drafts/sync", this.#origin),
      this.#token.bearer(), multipart,
    );
    if (response.status >= 300 && response.status < 400) {
      throw new Error("skill_lifecycle_redirect_rejected");
    }
    let document: unknown;
    try {
      document = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(response.body));
    } catch {
      throw new Error("skilllifecycle.service_unavailable");
    }
    if (response.status < 200 || response.status >= 300) {
      const safe = SkillLifecycleSafeErrorSchema.safeParse(document);
      throw new Error(safe.success ? safe.data.errorCode : "skilllifecycle.service_unavailable");
    }
    return SkillLifecycleMutationReceiptSchema.parse(document);
  }

  submit(command: SubmitSkillDraftCommand): Promise<SubmitSkillDraftReceipt> {
    return this.#execute(command, SubmitSkillDraftReceiptSchema);
  }

  withdraw(command: WithdrawSkillSubmissionCommand): Promise<SkillLifecycleMutationReceipt> {
    return this.#execute(command, SkillLifecycleMutationReceiptSchema);
  }

  beginTest(command: z.infer<typeof BeginTestSchema>): Promise<SkillLifecycleMutationReceipt> {
    return this.#execute(command, SkillLifecycleMutationReceiptSchema);
  }

  completeTest(command: z.infer<typeof CompleteTestSchema>) {
    return this.#execute(command, CompleteTestReceiptSchema);
  }

  #execute<T>(command: Command, schema: z.ZodType<T>): Promise<T> {
    const parsed = parseCommand(command);
    return this.#json("/internal-trial/v1/skill-lifecycle/commands", "POST", parsed, schema);
  }

  async listPublished(): Promise<readonly PublishedSkillRelease[]> {
    const page = await this.#json("/internal-trial/v1/skill-lifecycle/published-releases",
      "GET", undefined, PublishedPageSchema);
    return page.items;
  }

  async listAdminTestRequests(): Promise<readonly AdminSkillDraftTestRequest[]> {
    const page = await this.#json("/internal-trial/v1/skill-lifecycle/admin-test-requests",
      "GET", undefined, AdminTestRequestPageSchema);
    return page.items;
  }

  async listRunningAdminTestRequests() {
    const page = await this.#json("/internal-trial/v1/skill-lifecycle/admin-test-recovery",
      "GET", undefined, AdminTestRecoveryPageSchema);
    return page.items;
  }

  claimAdminTestRequest(input: Readonly<{ operationId: string; taskId: string }>) {
    return this.#json(`/internal-trial/v1/skill-lifecycle/admin-test-requests/${
      encodeURIComponent(z.uuid().parse(input.operationId))}/claim`, "POST",
    { taskId: input.taskId }, AdminTestOperationSchema);
  }

  queryAdminTestRequest(operationId: string) {
    return this.#json(`/internal-trial/v1/skill-lifecycle/admin-test-requests/${
      encodeURIComponent(z.uuid().parse(operationId))}`, "GET", undefined,
    AdminTestOperationSchema);
  }

  completeAdminTestRequest(input: Readonly<{
    operationId: string; taskId: string; result: "passed" | "failed";
    safeReason?: string; resultDigest: string;
  }>) {
    return this.#json(`/internal-trial/v1/skill-lifecycle/admin-test-requests/${
      encodeURIComponent(z.uuid().parse(input.operationId))}/complete`, "POST", {
      taskId: input.taskId,
      result: input.result,
      ...(input.safeReason === undefined ? {} : { safeReason: input.safeReason }),
      resultDigest: input.resultDigest,
    }, AdminTestOperationSchema);
  }

  async downloadAdminTestPackage(input: Readonly<{
    operationId: string;
  }>): Promise<Readonly<{ bytes: Uint8Array; packageDigest: string; manifestDigest: string }>> {
    const path = `/internal-trial/v1/skill-lifecycle/admin-test-requests/${
      encodeURIComponent(z.uuid().parse(input.operationId))}/package`;
    return this.#downloadPackage(path);
  }

  async download(input: Readonly<{
    skillId: string;
    releaseRevision: string;
    packageDigest: string;
  }>): Promise<Readonly<{ bytes: Uint8Array; packageDigest: string; manifestDigest: string }>> {
    const path = "/internal-trial/v1/skill-lifecycle/published-releases/"
      + `${encodeURIComponent(input.skillId)}/${encodeURIComponent(input.releaseRevision)}/`
      + encodeURIComponent(input.packageDigest);
    return this.#downloadPackage(path);
  }

  async #downloadPackage(path: string): Promise<Readonly<{
    bytes: Uint8Array; packageDigest: string; manifestDigest: string;
  }>> {
    const response = await this.#fetch(path, "GET", undefined);
    if (!response.ok || response.headers.get("content-type")?.includes("application/zip") !== true) {
      await this.#throwSafe(response);
    }
    const length = Number(response.headers.get("content-length") ?? "0");
    if (!Number.isSafeInteger(length) || length < 1 || length > 200 * 1024 * 1024) {
      throw new Error("skilllifecycle.package_invalid");
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength !== length) throw new Error("skilllifecycle.package_invalid");
    return Object.freeze({
      bytes,
      packageDigest: response.headers.get("x-robothree-package-digest") ?? "",
      manifestDigest: response.headers.get("x-robothree-manifest-digest") ?? "",
    });
  }

  async #json<T>(path: string, method: "GET" | "POST", body: unknown,
    schema: z.ZodType<T>): Promise<T> {
    const response = await this.#fetch(path, method, body);
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > 2 * 1024 * 1024) {
      throw new Error("skill_lifecycle_response_too_large");
    }
    const document: unknown = JSON.parse(text);
    if (!response.ok) {
      const safe = SkillLifecycleSafeErrorSchema.safeParse(document);
      throw new Error(safe.success ? safe.data.errorCode : "skilllifecycle.service_unavailable");
    }
    return schema.parse(document);
  }

  async #fetch(path: string, method: "GET" | "POST", body: unknown): Promise<Response> {
    const url = new URL(path, this.#origin);
    if (url.origin !== this.#origin.origin) throw new Error("skill_lifecycle_redirect_rejected");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(url, {
        method,
        headers: {
          accept: body === undefined ? "application/json, application/zip" : "application/json",
          ...(body === undefined ? {} : { "content-type": "application/json" }),
          authorization: `Bearer ${this.#token.bearer()}`,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: "manual",
        signal: controller.signal,
      });
      if (response.status >= 300 && response.status < 400) {
        throw new Error("skill_lifecycle_redirect_rejected");
      }
      return response;
    } finally {
      clearTimeout(timeout);
    }
  }

  async #throwSafe(response: Response): Promise<never> {
    try {
      const safe = SkillLifecycleSafeErrorSchema.parse(await response.json());
      throw new Error(safe.errorCode);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("skilllifecycle.")) throw error;
      throw new Error("skilllifecycle.service_unavailable");
    }
  }
}

function encodeSkillArchiveMultipart(metadataJson: string, encodedArchive: string): Readonly<{
  boundary: string;
  body: ArrayBuffer;
}> {
  const boundary = `robothree-skill-${randomUUID()}`;
  const metadataHeader = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\n`
    + `Content-Type: application/json; charset=utf-8\r\n\r\n${metadataJson}\r\n`,
    "utf8",
  );
  const archiveHeader = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="archive"; filename="skill.tgz"\r\n`
    + "Content-Type: application/gzip\r\n\r\n",
    "utf8",
  );
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`, "ascii");
  const encoded = Buffer.concat([
    metadataHeader,
    archiveHeader,
    Buffer.from(encodedArchive, "ascii"),
    footer,
  ]);
  const body = new ArrayBuffer(encoded.byteLength);
  new Uint8Array(body).set(encoded);
  return Object.freeze({
    boundary,
    body,
  });
}

function postSkillArchiveMultipart(url: URL, bearerToken: string, multipart: Readonly<{
  boundary: string;
  body: ArrayBuffer;
}>): Promise<Readonly<{ status: number; body: Uint8Array }>> {
  return new Promise((resolve, reject) => {
    const request = (url.protocol === "https:" ? requestHttps : requestHttp)(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${bearerToken}`,
        "content-type": `multipart/form-data; boundary=${multipart.boundary}`,
        "content-length": String(multipart.body.byteLength),
        accept: "application/json",
      },
    }, (response) => {
      const chunks: Buffer[] = [];
      let received = 0;
      response.on("data", (chunk: Buffer) => {
        received += chunk.byteLength;
        if (received > 1_048_576) {
          request.destroy(new Error("skilllifecycle.service_unavailable"));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => resolve(Object.freeze({
        status: response.statusCode ?? 500,
        body: Buffer.concat(chunks),
      })));
    });
    request.setTimeout(30_000, () => {
      request.destroy(new Error("skilllifecycle.service_unavailable"));
    });
    request.once("error", () => reject(new Error("skilllifecycle.service_unavailable")));
    request.end(Buffer.from(multipart.body));
  });
}

function parseCommand(command: Command): Command {
  switch (command.kind) {
    case "submit_skill_draft": return SubmitSkillDraftCommandSchema.parse(command);
    case "withdraw_skill_submission": return WithdrawSkillSubmissionCommandSchema.parse(command);
    case "begin_skill_draft_test": return BeginTestSchema.parse(command);
    case "complete_skill_draft_test": return CompleteTestSchema.parse(command);
  }
}
