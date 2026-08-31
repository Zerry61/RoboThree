import {
  AgentLifecycleSafeErrorSchema,
  BeginRobotDraftTestCommandSchema,
  CompleteRobotDraftTestCommandSchema,
  CreateRobotDraftCommandSchema,
  GetMyRobotDraftQuerySchema,
  ListMyRobotDraftsQuerySchema,
  PublishedRobotReleasePageSchema,
  RobotDraftDetailSchema,
  RobotDraftPageSchema,
  RobotLifecycleMutationReceiptSchema,
  SubmitRobotDraftCommandSchema,
  UpdateRobotDraftCommandSchema,
  WithdrawRobotSubmissionCommandSchema,
  type BeginRobotDraftTestCommand,
  type CompleteRobotDraftTestCommand,
  type CreateRobotDraftCommand,
  type GetMyRobotDraftQuery,
  type ListMyRobotDraftsQuery,
  type PublishedRobotReleasePage,
  type RobotDraftDetail,
  type RobotDraftPage,
  type RobotLifecycleMutationReceipt,
  type SubmitRobotDraftCommand,
  type UpdateRobotDraftCommand,
  type WithdrawRobotSubmissionCommand,
} from "@robothree/contracts/agent-lifecycle/v1alpha1";
import type { z } from "zod";

import type { InternalTrialAgentLifecycleAccessToken } from
  "../environment/internal-trial-agent-lifecycle-access-token.js";

type CreatorCommand = CreateRobotDraftCommand | UpdateRobotDraftCommand
  | BeginRobotDraftTestCommand | CompleteRobotDraftTestCommand
  | SubmitRobotDraftCommand | WithdrawRobotSubmissionCommand;

export class HttpAgentLifecycleClient {
  readonly #origin: URL;
  readonly #token: InternalTrialAgentLifecycleAccessToken;
  readonly #allowInsecureLoopback: boolean;

  constructor(input: Readonly<{
    baseUrl: string;
    token: InternalTrialAgentLifecycleAccessToken;
    allowInsecureLoopback?: boolean;
  }>) {
    this.#origin = new URL(input.baseUrl);
    this.#allowInsecureLoopback = input.allowInsecureLoopback ?? false;
    if (this.#origin.username !== "" || this.#origin.password !== ""
      || this.#origin.search !== "" || this.#origin.hash !== ""
      || (this.#origin.protocol !== "https:" && !(this.#allowInsecureLoopback
        && this.#origin.protocol === "http:"
        && ["127.0.0.1", "localhost"].includes(this.#origin.hostname)))) {
      throw new Error("agent_lifecycle_origin_invalid");
    }
    this.#token = input.token;
  }

  listDrafts(input: ListMyRobotDraftsQuery): Promise<RobotDraftPage> {
    ListMyRobotDraftsQuerySchema.parse(input);
    return this.#request("/internal-trial/v1/agent-lifecycle/drafts", "GET", undefined,
      RobotDraftPageSchema);
  }

  getDraft(input: GetMyRobotDraftQuery): Promise<RobotDraftDetail> {
    const query = GetMyRobotDraftQuerySchema.parse(input);
    return this.#request(`/internal-trial/v1/agent-lifecycle/drafts/${encodeURIComponent(query.robotId)}`,
      "GET", undefined, RobotDraftDetailSchema);
  }

  execute(command: CreatorCommand): Promise<RobotLifecycleMutationReceipt> {
    const parsed = parseCreatorCommand(command);
    return this.#request("/internal-trial/v1/agent-lifecycle/commands", "POST", parsed,
      RobotLifecycleMutationReceiptSchema);
  }

  listPublished(): Promise<PublishedRobotReleasePage> {
    return this.#request("/internal-trial/v1/agent-lifecycle/published-releases", "GET", undefined,
      PublishedRobotReleasePageSchema);
  }

  async #request<T>(path: string, method: "GET" | "POST", body: unknown,
    schema: z.ZodType<T>): Promise<T> {
    const url = new URL(path, this.#origin);
    if (url.origin !== this.#origin.origin) throw new Error("agent_lifecycle_redirect_rejected");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(url, {
        method,
        headers: {
          accept: "application/json",
          ...(body === undefined ? {} : { "content-type": "application/json" }),
          authorization: `Bearer ${this.#token.bearer()}`,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: "manual",
        signal: controller.signal,
      });
      if (response.status >= 300 && response.status < 400) {
        throw new Error("agent_lifecycle_redirect_rejected");
      }
      const text = await response.text();
      if (Buffer.byteLength(text, "utf8") > 2 * 1024 * 1024) {
        throw new Error("agent_lifecycle_response_too_large");
      }
      const document: unknown = JSON.parse(text);
      if (!response.ok) {
        const safe = AgentLifecycleSafeErrorSchema.safeParse(document);
        throw new Error(safe.success ? safe.data.errorCode : "agent_lifecycle_service_unavailable");
      }
      return schema.parse(document);
    } finally {
      clearTimeout(timeout);
    }
  }
}

function parseCreatorCommand(command: CreatorCommand): CreatorCommand {
  switch (command.kind) {
    case "create_robot_draft": return CreateRobotDraftCommandSchema.parse(command);
    case "update_robot_draft": return UpdateRobotDraftCommandSchema.parse(command);
    case "begin_robot_draft_test": return BeginRobotDraftTestCommandSchema.parse(command);
    case "complete_robot_draft_test": return CompleteRobotDraftTestCommandSchema.parse(command);
    case "submit_robot_draft": return SubmitRobotDraftCommandSchema.parse(command);
    case "withdraw_robot_submission": return WithdrawRobotSubmissionCommandSchema.parse(command);
  }
}
