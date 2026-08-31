export const ENTERPRISE_MODEL_INVOCATION_TIMEOUT_MS = 15 * 60_000;
export const ENTERPRISE_AGENT_TURN_TIMEOUT_MS = 30 * 60_000;

export function enterpriseAgentTurnDeadlineAt(startedAt: string): string {
  const startedAtMs = Date.parse(startedAt);
  if (!Number.isFinite(startedAtMs)) {
    throw new Error("Agent Turn start time is invalid");
  }
  return new Date(startedAtMs + ENTERPRISE_AGENT_TURN_TIMEOUT_MS).toISOString();
}

export function clampEnterpriseInvocationDeadline(
  startedAt: string,
  turnDeadlineAt: string | undefined,
): string {
  const startedAtMs = Date.parse(startedAt);
  if (!Number.isFinite(startedAtMs)) {
    throw new Error("Model invocation start time is invalid");
  }
  const requestDeadlineAt = new Date(
    startedAtMs + ENTERPRISE_MODEL_INVOCATION_TIMEOUT_MS,
  ).toISOString();
  if (turnDeadlineAt === undefined) return requestDeadlineAt;
  const turnDeadlineMs = Date.parse(turnDeadlineAt);
  if (!Number.isFinite(turnDeadlineMs)) {
    throw new Error("Agent Turn deadline is invalid");
  }
  return new Date(Math.min(Date.parse(requestDeadlineAt), turnDeadlineMs)).toISOString();
}
