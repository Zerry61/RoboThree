import {
  CreateRobotDraftCommandSchema,
  GetMyRobotDraftQuerySchema,
  ListMyRobotDraftsQuerySchema,
  StartRobotDraftTestCommandSchema,
  SubmitRobotDraftCommandSchema,
  UpdateRobotDraftCommandSchema,
  WithdrawRobotSubmissionCommandSchema,
} from "@robothree/contracts/agent-lifecycle/v1alpha1";
import type { IpcMainInvokeEvent } from "electron";

import {
  AGENT_LIFECYCLE_V1ALPHA1_IPC_CHANNELS,
  type AgentLifecycleV1Alpha1InvokeChannel,
  type RendererAgentLifecycleSafeResult,
} from "../shared/foundation-api.js";
import type { CorePrivateConnectionLease } from "./core-private-supervisor.js";

export class AgentLifecycleV1Alpha1IpcRouter {
  constructor(private readonly input: Readonly<{
    resolveConnection: () => CorePrivateConnectionLease;
    isCurrentConnection: (lease: CorePrivateConnectionLease) => boolean;
    isAuthorizedWebContents: (webContentsId: number) => boolean;
  }>) {}

  async dispatch(channel: AgentLifecycleV1Alpha1InvokeChannel, raw: unknown,
    event: IpcMainInvokeEvent): Promise<RendererAgentLifecycleSafeResult<unknown>> {
    try {
      if (event.senderFrame !== event.sender.mainFrame
        || !this.input.isAuthorizedWebContents(event.sender.id)) return fail("agentlifecycle.unauthorized");
      const lease = this.input.resolveConnection();
      if (!this.input.isCurrentConnection(lease)) return fail("agentlifecycle.service_unavailable");
      switch (channel) {
        case AGENT_LIFECYCLE_V1ALPHA1_IPC_CHANNELS.listMyRobotDrafts:
          return lease.client.listMyRobotDraftsV1Alpha1(ListMyRobotDraftsQuerySchema.parse(raw));
        case AGENT_LIFECYCLE_V1ALPHA1_IPC_CHANNELS.getMyRobotDraft:
          return lease.client.getMyRobotDraftV1Alpha1(GetMyRobotDraftQuerySchema.parse(raw));
        case AGENT_LIFECYCLE_V1ALPHA1_IPC_CHANNELS.createRobotDraft:
          return lease.client.createRobotDraftV1Alpha1(CreateRobotDraftCommandSchema.parse(raw));
        case AGENT_LIFECYCLE_V1ALPHA1_IPC_CHANNELS.updateRobotDraft:
          return lease.client.updateRobotDraftV1Alpha1(UpdateRobotDraftCommandSchema.parse(raw));
        case AGENT_LIFECYCLE_V1ALPHA1_IPC_CHANNELS.startRobotDraftTest:
          return lease.client.startRobotDraftTestV1Alpha1(StartRobotDraftTestCommandSchema.parse(raw));
        case AGENT_LIFECYCLE_V1ALPHA1_IPC_CHANNELS.submitRobotDraft:
          return lease.client.submitRobotDraftV1Alpha1(SubmitRobotDraftCommandSchema.parse(raw));
        case AGENT_LIFECYCLE_V1ALPHA1_IPC_CHANNELS.withdrawRobotSubmission:
          return lease.client.withdrawRobotSubmissionV1Alpha1(
            WithdrawRobotSubmissionCommandSchema.parse(raw),
          );
      }
    } catch {
      return fail("agentlifecycle.invalid_request");
    }
  }
}

function fail(errorCode: "agentlifecycle.invalid_request" | "agentlifecycle.unauthorized"
  | "agentlifecycle.service_unavailable") {
  return {
    ok: false as const,
    error: {
      contractVersion: "agent-lifecycle.v1alpha1" as const,
      errorCode,
      safeSummary: errorCode === "agentlifecycle.invalid_request"
        ? "机器人请求无效"
        : "机器人服务暂时不可用",
      correlationId: "00000000-0000-4000-8000-000000000000",
    },
  };
}
