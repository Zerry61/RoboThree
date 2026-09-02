import type { CapabilityProjection } from '../app/route-meta';
import type {
  AdminAuditEventSummary,
  AdminKnowledgeDetail,
  AdminKnowledgePage,
  AdminModelDetail,
  AdminModelPage,
  AdminRobotDetail,
  AdminRobotPage,
  AdminSkillDetail,
  AdminSkillPage,
  AdminToolDetail,
  AdminToolPage
} from '@robothree/contracts/admin-control/v1alpha1';
import type {
  AdminModelConnectionTestReceipt,
  AdminManagedModelDetail,
  AdminManagedModelPage,
  AdminModelMutationReceipt,
  CreateAdminModelCommand,
  SetAdminModelLifecycleCommand,
  SetDefaultAdminModelCommand,
  TestAdminModelConnectionCommand,
  UpdateAdminModelCommand
} from '@robothree/contracts/admin-control/v1alpha2';
import type {
  ApproveRobotReviewCommand,
  RejectRobotReviewCommand,
  RobotLifecycleMutationReceipt,
  RobotReviewDetail,
  RobotReviewPage,
} from '@robothree/contracts/agent-lifecycle/v1alpha1';
import type {
  AdminSkillLifecycleApiV1Alpha1,
  SkillLifecycleMutationReceipt,
  SkillOperation,
} from '@robothree/contracts/skill-lifecycle/v1alpha1';

export type AdminCapabilitySet = Readonly<{
  capabilitySetRevision: string;
  capabilities: readonly CapabilityProjection[];
  testIdentityUsed: true;
  productionIdentityReady: false;
}>;

export type AdminListOptions = Readonly<{ cursor?: string; limit?: number }>;
export type AdminAuditEventPage = Readonly<{
  contractVersion: 'admin-control.v1alpha1';
  queryRevision: string;
  items: readonly AdminAuditEventSummary[];
  nextCursor?: string | undefined;
}>;

export type AdminAdapter = Readonly<{
  getCurrentCapabilities(): Promise<AdminCapabilitySet>;
  listModels(options?: AdminListOptions): Promise<AdminModelPage>;
  getModel(modelId: string): Promise<AdminModelDetail>;
  listManagedModels(options?: AdminListOptions): Promise<AdminManagedModelPage>;
  getManagedModel(modelId: string): Promise<AdminManagedModelDetail>;
  listRobots(options?: AdminListOptions): Promise<AdminRobotPage>;
  getRobot(robotId: string): Promise<AdminRobotDetail>;
  listRobotReviews(state?: 'pending_review' | 'approved' | 'rejected' | 'withdrawn'): Promise<RobotReviewPage>;
  getRobotReview(submissionId: string): Promise<RobotReviewDetail>;
  approveRobotReview(command: ApproveRobotReviewCommand): Promise<RobotLifecycleMutationReceipt>;
  rejectRobotReview(command: RejectRobotReviewCommand): Promise<RobotLifecycleMutationReceipt>;
  listSkills(options?: AdminListOptions): Promise<AdminSkillPage>;
  getSkill(skillId: string): Promise<AdminSkillDetail>;
  listTools(options?: AdminListOptions): Promise<AdminToolPage>;
  getTool(toolId: string): Promise<AdminToolDetail>;
  listKnowledge(options?: AdminListOptions): Promise<AdminKnowledgePage>;
  getKnowledge(knowledgeId: string): Promise<AdminKnowledgeDetail>;
  listAuditEvents(options?: AdminListOptions): Promise<AdminAuditEventPage>;
  createModel(command: CreateAdminModelCommand): Promise<AdminModelMutationReceipt>;
  updateModel(command: UpdateAdminModelCommand): Promise<AdminModelMutationReceipt>;
  testModelConnection(command: TestAdminModelConnectionCommand): Promise<AdminModelConnectionTestReceipt>;
  setModelLifecycle(command: SetAdminModelLifecycleCommand): Promise<AdminModelMutationReceipt>;
  setDefaultModel(command: SetDefaultAdminModelCommand): Promise<AdminModelMutationReceipt>;
}> & AdminSkillLifecycleApiV1Alpha1<File>;

export type AdminSkillLifecycleReceipt = SkillLifecycleMutationReceipt;
export type AdminSkillLifecycleOperation = SkillOperation;

export type AdminPageStatus = 'loading' | 'empty' | 'ready' | 'unavailable' | 'permissionDenied' | 'notFound' | 'stale' | 'error' | 'disabled' | 'partial' | 'gated';

export type SafeErrorSummary = Readonly<{
  title: string;
  message: string;
  correlationId?: string;
}>;
