import type {
  ArtifactCatalogItemProjection,
  ArtifactProjection,
  JsonValue,
} from "@robothree/contracts";

import { formatDisplayTime } from "./display-formatting.js";

export type ArtifactPresentationTone =
  | "available"
  | "attention"
  | "blocked"
  | "deleted";

export type ArtifactPresentationMetaItem = Readonly<{
  label: string;
  value: string;
}>;

export type ArtifactPresentation = Readonly<{
  title: string;
  kindLabel: string;
  stateLabel: string;
  tone: ArtifactPresentationTone;
  summary: string;
  meta: readonly ArtifactPresentationMetaItem[];
}>;

export type ArtifactPresentationSource =
  | ArtifactProjection
  | ArtifactCatalogItemProjection;

export function presentArtifact(
  artifact: ArtifactPresentationSource,
): ArtifactPresentation {
  const lifecycle = artifact.lifecycle ?? {
    revision: 0,
    pinned: false,
    dismissed: false,
    deleted: false,
    sourceDeleted: false,
  };
  return {
    title: artifact.displayName,
    kindLabel: artifactKindLabel(artifact.kind),
    stateLabel: lifecycle.sourceDeleted
      ? "源文件已删除"
      : lifecycle.deleted
        ? "已移除"
        : artifactStateLabel(artifact.previewState),
    tone: lifecycle.deleted ? "deleted" : artifactTone(artifact.previewState),
    summary: artifact.relativePath ?? sourceKindLabel(artifact.sourceKind),
    meta: artifactMeta(artifact),
  };
}

export function artifactKindLabel(kind: ArtifactPresentationSource["kind"]): string {
  switch (kind) {
    case "document":
      return "文档";
    case "spreadsheet":
      return "表格";
    case "markdown":
      return "Markdown";
    case "html":
      return "HTML";
    case "text":
      return "文本";
    case "image":
      return "图片";
    case "unknown":
      return "未知";
    default:
      return assertNever(kind);
  }
}

export function artifactStateLabel(
  state: ArtifactPresentationSource["previewState"],
): string {
  switch (state) {
    case "available":
      return "已索引";
    case "unsupported":
      return "暂不支持";
    case "too_large":
      return "过大";
    case "blocked":
      return "已阻止";
    case "missing":
      return "缺失";
    default:
      return assertNever(state);
  }
}

function artifactTone(
  state: ArtifactPresentationSource["previewState"],
): ArtifactPresentationTone {
  switch (state) {
    case "available":
      return "available";
    case "unsupported":
    case "too_large":
    case "missing":
      return "attention";
    case "blocked":
      return "blocked";
    default:
      return assertNever(state);
  }
}

function artifactMeta(
  artifact: ArtifactPresentationSource,
): readonly ArtifactPresentationMetaItem[] {
  const lifecycle = artifact.lifecycle ?? {
    revision: 0,
    pinned: false,
    dismissed: false,
    deleted: false,
    sourceDeleted: false,
  };
  const meta: ArtifactPresentationMetaItem[] = [
    { label: "类型", value: artifact.mediaType },
    { label: "创建", value: formatDisplayTime(artifact.createdAt) },
  ];
  meta.push({ label: "版本", value: String(lifecycle.revision) });
  if (lifecycle.pinned) {
    meta.push({ label: "标记", value: "Pinned" });
  }
  if (lifecycle.dismissed) {
    meta.push({ label: "状态", value: "Dismissed" });
  }
  if (lifecycle.deleted) {
    meta.push({ label: "状态", value: lifecycle.sourceDeleted ? "Source deleted" : "Deleted" });
  }
  if (lifecycle.deletedAt !== undefined) {
    meta.push({ label: "移除", value: formatDisplayTime(lifecycle.deletedAt) });
  }
  if (lifecycle.sourceDeletedAt !== undefined) {
    meta.push({ label: "源文件", value: formatDisplayTime(lifecycle.sourceDeletedAt) });
  }
  if (artifact.byteSize !== undefined) {
    meta.push({ label: "大小", value: formatBytes(artifact.byteSize) });
  }
  const capability = metadataString(artifact.metadata.capabilityId);
  if (capability !== undefined) {
    meta.push({ label: "来源", value: capability });
  }
  return meta;
}

function sourceKindLabel(sourceKind: ArtifactPresentationSource["sourceKind"]): string {
  switch (sourceKind) {
    case "tool_observation":
      return "工具结果";
    case "workspace_file":
      return "工作区文件";
    case "generated_preview":
      return "生成预览";
    default:
      return assertNever(sourceKind);
  }
}

function metadataString(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled artifact presentation value: ${String(value)}`);
}
