import { request } from "node:http";
import { afterEach, describe, expect, it } from "vitest";

import {
  HtmlPreviewSandbox,
  htmlPreviewDocumentFromText,
} from "../src/main/html-preview-sandbox.js";

const sandboxes: HtmlPreviewSandbox[] = [];

describe("APV-1C HTML Preview Sandbox", () => {
  afterEach(async () => {
    await Promise.all(sandboxes.map((sandbox) => sandbox.closeAll()));
    sandboxes.length = 0;
  });

  it("binds only 127.0.0.1 and serves HTML with deny-by-default CSP", async () => {
    const sandbox = track(new HtmlPreviewSandbox());
    const preview = await sandbox.start({
      artifactId: artifactId("a"),
      html: htmlPreviewDocumentFromText({
        title: "Report",
        content: "<script>alert(1)</script><img src=\"https://example.test/pixel.png\">",
      }),
      ttlMs: 60_000,
    });

    expect(preview.localOrigin).toBe("http://127.0.0.1");
    expect(preview.previewUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/preview:/u);
    expect(preview.csp).toContain("default-src 'none'");
    expect(preview.csp).toContain("script-src 'none'");
    expect(preview.csp).toContain("connect-src 'none'");
    expect(preview.csp).toContain("frame-ancestors file:");
    expect(preview.csp).not.toContain("frame-ancestors http:");
    expect(preview.csp).not.toContain("frame-ancestors *");

    const response = await fetch(preview.previewUrl);
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toBe(preview.csp);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(body).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(body).toContain("&lt;img src=\"https://example.test/pixel.png\"&gt;");
    expect(body).not.toContain("<script>alert");
    expect(body).not.toContain("<img src=");

    const close = await sandbox.close(preview.previewSessionId, commandId("1"));
    expect(close).toEqual({
      commandId: commandId("1"),
      previewSessionId: preview.previewSessionId,
      closed: true,
    });
    expect(sandbox.snapshot()).toMatchObject({
      activeSessionCount: 0,
      activeServerCount: 0,
      activeTimerCount: 0,
    });
  });

  it("denies traversal, dotfiles, wrong tokens, wrong host and non-GET methods", async () => {
    const sandbox = track(new HtmlPreviewSandbox());
    const preview = await sandbox.start({
      artifactId: artifactId("b"),
      html: htmlPreviewDocumentFromText({ title: "Report", content: "safe" }),
      ttlMs: 60_000,
    });
    const url = new URL(preview.previewUrl);
    const base = `${url.origin}/${url.pathname.split("/").slice(1, 3).join("/")}`;

    await expectStatus(`${base}/../index.html`, 404);
    await expectStatus(`${base}/.secret`, 404);
    await expectStatus(`${url.origin}/preview:00000000-0000-4000-8000-000000000099/${url.pathname.split("/")[2]}/index.html`, 404);
    await expectWrongHostStatus(preview.previewUrl, 403);
    await expectStatus(preview.previewUrl, 405, { method: "POST" });
    expect(sandbox.snapshot().deniedRequestCount).toBeGreaterThanOrEqual(5);
  });

  it("cleans up sessions, servers and timers across 100 cycles", async () => {
    const sandbox = track(new HtmlPreviewSandbox());
    for (let index = 0; index < 100; index += 1) {
      const preview = await sandbox.start({
        artifactId: artifactId("c"),
        html: htmlPreviewDocumentFromText({
          title: "Cycle",
          content: `preview ${index}`,
        }),
        ttlMs: 60_000,
      });
      await expectStatus(preview.previewUrl, 200);
      await sandbox.close(preview.previewSessionId, commandId(String(index + 2)));
      expect(sandbox.snapshot()).toMatchObject({
        activeSessionCount: 0,
        activeServerCount: 0,
        activeTimerCount: 0,
      });
    }
    expect(sandbox.snapshot()).toMatchObject({
      cleanupCount: 100,
    });
  });
});

function track(sandbox: HtmlPreviewSandbox): HtmlPreviewSandbox {
  sandboxes.push(sandbox);
  return sandbox;
}

async function expectStatus(
  url: string,
  status: number,
  init?: RequestInit,
): Promise<void> {
  const response = await fetch(url, init);
  await response.arrayBuffer();
  expect(response.status).toBe(status);
}

async function expectWrongHostStatus(url: string, status: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const parsed = new URL(url);
    const req = request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: `${parsed.pathname}${parsed.search}`,
      method: "GET",
      headers: { host: "localhost:1234" },
    }, (response) => {
      response.resume();
      response.on("end", () => {
        try {
          expect(response.statusCode).toBe(status);
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

function artifactId(fill: string): string {
  return `artifact:${fill.repeat(64)}`;
}

function commandId(value: string): `${string}-${string}-${string}-${string}-${string}` {
  return `00000000-0000-4000-8000-${value.padStart(12, "0")}`;
}
