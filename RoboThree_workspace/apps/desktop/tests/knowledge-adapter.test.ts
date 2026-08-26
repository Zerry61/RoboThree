import { describe, expect, it } from "vitest";

import {
  fixtureKnowledgeAdapter,
  gatedKnowledgeAdapter,
} from "../src/renderer/adapters/knowledge-adapter.js";

describe("DFE-5B.1 Knowledge adapters", () => {
  it("uses GatedKnowledgeAdapter as the production default with no knowledge rows", async () => {
    const data = await gatedKnowledgeAdapter.loadKnowledgeSources();
    expect(data.state).toBe("unconfigured_gated");
    expect(data.sources).toEqual([]);
  });

  it("keeps FixtureKnowledgeAdapter explicit prototype/gated data only", async () => {
    const data = await fixtureKnowledgeAdapter.loadKnowledgeSources();
    expect(data.state).toBe("ready");
    expect(data.sources.length).toBeGreaterThan(0);
    for (const source of data.sources) {
      expect(source.dataOrigin).toBe("prototype");
      expect(source.capabilityState).toBe("gated");
    }
  });
});
