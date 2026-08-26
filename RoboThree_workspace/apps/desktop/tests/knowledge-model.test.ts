import { describe, expect, it } from "vitest";

import { knowledgeFixtureSources } from "../src/renderer/adapters/knowledge-adapter.js";
import {
  filterKnowledgeSources,
  filterSampleResults,
  isSafeKnowledgeId,
  presentKnowledgeCenter,
  presentKnowledgeDetail,
  presentKnowledgeSource,
} from "../src/renderer/pages/knowledge/knowledge-model.js";

const forbiddenFields = [
  "Token",
  "Credential",
  "CapabilityLock",
  "API Key",
  "requestDigest",
  "workspaceRoot",
  "rootRealPath",
  "selectedPath",
  "providerEndpoint",
  "rawChunk",
  "observation",
  "payload",
  "embedding",
  "vector",
  "indexJob",
  "syncJob",
] as const;

describe("DFE-5B.1 knowledge view model", () => {
  it("presents production default as unconfigured gated with no rows or search", () => {
    const view = presentKnowledgeCenter("unconfigured_gated", [], "");
    expect(view.showSearch).toBe(false);
    expect(view.showList).toBe(false);
    expect(view.filteredSources).toHaveLength(0);
    expect(view.title).toContain("尚未配置");
    expect(view.noticeText).toContain("不展示示例知识源");
  });

  it("keeps Fixture sources explicitly prototype and gated", () => {
    for (const source of knowledgeFixtureSources) {
      expect(source.dataOrigin).toBe("prototype");
      expect(source.capabilityState).toBe("gated");
      for (const result of source.sampleResults) {
        expect(result.dataOrigin).toBe("prototype");
        expect(result.capabilityState).toBe("gated");
      }
    }
  });

  it("filters only safe display fields in Fixture scenarios", () => {
    const cards = knowledgeFixtureSources.map(presentKnowledgeSource);
    expect(filterKnowledgeSources(cards, "报销")).toHaveLength(1);
    expect(filterKnowledgeSources(cards, "产品资料")).toHaveLength(1);
    expect(filterKnowledgeSources(cards, "missing")).toHaveLength(0);
    expect(filterSampleResults(cards[0]?.sampleResults ?? [], "差旅")).toHaveLength(1);
  });

  it("finds details only for safe predeclared ids", () => {
    const found = presentKnowledgeDetail("ready", knowledgeFixtureSources, "enterprise-policy-demo", "");
    expect(found.state).toBe("found");
    if (found.state === "found") {
      expect(found.source.name).toContain("企业制度");
      expect(found.filteredResults.length).toBeGreaterThan(0);
    }

    const unsafe = presentKnowledgeDetail("ready", knowledgeFixtureSources, "../secret", "");
    expect(unsafe.state).toBe("not_found");
    expect(JSON.stringify(unsafe)).not.toContain("../secret");

    const gated = presentKnowledgeDetail("unconfigured_gated", [], "enterprise-policy-demo", "");
    expect(gated.state).toBe("unconfigured_gated");
    expect(JSON.stringify(gated)).not.toContain("enterprise-policy-demo");
  });

  it("rejects unsafe knowledge ids", () => {
    expect(isSafeKnowledgeId("enterprise-policy-demo")).toBe(true);
    expect(isSafeKnowledgeId("A-demo")).toBe(false);
    expect(isSafeKnowledgeId("../demo")).toBe(false);
    expect(isSafeKnowledgeId("ab")).toBe(false);
  });

  it("keeps sensitive fields out of model output and fixtures", () => {
    const serialized = JSON.stringify({
      fixture: knowledgeFixtureSources,
      gated: presentKnowledgeCenter("unconfigured_gated", [], ""),
      detail: presentKnowledgeDetail("ready", knowledgeFixtureSources, "enterprise-policy-demo", ""),
    });
    for (const forbidden of forbiddenFields) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(serialized).not.toContain("命中");
    expect(serialized).not.toContain("召回");
    expect(serialized).not.toContain("引用成功");
    expect(serialized).not.toContain("同步完成");
    expect(serialized).not.toContain("索引完成");
  });
});
