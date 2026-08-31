import type { AdminAdapter } from './admin-adapter';

export function createUnavailableAdminAdapter(): AdminAdapter {
  const unavailable = async (): Promise<never> => {
    throw new Error('admin.integration_unavailable');
  };
  return {
    getCurrentCapabilities: unavailable,
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
    setDefaultModel: unavailable
  };
}
