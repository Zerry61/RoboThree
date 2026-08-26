import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const fixturePath = fileURLToPath(new URL(
  "../../services/central-service/src/test/resources/conformance/cgf-foundation.fixture.json",
  import.meta.url,
));

describe("CGF-0 shared foundation fixture", () => {
  it("is readable by TypeScript without becoming a production Contract", async () => {
    const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as Record<string, unknown>;

    expect(fixture).toEqual({
      fixtureSchema: "robothree.enterprise.foundation-fixture.v1",
      fixtureOnly: true,
      service: "central-gateway",
      status: "ready",
      compatible: true,
    });
  });
});
