import type { AdminAdapter } from './admin-adapter';
import type { CapabilityProjection } from '../app/route-meta';

export function createFixtureAdminAdapter(capabilities: readonly CapabilityProjection[]): AdminAdapter {
  const unavailable = async (): Promise<never> => {
    throw new Error('admin.fixture_inventory_unavailable');
  };

  return {
    async getCurrentCapabilities() {
      return {
        capabilitySetRevision: 'fixture-only',
        capabilities,
        testIdentityUsed: true,
        productionIdentityReady: false
      };
    },
    listModels: unavailable,
    getModel: unavailable,
    listManagedModels: unavailable,
    getManagedModel: unavailable,
    listRobots: unavailable,
    getRobot: unavailable,
    listRobotReviews: unavailable,
    getRobotReview: unavailable,
    approveRobotReview: unavailable,
    rejectRobotReview: unavailable,
    listSkills: unavailable,
    getSkill: unavailable,
    listTools: unavailable,
    getTool: unavailable,
    listKnowledge: unavailable,
    getKnowledge: unavailable,
    listAuditEvents: unavailable,
    createModel: unavailable,
    updateModel: unavailable,
    testModelConnection: unavailable,
    setModelLifecycle: unavailable,
    setDefaultModel: unavailable,
    listSkillSubmissions: unavailable,
    getSkillSubmission: unavailable,
    approveSkillSubmission: unavailable,
    rejectSkillSubmission: unavailable,
    uploadEnterpriseSkillPackage: unavailable,
    getEnterpriseSkillDraft: unavailable,
    updateEnterpriseSkillDraftMetadata: unavailable,
    startEnterpriseSkillDraftTest: unavailable,
    queryEnterpriseSkillDraftTest: unavailable,
    publishEnterpriseSkillDraft: unavailable
  };
}
