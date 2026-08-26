import { describe, expect, it } from "vitest";

import {
  presentArtifactPreview,
  sanitizePreviewText,
} from "../src/renderer/presentation/artifact-preview-presentation.js";

describe("APV-1B Artifact preview presentation", () => {
  it("sanitizes Markdown preview into inert text blocks without raw HTML or URLs", () => {
    const malicious = [
      "## Report",
      "<script>alert(1)</script>",
      "<iframe src=\"http://example.test\"></iframe>",
      "<object data=\"file:///private/root\"></object>",
      "<embed src=\"https://example.test/x\">",
      "<style>body{display:none}</style>",
      "<p onclick=\"alert(1)\">click</p>",
      "[run](javascript:alert(1))",
      "![remote](https://example.test/pixel.png)",
      "[data](data:text/html;base64,PHNjcmlwdA==)",
      "```",
      "<script>still inert</script>",
      "```",
    ].join("\n");

    const presentation = presentArtifactPreview({
      artifactId: `artifact:${"a".repeat(64)}`,
      mode: "markdown",
      content: malicious,
      byteSize: new TextEncoder().encode(malicious).byteLength,
      truncated: false,
      warnings: [],
    });
    const serialized = JSON.stringify(presentation);

    expect(serialized).toContain("&lt;script&gt;");
    expect(serialized).not.toContain("<script");
    expect(serialized).not.toContain("<iframe");
    expect(serialized).not.toContain("<object");
    expect(serialized).not.toContain("<embed");
    expect(serialized).not.toContain("<style");
    expect(serialized).not.toContain("onclick=");
    expect(serialized).not.toContain("javascript:");
    expect(serialized).not.toContain("data:text/html");
    expect(serialized).not.toContain("https://example.test");
    expect(presentation.blocks.some((block) => block.kind === "code")).toBe(true);
  });

  it("bounds rendered Markdown blocks while preserving text mode as a code block", () => {
    const content = Array.from({ length: 180 }, (_, index) => `- item ${index}`)
      .join("\n");
    const markdown = presentArtifactPreview({
      artifactId: `artifact:${"b".repeat(64)}`,
      mode: "markdown",
      content,
      byteSize: new TextEncoder().encode(content).byteLength,
      truncated: true,
      warnings: ["preview_truncated"],
    });
    const text = presentArtifactPreview({
      artifactId: `artifact:${"c".repeat(64)}`,
      mode: "text",
      content,
      byteSize: new TextEncoder().encode(content).byteLength,
      truncated: false,
      warnings: [],
    });

    expect(markdown.blocks).toHaveLength(128);
    expect(text.blocks).toEqual([{ kind: "code", text: sanitizePreviewText(content) }]);
  });
});
