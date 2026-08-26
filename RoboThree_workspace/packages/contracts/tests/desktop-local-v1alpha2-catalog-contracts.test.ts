import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  GetRobotCatalogQuerySchema,
  GetToolCatalogQuerySchema,
  CompatibilityProjectionV1Alpha2Schema,
  ListRobotCatalogQuerySchema,
  ListToolCatalogQuerySchema,
  RobotCatalogDetailSchema,
  RobotCatalogPageSchema,
  ToolCatalogDetailSchema,
  ToolCatalogPageSchema,
} from "../src/index.js";

const digest = (marker: string) => `sha256:${marker.repeat(64)}`;
const metadata = {
  contractVersion: "v1alpha2",
  queryId: "019f7447-a784-77b2-a716-000000003a01",
  correlationId: "019f7447-a784-77b2-a716-000000003a02",
  clientInstanceId: "019f7447-a784-77b2-a716-000000003a03",
};

describe("Desktop Local v1alpha2 Robot/Tool Catalog Contract", () => {
  it("freezes the Catalog feature flag in v1alpha2 compatibility", () => {
    expect(CompatibilityProjectionV1Alpha2Schema.parse({
      contractVersion: "v1alpha2",
      coreVersion: "0.0.0-dfi.3a.2",
      supportedContractVersions: ["v1alpha1", "v1alpha2"],
      selectedContractVersion: "v1alpha2",
      features: ["enterprise_configuration_status", "robot_tool_catalog"],
      runtimeInstanceId: "runtime.instance-dfi-3a2",
      activationState: "uninitialized",
      pendingRuntimeActivation: false,
      enterpriseConfigurationStatusQueryRef: "enterprise-configuration-status:current",
    }).features).toContain("robot_tool_catalog");
  });

  it("accepts strict list/detail query families and rejects unknown fields", () => {
    expect(ListRobotCatalogQuerySchema.parse({
      ...metadata,
      type: "list_robot_catalog",
      limit: 100,
    }).limit).toBe(100);
    expect(GetRobotCatalogQuerySchema.parse({
      ...metadata,
      type: "get_robot_catalog",
      robotId: "agent:catalog-fixture",
    }).robotId).toBe("agent:catalog-fixture");
    expect(ListToolCatalogQuerySchema.parse({
      ...metadata,
      type: "list_tool_catalog",
    }).type).toBe("list_tool_catalog");
    expect(GetToolCatalogQuerySchema.parse({
      ...metadata,
      type: "get_tool_catalog",
      toolId: "tool.catalog_fixture",
    }).toolId).toBe("tool.catalog_fixture");
    expect(ListRobotCatalogQuerySchema.safeParse({
      ...metadata,
      type: "list_robot_catalog",
      limit: 101,
    }).success).toBe(false);
    expect(ListToolCatalogQuerySchema.safeParse({
      ...metadata,
      type: "list_tool_catalog",
      unexpected: true,
    }).success).toBe(false);
  });

  it("keeps restricted_empty distinct and enforces availability cross-fields", () => {
    const robot = {
      robotId: "agent:catalog-fixture",
      configurationRevision: digest("a"),
      displayName: "Catalog fixture robot",
      description: "A safe Robot summary.",
      source: "local_trusted",
      restrictionSummary: {
        models: "restricted_nonempty",
        skills: "restricted_empty",
        tools: "restricted_nonempty",
        knowledge: "restricted_empty",
      },
      runnable: false,
      unavailableReason: "catalog.model_unavailable",
    };
    expect(RobotCatalogPageSchema.parse({
      contractVersion: "v1alpha2",
      queryRevision: digest("c"),
      items: [robot],
    }).items[0]?.restrictionSummary.skills).toBe("restricted_empty");
    expect(RobotCatalogDetailSchema.safeParse({
      ...robot,
      defaultModel: {
        resourceId: "model.fixture",
        revision: digest("d"),
        displayName: "Fixture",
        availability: "available",
        unavailableReason: "catalog.availability_unknown",
      },
      allowModelOverride: false,
      eligibleModels: [],
      skills: [],
      tools: [],
      knowledge: [],
    }).success).toBe(false);
    expect(RobotCatalogDetailSchema.safeParse({
      ...robot,
      defaultModel: {
        resourceId: "model.fixture",
        displayName: "model.fixture",
        availability: "unavailable",
        unavailableReason: "catalog.model_unavailable",
      },
      allowModelOverride: false,
      eligibleModels: [],
      skills: [],
      tools: [],
      knowledge: [],
    }).success).toBe(true);
  });

  it("keeps Tool Projection safe and never accepts Binding/Endpoint/Credential fields", () => {
    const tool = {
      toolId: "tool.catalog_fixture",
      capabilityRevision: digest("b"),
      registryRevision: digest("c"),
      displayName: "Catalog fixture tool",
      description: "A safe Tool summary.",
      source: "official_package",
      readOnly: true,
      riskSummary: ["routine_file"],
      availability: "unknown",
      unavailableReason: "catalog.availability_unknown",
    };
    expect(ToolCatalogPageSchema.parse({
      contractVersion: "v1alpha2",
      queryRevision: digest("d"),
      items: [tool],
    }).items).toHaveLength(1);
    expect(ToolCatalogDetailSchema.safeParse({
      ...tool,
      inputShape: "structured_object",
      outputShape: "unspecified",
      credentialRef: "credential:forbidden",
    }).success).toBe(false);
    expect(ToolCatalogDetailSchema.safeParse({
      ...tool,
      inputShape: "structured_object",
      outputShape: "structured_object",
      endpoint: "https://forbidden.example",
    }).success).toBe(false);
  });

  it("freezes the cross-consumer Robot/Tool common semantic fixture", () => {
    const fixture = JSON.parse(readFileSync(resolve(
      process.cwd(),
      "packages/contracts/fixtures/cross-consumer/catalog-alignment-v1.json",
    ), "utf8")) as {
      robot: {
        identity: { publishedRobotRevision: string; desktopConfigurationRevision: string };
        restrictionSummary: Record<string, string>;
      };
      tool: {
        identity: { toolDefinitionRevision: string; desktopCapabilityRevision: string };
        readOnly: boolean;
        riskSummary: string[];
      };
    };
    expect(fixture.robot.identity.desktopConfigurationRevision)
      .toBe(fixture.robot.identity.publishedRobotRevision);
    expect(fixture.robot.restrictionSummary).toEqual({
      models: "restricted_nonempty",
      skills: "restricted_empty",
      tools: "restricted_nonempty",
      knowledge: "restricted_empty",
    });
    expect(fixture.tool.identity.desktopCapabilityRevision)
      .toBe(fixture.tool.identity.toolDefinitionRevision);
    expect(fixture.tool.readOnly).toBe(true);
    expect(fixture.tool.riskSummary).toEqual(["routine_file"]);
  });
});
