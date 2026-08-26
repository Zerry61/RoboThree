import type {
  EnterpriseConfigurationSnapshot,
  EnterprisePackageDocument,
  EnterprisePackageReference,
  EnterpriseResourceDescriptor,
} from "@robothree/contracts";

import {
  ConfigurationValidator,
  PackageMaterializer,
  canonicalDigestWithout,
  canonicalJson,
  rawSha256,
  type EnterpriseIdentityScope,
  type MaterializedEnterpriseConfiguration,
  type ValidatedConfigurationSnapshot,
  type ValidatedEnterprisePackage,
} from "../src/index.js";

export const enterpriseScope: EnterpriseIdentityScope = {
  enterpriseId: "enterprise.acme",
  userId: "user.alice",
  deviceId: "device.managed-one",
  clientInstanceId: "client.desktop-one",
};

export const otherEnterpriseScope: EnterpriseIdentityScope = {
  ...enterpriseScope,
  userId: "user.bob",
  clientInstanceId: "client.desktop-two",
};

export function createEnterpriseConfigurationFixture(input?: {
  marker?: string;
  scope?: EnterpriseIdentityScope;
  agentCount?: number;
  skillCount?: number;
  models?: readonly EnterpriseResourceDescriptor[];
  tools?: readonly EnterpriseResourceDescriptor[];
  knowledge?: readonly EnterpriseResourceDescriptor[];
  fixedPermissions?: readonly string[];
}): {
  snapshot: ValidatedConfigurationSnapshot;
  packages: readonly ValidatedEnterprisePackage[];
  materialized: MaterializedEnterpriseConfiguration;
} {
  const marker = input?.marker ?? "one";
  const validator = new ConfigurationValidator({
    desktopVersion: "0.0.0",
    coreVersion: "0.0.0",
    supportsContractVersion: (version) => version === "v1alpha1",
    isDesktopCompatible: () => true,
    isCoreCompatible: () => true,
  });
  const agentCount = input?.agentCount ?? 1;
  const skillCount = input?.skillCount ?? 1;
  const agents = Array.from({ length: agentCount }, (_value, index) => {
    const suffix = agentCount === 1 ? marker : `${marker}-${index + 1}`;
    return packageDocument("agent", `agent.${suffix}`, suffix);
  });
  const skills = Array.from({ length: skillCount }, (_value, index) => {
    const suffix = skillCount === 1 ? marker : `${marker}-${index + 1}`;
    return packageDocument("skill", `skill.${suffix}`, suffix);
  });
  const agentReferences = agents.map(packageReference);
  const skillReferences = skills.map(packageReference);
  const snapshotDraft: Omit<EnterpriseConfigurationSnapshot, "digest"> = {
    contractVersion: "v1alpha1",
    snapshotId: `snapshot.${marker}`,
    revision: repeatedDigest(marker.charCodeAt(0)),
    schemaVersion: "v1alpha1",
    minimumDesktopVersion: "0.0.0",
    minimumCoreVersion: "0.0.0",
    models: [...(input?.models ?? [{
      kind: "model",
      id: `model.${marker}`,
      revision: repeatedDigest(17),
      digest: repeatedDigest(18),
      capabilities: ["streaming"],
      gatewayEndpoint: "/model/invoke",
      credentialAvailable: true,
      enabled: true,
      fixedPermissions: ["model.invoke"],
    }])],
    tools: [...(input?.tools ?? [])],
    agents: agentReferences,
    skills: skillReferences,
    knowledge: [...(input?.knowledge ?? [])],
    fixedPermissions: [
      ...(input?.fixedPermissions ?? ["configuration.read"]),
    ],
    gatewayEndpoints: {
      configuration: "/enterprise/configuration",
    },
    generatedAt: "2026-07-25T00:00:00.000Z",
  };
  const snapshotDocument: EnterpriseConfigurationSnapshot = {
    ...snapshotDraft,
    digest: canonicalDigestWithout(snapshotDraft, "digest"),
  };
  const snapshot = validator.validateSnapshot({
    rawJson: canonicalJson(snapshotDocument),
    etag: `"snapshot-${marker}"`,
  });
  const packages = [
    ...agents.map((agent, index) =>
      validator.validatePackage({
        rawJson: canonicalJson(agent),
        expected: agentReferences[index]!,
        etag: `"agent-${marker}-${index + 1}"`,
      })),
    ...skills.map((skill, index) =>
      validator.validatePackage({
        rawJson: canonicalJson(skill),
        expected: skillReferences[index]!,
        etag: `"skill-${marker}-${index + 1}"`,
      })),
  ];
  const materialized = new PackageMaterializer().materialize({
    scope: input?.scope ?? enterpriseScope,
    snapshot,
    packages,
    sealedAt: "2026-07-25T00:01:00.000Z",
  });
  return { snapshot, packages, materialized };
}

function packageDocument(
  kind: "agent" | "skill",
  packageId: string,
  marker: string,
): EnterprisePackageDocument {
  const utf8Content = `# ${kind} ${marker}\n`;
  const draft: Omit<EnterprisePackageDocument, "packageDigest"> = {
    packageId,
    kind,
    revision: repeatedDigest(kind === "agent" ? 23 : 29),
    manifest: {
      id: packageId,
      marker,
    },
    files: [{
      relativePath: kind === "agent" ? "AGENT.md" : "SKILL.md",
      mediaType: "text/markdown",
      utf8Content,
      contentDigest: rawSha256(utf8Content),
    }],
    createdAt: "2026-07-25T00:00:00.000Z",
  };
  return {
    ...draft,
    packageDigest: canonicalDigestWithout(draft, "packageDigest"),
  };
}

function packageReference(
  document: EnterprisePackageDocument,
): EnterprisePackageReference {
  return {
    packageId: document.packageId,
    kind: document.kind,
    revision: document.revision,
    digest: document.packageDigest,
  };
}

function repeatedDigest(seed: number): string {
  return (seed % 16).toString(16).repeat(64);
}
