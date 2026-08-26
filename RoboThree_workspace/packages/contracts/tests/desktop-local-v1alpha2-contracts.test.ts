import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CompatibilityProjectionSchema,
  CompatibilityProjectionV1Alpha2Schema,
  EnterpriseConfigurationStatusEventEnvelopeSchema,
  EnterpriseConfigurationStatusProjectionSchema,
  EnterpriseConfigurationStatusQuerySchema,
  RuntimeStatusProjectionV1Alpha2Schema,
  ListWorkspaceEntriesQuerySchema,
  WorkspaceDirectoryProjectionSchema,
} from "../src/index.js";

type Fixture = {
  schema: keyof typeof schemaRegistry;
  reason?: string;
  value: unknown;
};

const schemaRegistry = {
  compatibility_projection: CompatibilityProjectionV1Alpha2Schema,
  runtime_status_projection: RuntimeStatusProjectionV1Alpha2Schema,
  enterprise_configuration_status_query:
    EnterpriseConfigurationStatusQuerySchema,
  enterprise_configuration_status_projection:
    EnterpriseConfigurationStatusProjectionSchema,
  enterprise_configuration_status_event:
    EnterpriseConfigurationStatusEventEnvelopeSchema,
  workspace_entries_query: ListWorkspaceEntriesQuerySchema,
  workspace_directory_projection: WorkspaceDirectoryProjectionSchema,
};

function readFixtures(name: "invalid" | "valid"): Fixture[] {
  const path = resolve(
    process.cwd(),
    "packages/contracts/fixtures/desktop-local/v1alpha2",
    `${name}.json`,
  );
  return JSON.parse(readFileSync(path, "utf8")) as Fixture[];
}

describe("Desktop Local Runtime Contract v1alpha2 enterprise configuration status", () => {
  it("accepts the complete valid fixture corpus", () => {
    for (const fixture of readFixtures("valid")) {
      expect(
        schemaRegistry[fixture.schema].safeParse(fixture.value).success,
        fixture.schema,
      ).toBe(true);
    }
  });

  it("rejects the complete negative corpus", () => {
    for (const fixture of readFixtures("invalid")) {
      expect(
        schemaRegistry[fixture.schema].safeParse(fixture.value).success,
        `${fixture.schema}: ${fixture.reason}`,
      ).toBe(false);
    }
  });

  it("keeps v1alpha1 strict compatibility projection unchanged", () => {
    const v2 = readFixtures("valid")[0]!.value;
    expect(CompatibilityProjectionV1Alpha2Schema.safeParse(v2).success).toBe(true);
    expect(CompatibilityProjectionSchema.safeParse(v2).success).toBe(false);
  });

  it("does not allow sensitive enterprise material in status events", () => {
    const event = structuredClone(readFixtures("valid")[4]!.value) as {
      payload: Record<string, unknown>;
    };
    event.payload.token = "sensitive";
    event.payload.oaMaterial = "sensitive";
    event.payload.localPath = "/private/path";
    expect(
      EnterpriseConfigurationStatusEventEnvelopeSchema.safeParse(event).success,
    ).toBe(false);
  });
});
