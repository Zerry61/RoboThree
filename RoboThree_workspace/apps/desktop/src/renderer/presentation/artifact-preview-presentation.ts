import type {
  ArtifactPreviewMode,
  ArtifactTextPreviewProjection,
} from "@robothree/contracts";

export type ArtifactPreviewBlock =
  | Readonly<{ kind: "heading"; text: string; level: 2 | 3 }>
  | Readonly<{ kind: "paragraph"; text: string }>
  | Readonly<{ kind: "list_item"; text: string }>
  | Readonly<{ kind: "code"; text: string }>
  | Readonly<{ kind: "table_row"; cells: readonly string[] }>;

export type ArtifactPreviewPresentation = Readonly<{
  artifactId: string;
  mode: ArtifactPreviewMode;
  text: string;
  truncated: boolean;
  warnings: readonly string[];
  blocks: readonly ArtifactPreviewBlock[];
}>;

const MAX_RENDER_BLOCKS = 128;
const MAX_CELL_COUNT = 16;

export function presentArtifactPreview(
  preview: ArtifactTextPreviewProjection,
): ArtifactPreviewPresentation {
  const text = sanitizePreviewText(preview.content);
  return {
    artifactId: preview.artifactId,
    mode: preview.mode,
    text,
    truncated: preview.truncated,
    warnings: preview.warnings.map(sanitizePreviewText),
    blocks: preview.mode === "markdown"
      ? markdownBlocks(text).slice(0, MAX_RENDER_BLOCKS)
      : [{ kind: "code", text }],
  };
}

export function sanitizePreviewText(input: string): string {
  return stripDangerousTokens(stripMarkdownUrls(escapeRawHtml(input.normalize("NFC"))));
}

function markdownBlocks(input: string): readonly ArtifactPreviewBlock[] {
  const blocks: ArtifactPreviewBlock[] = [];
  const lines = input.replace(/\r\n?/gu, "\n").split("\n");
  let paragraph: string[] = [];
  let code: string[] | undefined;
  const flushParagraph = (): void => {
    if (paragraph.length === 0) return;
    blocks.push({ kind: "paragraph", text: paragraph.join(" ").trim() });
    paragraph = [];
  };
  const flushCode = (): void => {
    if (code === undefined) return;
    blocks.push({ kind: "code", text: code.join("\n") });
    code = undefined;
  };
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      if (code === undefined) {
        flushParagraph();
        code = [];
      } else {
        flushCode();
      }
      continue;
    }
    if (code !== undefined) {
      code.push(line);
      continue;
    }
    if (trimmed.length === 0) {
      flushParagraph();
      continue;
    }
    const heading = /^(#{2,3})\s+(.+)$/u.exec(trimmed);
    if (heading !== null) {
      flushParagraph();
      const marker = heading.at(1) ?? "##";
      blocks.push({
        kind: "heading",
        level: marker.length === 3 ? 3 : 2,
        text: heading.at(2) ?? "",
      });
      continue;
    }
    const listItem = /^[-*+]\s+(.+)$/u.exec(trimmed);
    if (listItem !== null) {
      flushParagraph();
      blocks.push({ kind: "list_item", text: listItem.at(1) ?? "" });
      continue;
    }
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      flushParagraph();
      const cells = trimmed.slice(1, -1).split("|")
        .map((cell) => cell.trim())
        .filter((cell) => !/^-{3,}$/u.test(cell))
        .slice(0, MAX_CELL_COUNT);
      if (cells.length > 0) blocks.push({ kind: "table_row", cells });
      continue;
    }
    paragraph.push(trimmed);
  }
  flushParagraph();
  flushCode();
  return blocks;
}

function stripMarkdownUrls(input: string): string {
  return input
    .replace(/!\[([^\]\n]*)\]\([^)]+\)/gu, (_match, alt: string) =>
      `[image: ${alt.slice(0, 120)}]`)
    .replace(/\[([^\]\n]+)\]\([^)]+\)/gu, (_match, label: string) => label);
}

function escapeRawHtml(input: string): string {
  return input
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;");
}

function stripDangerousTokens(input: string): string {
  return input
    .replace(/\bon[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/giu, "[event removed]")
    .replace(/\b(?:javascript|data|file):[^\s)"']*/giu, "[url removed]")
    .replace(/\bhttps?:\/\/[^\s)"']+/giu, "[url removed]");
}
