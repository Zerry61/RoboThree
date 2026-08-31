/** Code-owned structural decision. Runtime readiness is evaluated separately;
 * enabling this never implies that a Personal Model or Credential helper exists. */
export const DFI543A_LOCAL_PERSONAL_PRODUCTION_GRAPH_ENABLED = true as const;

export type Dfi543aProductionReadiness = Readonly<{
  structuralGraphReady: true;
  personalModelPersistenceReady: boolean;
  credentialRuntimeReady: boolean;
}>;

export function isDfi543aRuntimeReady(
  readiness: Dfi543aProductionReadiness,
): boolean {
  return readiness.structuralGraphReady
    && readiness.personalModelPersistenceReady
    && readiness.credentialRuntimeReady;
}
