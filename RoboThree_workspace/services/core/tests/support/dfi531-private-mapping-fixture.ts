const digest = (marker: string) => `sha256:${marker.repeat(64)}` as const;

export function commitmentFixture() {
  return {
    authority: "central_enterprise" as const,
    providerFamily: "enterprise_openai" as const,
    exactSubject: {
      modelCapabilityId: "model.fixture-max",
      modelCapabilityRevision: digest("1"),
      adapterDescriptorId: "adapter.model.fixture-max",
      adapterDescriptorRevision: digest("2"),
      authority: "central_enterprise" as const,
    },
    profileId: "reasoning.profile.fixture-max",
    strategyId: "reasoning.strategy.fixture-max",
    strategyRevision: digest("3"),
    mappingKind: "effort_level" as const,
    timeoutPolicyIdentity: {
      timeoutPolicyRef: "timeout.policy.fixture-max",
      timeoutPolicyRevision: "timeout.policy.fixture-max.v1",
      timeoutPolicyDigest: digest("4"),
    },
    requestProjectionRevision: digest("5"),
    evidenceRevision: digest("6"),
    typedPrivateDirective: {
      kind: "openai_reasoning_effort" as const,
      effort: "xhigh" as const,
    },
  };
}
