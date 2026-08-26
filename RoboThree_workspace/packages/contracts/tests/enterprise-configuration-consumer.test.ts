import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  EnterpriseConfigurationSnapshotConsumerSchema,
  EnterpriseExactPackageReadConsumerSchema,
  EnterprisePackageDocumentConsumerSchema,
  EnterpriseResourceDescriptorConsumerSchema,
} from "../src/index.js";

type ManifestCase = {
  schema: string;
  file: string;
  valid: boolean;
};

const registry = {
  "configuration-snapshot": EnterpriseConfigurationSnapshotConsumerSchema,
  descriptor: EnterpriseResourceDescriptorConsumerSchema,
  "exact-package-read": EnterpriseExactPackageReadConsumerSchema,
  "package-document": EnterprisePackageDocumentConsumerSchema,
} as const;

describe("Enterprise Configuration TypeScript consumer", () => {
  it("accepts and rejects the canonical Enterprise Gateway corpus", () => {
    const canonicalRoot = resolve(
      process.cwd(),
      "contracts/enterprise-gateway/v1alpha1",
    );
    const manifest = JSON.parse(readFileSync(
      resolve(canonicalRoot, "fixtures/manifest.json"),
      "utf8",
    )) as { cases: ManifestCase[] };

    for (const fixtureCase of manifest.cases) {
      if (!(fixtureCase.schema in registry)) continue;
      const value: unknown = JSON.parse(readFileSync(
        resolve(canonicalRoot, "fixtures", fixtureCase.file),
        "utf8",
      ));
      const schema = registry[
        fixtureCase.schema as keyof typeof registry
      ];
      expect(
        schema.safeParse(value).success,
        `${fixtureCase.schema}:${fixtureCase.file}`,
      ).toBe(fixtureCase.valid);
    }
  });

  it("keeps the consumer strict and free of local persistence fields", () => {
    const canonical = JSON.parse(readFileSync(resolve(
      process.cwd(),
      "contracts/enterprise-gateway/v1alpha1/fixtures/valid/configuration-snapshot.json",
    ), "utf8")) as Record<string, unknown>;
    expect(
      EnterpriseConfigurationSnapshotConsumerSchema.safeParse({
        ...canonical,
        candidateKey: "local-only",
        storagePath: "/private/local.sqlite",
      }).success,
    ).toBe(false);
  });
});
