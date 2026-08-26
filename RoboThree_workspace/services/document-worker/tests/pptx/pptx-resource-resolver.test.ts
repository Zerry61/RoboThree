import { describe, expect, it } from "vitest";
import {
  canonicalizePptxImageUrl,
  detectImageMediaType,
  resolvePptxImageResource,
  validateResolvedResourceIp,
} from "../../src/index.js";

import type {
  PinnedHttpsRequest,
  PptxResourceFetchResult,
  PptxResourceResolverDependencies,
  PptxResourceResolverLimits,
} from "../../src/index.js";

const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
);
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43]);
const LIMITS: PptxResourceResolverLimits = {
  maxImageBytes: 1024 * 1024,
  maxRedirects: 3,
  resolveTimeoutMs: 5000,
};

describe("PPTX resource resolver", () => {
  it("pins URL fetches to the validated IP and manually revalidates redirects", async () => {
    const calls: PinnedHttpsRequest[] = [];
    const deps: PptxResourceResolverDependencies = {
      lookup: async (hostname) => [
        { address: hostname === "cdn.example.com" ? "93.184.216.34" : "203.0.113.9", family: 4 },
      ],
      fetchPinned: async (request): Promise<PptxResourceFetchResult> => {
        calls.push(request);
        if (request.hostname === "cdn.example.com") {
          return {
            statusCode: 302,
            headers: { location: "https://assets.example.com/logo.png" },
            bytes: Buffer.alloc(0),
            remoteAddress: "93.184.216.34",
          };
        }
        return {
          statusCode: 200,
          headers: { "content-type": "image/png" },
          bytes: PNG_BYTES,
          remoteAddress: "203.0.113.9",
        };
      },
    };

    const resolved = await resolvePptxImageResource(
      { type: "url", url: "https://cdn.example.com/logo.png" },
      LIMITS,
      new AbortController().signal,
      deps,
    );

    expect(resolved.mediaType).toBe("image/png");
    expect(resolved.safeSourceSummary).toMatchObject({
      sourceType: "url",
      host: "assets.example.com",
      redirectCount: 1,
      mediaType: "image/png",
      byteSize: PNG_BYTES.byteLength,
    });
    expect(JSON.stringify(resolved.safeSourceSummary)).not.toContain("?");
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({
      hostname: "cdn.example.com",
      hostHeader: "cdn.example.com",
      resolvedIp: "93.184.216.34",
    });
    expect(calls[1]).toMatchObject({
      hostname: "assets.example.com",
      hostHeader: "assets.example.com",
      resolvedIp: "203.0.113.9",
    });
  });

  it("rejects private and special IP addresses before connection", async () => {
    for (const address of [
      "10.0.0.1",
      "172.16.0.9",
      "192.168.1.2",
      "127.0.0.1",
      "169.254.169.254",
      "0.0.0.0",
      "::1",
      "fc00::1",
      "fe80::1",
      "::ffff:127.0.0.1",
    ]) {
      expect(() => validateResolvedResourceIp(address), address).toThrow(
        expect.objectContaining({ detailCode: "resource_ip_blocked" }),
      );
    }
  });

  it("fails closed when the connected remote address differs from the validated IP", async () => {
    const deps: PptxResourceResolverDependencies = {
      lookup: async () => [{ address: "93.184.216.34", family: 4 }],
      fetchPinned: async () => ({
        statusCode: 200,
        headers: { "content-type": "image/png" },
        bytes: PNG_BYTES,
        remoteAddress: "10.0.0.5",
      }),
    };

    await expect(resolvePptxImageResource(
      { type: "url", url: "https://cdn.example.com/logo.png" },
      LIMITS,
      new AbortController().signal,
      deps,
    )).rejects.toMatchObject({
      code: "unsupported_feature",
      detailCode: "resource_ip_rebound",
    });
  });

  it("validates declared Content-Type against magic bytes", async () => {
    const deps: PptxResourceResolverDependencies = {
      lookup: async () => [{ address: "93.184.216.34", family: 4 }],
      fetchPinned: async () => ({
        statusCode: 200,
        headers: { "content-type": "image/jpeg" },
        bytes: PNG_BYTES,
        remoteAddress: "93.184.216.34",
      }),
    };

    await expect(resolvePptxImageResource(
      { type: "url", url: "https://cdn.example.com/logo.png" },
      LIMITS,
      new AbortController().signal,
      deps,
    )).rejects.toMatchObject({
      code: "unsupported_feature",
      detailCode: "resource_magic_mismatch",
    });
  });

  it("validates data resources with magic bytes and canonical URL shape", async () => {
    expect(detectImageMediaType(PNG_BYTES)).toBe("image/png");
    expect(detectImageMediaType(JPEG_BYTES)).toBe("image/jpeg");
    await expect(resolvePptxImageResource(
      {
        type: "data",
        mediaType: "image/png",
        dataBase64: PNG_BYTES.toString("base64"),
      },
      LIMITS,
      new AbortController().signal,
    )).resolves.toMatchObject({
      mediaType: "image/png",
      byteSize: PNG_BYTES.byteLength,
      safeSourceSummary: {
        sourceType: "data",
        mediaType: "image/png",
        byteSize: PNG_BYTES.byteLength,
        redirectCount: 0,
        sha256: expect.any(String),
      },
    });
    expect(() => canonicalizePptxImageUrl("http://example.com/logo.png")).toThrow(
      expect.objectContaining({ detailCode: "resource_url_scheme" }),
    );
    expect(() => canonicalizePptxImageUrl("https://example.com/a%2Fb.png")).toThrow(
      expect.objectContaining({ detailCode: "resource_url_path" }),
    );
  });
});
