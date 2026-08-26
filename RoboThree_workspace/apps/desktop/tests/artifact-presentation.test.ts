import type { ArtifactProjection } from "@robothree/contracts";
import { describe, expect, it } from "vitest";

import {
  artifactKindLabel,
  artifactStateLabel,
  presentArtifact,
} from "../src/renderer/presentation/artifact-presentation.js";

const baseArtifact = {
  artifactId: `artifact:${"a".repeat(64)}`,
  taskId: "task.fixture-001",
  sourceKind: "tool_observation",
  sourceId: "019f9990-0000-7000-8000-000000000001",
  sourceDigest: `sha256:${"b".repeat(64)}`,
  displayName: "report.xlsx",
  kind: "spreadsheet",
  mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  relativePath: "reports/report.xlsx",
  byteSize: 2048,
  createdAt: "2026-08-05T09:00:00.000Z",
  previewState: "available",
  metadata: {
    capabilityId: "tool.document.xlsx.write",
    sheetCount: 1,
  },
} as const satisfies ArtifactProjection;

describe("APV-1A Artifact presentation", () => {
  it("presents metadata-only artifact cards without payload or workspace leakage", () => {
    const artifact = {
      ...baseArtifact,
      workspaceRoot: "/Users/example/private-root",
      workbook: { sheets: [{ rows: [["do-not-leak"]] }] },
    } as ArtifactProjection & {
      workspaceRoot: string;
      workbook: unknown;
    };

    const presentation = presentArtifact(artifact);

    expect(presentation).toMatchObject({
      title: "report.xlsx",
      kindLabel: "表格",
      stateLabel: "已索引",
      tone: "available",
      summary: "reports/report.xlsx",
    });
    expect(presentation.meta).toEqual([
      {
        label: "类型",
        value: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
      { label: "创建", value: expect.any(String) },
      { label: "版本", value: "0" },
      { label: "大小", value: "2.0 KB" },
      { label: "来源", value: "tool.document.xlsx.write" },
    ]);
    const serialized = JSON.stringify(presentation);
    expect(serialized).not.toContain("/Users/example/private-root");
    expect(serialized).not.toContain("do-not-leak");
    expect(serialized).not.toContain("workbook");
  });

  it("maps all APV projection kinds and states explicitly", () => {
    expect([
      "document",
      "spreadsheet",
      "markdown",
      "html",
      "text",
      "image",
      "unknown",
    ].map((kind) => artifactKindLabel(kind as ArtifactProjection["kind"])))
      .toEqual(["文档", "表格", "Markdown", "HTML", "文本", "图片", "未知"]);
    expect([
      "available",
      "unsupported",
      "too_large",
      "blocked",
      "missing",
    ].map((state) =>
      artifactStateLabel(state as ArtifactProjection["previewState"])))
      .toEqual(["已索引", "暂不支持", "过大", "已阻止", "缺失"]);
  });

  it("falls back to source kind when no safe relative path is projected", () => {
    expect(presentArtifact({
      ...baseArtifact,
      relativePath: undefined,
      previewState: "blocked",
    }).summary).toBe("工具结果");
  });

  it("marks deleted records without exposing source authority", () => {
    const presentation = presentArtifact({
      ...baseArtifact,
      lifecycle: {
        revision: 2,
        pinned: false,
        dismissed: false,
        deleted: true,
        updatedAt: "2026-08-06T10:00:00.000Z",
        deletedAt: "2026-08-06T10:00:00.000Z",
      },
    });

    expect(presentation).toMatchObject({
      stateLabel: "已移除",
      tone: "deleted",
    });
    expect(presentation.meta).toEqual(expect.arrayContaining([
      { label: "版本", value: "2" },
      { label: "状态", value: "Deleted" },
      { label: "移除", value: expect.any(String) },
    ]));
  });
});
