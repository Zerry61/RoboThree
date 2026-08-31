import type {
  AgentLifecycleErrorCode,
  CreateRobotDraftCommand,
  RobotDraftDetail,
  RobotDraftMaterial,
  RobotDraftPage,
  RobotLifecycleMutationReceipt,
  UpdateRobotDraftCommand,
} from "@robothree/contracts/agent-lifecycle/v1alpha1";
import type { InjectionKey } from "vue";

import type {
  RendererAgentLifecycleSafeResult,
  RoboThreeAgentLifecycleApiV1Alpha1,
} from "../../shared/foundation-api.js";

declare global {
  interface Window {
    readonly robothreeAgentLifecycleV1Alpha1: RoboThreeAgentLifecycleApiV1Alpha1;
  }
}

export type AgentLifecycleAdapter = Readonly<{
  listDrafts(): Promise<RobotDraftPage>;
  getDraft(robotId: string): Promise<RobotDraftDetail>;
  createDraft(input: Readonly<{
    material: RobotDraftMaterial;
    avatarUpload?: CreateRobotDraftCommand["avatarUpload"];
  }>): Promise<RobotLifecycleMutationReceipt>;
  updateDraft(input: Readonly<{
    robotId: string;
    expectedDraftRevision: string;
    material: RobotDraftMaterial;
    avatarUpload?: UpdateRobotDraftCommand["avatarUpload"];
  }>): Promise<RobotLifecycleMutationReceipt>;
  startTest(input: Readonly<{
    robotId: string;
    expectedDraftRevision: string;
    testInput: string;
  }>): Promise<RobotLifecycleMutationReceipt>;
  submitDraft(input: Readonly<{
    robotId: string;
    expectedDraftRevision: string;
    semanticVersion: string;
    changeSummary: string;
  }>): Promise<RobotLifecycleMutationReceipt>;
  withdrawSubmission(input: Readonly<{
    robotId: string;
    submissionId: string;
    expectedSubmissionRevision: string;
  }>): Promise<RobotLifecycleMutationReceipt>;
}>;

export const agentLifecycleAdapterKey: InjectionKey<AgentLifecycleAdapter> =
  Symbol("RoboThreeAgentLifecycleAdapter");

export const desktopAgentLifecycleAdapter: AgentLifecycleAdapter = {
  listDrafts: () => accept(api().listMyRobotDrafts({
    contractVersion: "agent-lifecycle.v1alpha1",
    kind: "list_my_robot_drafts",
    ...queryIdentity(),
  })),

  getDraft: (robotId) => accept(api().getMyRobotDraft({
    contractVersion: "agent-lifecycle.v1alpha1",
    kind: "get_my_robot_draft",
    ...queryIdentity(),
    robotId,
  })),

  createDraft: (input) => accept(api().createRobotDraft({
    contractVersion: "agent-lifecycle.v1alpha1",
    kind: "create_robot_draft",
    ...commandIdentity(),
    material: input.material,
    ...(input.avatarUpload === undefined ? {} : { avatarUpload: input.avatarUpload }),
  })),

  updateDraft: (input) => accept(api().updateRobotDraft({
    contractVersion: "agent-lifecycle.v1alpha1",
    kind: "update_robot_draft",
    ...commandIdentity(),
    robotId: input.robotId,
    expectedDraftRevision: input.expectedDraftRevision,
    material: input.material,
    ...(input.avatarUpload === undefined ? {} : { avatarUpload: input.avatarUpload }),
  })),

  startTest: (input) => accept(api().startRobotDraftTest({
    contractVersion: "agent-lifecycle.v1alpha1",
    kind: "start_robot_draft_test",
    ...commandIdentity(),
    robotId: input.robotId,
    expectedDraftRevision: input.expectedDraftRevision,
    testInput: input.testInput,
  })),

  submitDraft: (input) => accept(api().submitRobotDraft({
    contractVersion: "agent-lifecycle.v1alpha1",
    kind: "submit_robot_draft",
    ...commandIdentity(),
    robotId: input.robotId,
    expectedDraftRevision: input.expectedDraftRevision,
    semanticVersion: input.semanticVersion,
    changeSummary: input.changeSummary,
    publicationScope: "enterprise",
  })),

  withdrawSubmission: (input) => accept(api().withdrawRobotSubmission({
    contractVersion: "agent-lifecycle.v1alpha1",
    kind: "withdraw_robot_submission",
    ...commandIdentity(),
    robotId: input.robotId,
    submissionId: input.submissionId,
    expectedSubmissionRevision: input.expectedSubmissionRevision,
  })),
};

export class AgentLifecycleAdapterError extends Error {
  public constructor(
    public readonly code: AgentLifecycleErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AgentLifecycleAdapterError";
  }
}

async function accept<T>(
  operation: Promise<RendererAgentLifecycleSafeResult<T>>,
): Promise<T> {
  const result = await operation;
  if (!result.ok) {
    throw new AgentLifecycleAdapterError(result.error.errorCode, result.error.safeSummary);
  }
  return result.value;
}

function api(): RoboThreeAgentLifecycleApiV1Alpha1 {
  return window.robothreeAgentLifecycleV1Alpha1;
}

function queryIdentity() {
  return { queryId: randomId(), correlationId: randomId() };
}

function commandIdentity() {
  return { commandId: randomId(), correlationId: randomId() };
}

function randomId(): string {
  return globalThis.crypto.randomUUID();
}
