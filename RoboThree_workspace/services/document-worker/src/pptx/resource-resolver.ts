import { lookup as dnsLookup } from "node:dns/promises";
import https from "node:https";
import { isIP } from "node:net";
import { URL } from "node:url";
import { createHash } from "node:crypto";

import { DocumentCapabilityHandlerError } from "../runtime/document-capability-handler.js";

import type { LookupAddress } from "node:dns";
import type { IncomingHttpHeaders } from "node:http";

export type PptxImageMediaType = "image/png" | "image/jpeg" | "image/webp";

export type PptxImageResourceRef =
  | Readonly<{
      type: "data";
      mediaType: PptxImageMediaType;
      dataBase64: string;
    }>
  | Readonly<{
      type: "url";
      url: string;
    }>;

export type ResolvedPptxImageResource = Readonly<{
  mediaType: PptxImageMediaType;
  bytes: Buffer;
  byteSize: number;
  sha256: string;
  safeSourceSummary: PptxImageSafeSourceSummary;
}>;

export type PptxImageSafeSourceSummary = Readonly<{
  sourceType: "data" | "url";
  host?: string;
  mediaType: PptxImageMediaType;
  byteSize: number;
  sha256: string;
  redirectCount: number;
}>;

export type PptxResourceResolverLimits = Readonly<{
  maxImageBytes: number;
  resolveTimeoutMs: number;
  maxRedirects: number;
}>;

export type PptxResourceFetchResult = Readonly<{
  statusCode: number;
  headers: IncomingHttpHeaders;
  bytes: Buffer;
  remoteAddress: string | null;
}>;

export type PptxResourceResolverDependencies = Readonly<{
  lookup: (hostname: string) => Promise<readonly LookupAddress[]>;
  fetchPinned: (
    request: PinnedHttpsRequest,
    signal: AbortSignal,
  ) => Promise<PptxResourceFetchResult>;
}>;

export type PinnedHttpsRequest = Readonly<{
  url: string;
  hostname: string;
  hostHeader: string;
  port: number;
  path: string;
  resolvedIp: string;
  timeoutMs: number;
  maxBytes: number;
}>;

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const WEBP_RIFF_MAGIC = Buffer.from("RIFF", "ascii");
const WEBP_TYPE_MAGIC = Buffer.from("WEBP", "ascii");
const URL_MAX_BYTES = 2048;

export async function resolvePptxImageResource(
  source: PptxImageResourceRef,
  limits: PptxResourceResolverLimits,
  signal: AbortSignal,
  dependencies: Partial<PptxResourceResolverDependencies> = {},
): Promise<ResolvedPptxImageResource> {
  throwIfAborted(signal);
  if (source.type === "data") {
    const bytes = decodeBase64Image(source.dataBase64, limits.maxImageBytes);
    const measured = detectImageMediaType(bytes);
    if (measured !== source.mediaType) {
      throw resolverError(
        "unsupported_feature",
        "Image media type does not match declared type",
        "resource_magic_mismatch",
      );
    }
    return resolvedImage(source.mediaType, bytes, {
      redirectCount: 0,
      sourceType: "data",
    });
  }

  return resolveUrlImageResource(source.url, limits, signal, dependencies);
}

export function canonicalizePptxImageUrl(url: string): URL {
  if (Buffer.byteLength(url, "utf8") > URL_MAX_BYTES) {
    throw resolverError("limit_exceeded", "Image URL exceeds limit", "resource_url_too_large");
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw resolverError("invalid_format", "Invalid image URL", "resource_url_invalid");
  }

  if (parsed.protocol !== "https:") {
    throw resolverError("unsupported_feature", "Only HTTPS image URLs are supported", "resource_url_scheme");
  }
  if (parsed.username !== "" || parsed.password !== "") {
    throw resolverError("invalid_format", "Image URL credentials are not allowed", "resource_url_userinfo");
  }
  if (parsed.hash !== "") {
    throw resolverError("invalid_format", "Image URL fragments are not allowed", "resource_url_fragment");
  }
  if (parsed.hostname.length === 0 || parsed.hostname.endsWith(".")) {
    throw resolverError("invalid_format", "Invalid image URL host", "resource_url_host");
  }
  if (/%(?:2f|5c|00)/i.test(parsed.pathname + parsed.search)) {
    throw resolverError("invalid_format", "Image URL path contains unsafe escapes", "resource_url_path");
  }
  return parsed;
}

export function validateResolvedResourceIp(address: string): void {
  if (isPrivateOrSpecialIp(address)) {
    throw resolverError("unsupported_feature", "Image URL resolves to a blocked address", "resource_ip_blocked");
  }
}

export function detectImageMediaType(bytes: Buffer): PptxImageMediaType {
  if (bytes.length >= PNG_MAGIC.length && bytes.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
    return "image/png";
  }
  if (bytes.length >= JPEG_MAGIC.length && bytes.subarray(0, JPEG_MAGIC.length).equals(JPEG_MAGIC)) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).equals(WEBP_RIFF_MAGIC) &&
    bytes.subarray(8, 12).equals(WEBP_TYPE_MAGIC)
  ) {
    return "image/webp";
  }
  throw resolverError("unsupported_feature", "Unsupported image binary type", "resource_magic_unsupported");
}

export function normalizeImageContentType(
  value: string | readonly string[] | undefined,
): PptxImageMediaType {
  const raw = Array.isArray(value) ? value[0] : value;
  const mediaType = raw?.split(";")[0]?.trim().toLowerCase();
  if (mediaType === "image/png" || mediaType === "image/jpeg" || mediaType === "image/webp") {
    return mediaType;
  }
  if (mediaType === "image/jpg") {
    return "image/jpeg";
  }
  throw resolverError(
    "unsupported_feature",
    "Unsupported image content type",
    "resource_content_type_unsupported",
  );
}

function decodeBase64Image(dataBase64: string, maxBytes: number): Buffer {
  if (dataBase64.length === 0 || dataBase64.length > Math.ceil(maxBytes * 4 / 3) + 8) {
    throw resolverError("limit_exceeded", "Image data exceeds limit", "resource_too_large");
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(dataBase64) || dataBase64.length % 4 !== 0) {
    throw resolverError("invalid_format", "Invalid base64 image data", "resource_data_invalid");
  }
  const bytes = Buffer.from(dataBase64, "base64");
  if (bytes.byteLength === 0 || bytes.byteLength > maxBytes) {
    throw resolverError("limit_exceeded", "Image data exceeds limit", "resource_too_large");
  }
  return bytes;
}

async function resolveUrlImageResource(
  url: string,
  limits: PptxResourceResolverLimits,
  signal: AbortSignal,
  dependencies: Partial<PptxResourceResolverDependencies>,
  redirectCount = 0,
): Promise<ResolvedPptxImageResource> {
  if (redirectCount > limits.maxRedirects) {
    throw resolverError("unsupported_feature", "Image URL redirected too many times", "resource_redirect_limit");
  }
  throwIfAborted(signal);

  const parsed = canonicalizePptxImageUrl(url);
  const lookup = dependencies.lookup ?? defaultLookup;
  const fetchPinned = dependencies.fetchPinned ?? defaultFetchPinned;
  const resolvedIp = await selectValidatedIp(parsed.hostname, lookup);
  const request = {
    url: parsed.href,
    hostname: parsed.hostname.toLowerCase(),
    hostHeader: hostHeader(parsed),
    port: Number(parsed.port || "443"),
    path: `${parsed.pathname}${parsed.search}`,
    resolvedIp,
    timeoutMs: limits.resolveTimeoutMs,
    maxBytes: limits.maxImageBytes,
  };
  const response = await fetchPinned(request, signal);
  if (response.remoteAddress !== resolvedIp) {
    throw resolverError(
      "unsupported_feature",
      "Image URL connection address changed after validation",
      "resource_ip_rebound",
    );
  }

  if (response.statusCode >= 300 && response.statusCode < 400) {
    const location = headerValue(response.headers.location);
    if (location === null) {
      throw resolverError("unsupported_feature", "Image redirect is missing Location", "resource_redirect_invalid");
    }
    const redirected = new URL(location, parsed);
    return resolveUrlImageResource(redirected.href, limits, signal, dependencies, redirectCount + 1);
  }
  if (response.statusCode !== 200) {
    throw resolverError("unsupported_feature", "Image URL did not return a successful response", "resource_http_status");
  }
  if (response.bytes.byteLength === 0 || response.bytes.byteLength > limits.maxImageBytes) {
    throw resolverError("limit_exceeded", "Image response exceeds limit", "resource_too_large");
  }

  const declared = normalizeImageContentType(response.headers["content-type"]);
  const measured = detectImageMediaType(response.bytes);
  if (declared !== measured) {
    throw resolverError(
      "unsupported_feature",
      "Image content type does not match binary data",
      "resource_magic_mismatch",
    );
  }
  return resolvedImage(measured, response.bytes, {
    host: parsed.hostname.toLowerCase(),
    redirectCount,
    sourceType: "url",
  });
}

async function selectValidatedIp(
  hostname: string,
  lookup: PptxResourceResolverDependencies["lookup"],
): Promise<string> {
  const records = await lookup(hostname);
  if (records.length === 0) {
    throw resolverError("unsupported_feature", "Image URL host did not resolve", "resource_dns_empty");
  }
  for (const record of records) {
    try {
      validateResolvedResourceIp(record.address);
      return record.address;
    } catch {
      // Continue through all records so a mixed DNS answer can still use a valid public address.
    }
  }
  throw resolverError("unsupported_feature", "Image URL resolves only to blocked addresses", "resource_ip_blocked");
}

async function defaultLookup(hostname: string): Promise<readonly LookupAddress[]> {
  return dnsLookup(hostname, { all: true, verbatim: true });
}

async function defaultFetchPinned(
  request: PinnedHttpsRequest,
  signal: AbortSignal,
): Promise<PptxResourceFetchResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (error: unknown) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    };
    const req = https.request(
      {
        protocol: "https:",
        hostname: request.resolvedIp,
        port: request.port,
        path: request.path,
        method: "GET",
        servername: request.hostname,
        headers: {
          Host: request.hostHeader,
          Accept: "image/png,image/jpeg,image/webp",
        },
        timeout: request.timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let total = 0;
        res.on("data", (chunk: Buffer) => {
          total += chunk.byteLength;
          if (total > request.maxBytes) {
            req.destroy(resolverError("limit_exceeded", "Image response exceeds limit", "resource_too_large"));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          if (settled) return;
          settled = true;
          resolve({
            statusCode: res.statusCode ?? 0,
            headers: res.headers,
            bytes: Buffer.concat(chunks),
            remoteAddress: res.socket.remoteAddress ?? null,
          });
        });
      },
    );
    req.on("timeout", () => {
      req.destroy(resolverError("timed_out", "Image URL fetch timed out", "resource_timeout"));
    });
    req.on("error", fail);
    signal.addEventListener("abort", () => {
      req.destroy(new DocumentCapabilityHandlerError("cancelled", "Image resolution was cancelled"));
    }, { once: true });
    req.end();
  });
}

function hostHeader(url: URL): string {
  return url.port === "" || url.port === "443"
    ? url.hostname.toLowerCase()
    : `${url.hostname.toLowerCase()}:${url.port}`;
}

function headerValue(value: string | readonly string[] | undefined): string | null {
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === "string" ? first : null;
  }
  return typeof value === "string" ? value : null;
}

function resolvedImage(
  mediaType: PptxImageMediaType,
  bytes: Buffer,
  source: Readonly<{
    host?: string;
    redirectCount: number;
    sourceType: "data" | "url";
  }>,
): ResolvedPptxImageResource {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return {
    mediaType,
    bytes,
    byteSize: bytes.byteLength,
    sha256,
    safeSourceSummary: {
      sourceType: source.sourceType,
      ...(source.host === undefined ? {} : { host: source.host }),
      mediaType,
      byteSize: bytes.byteLength,
      sha256,
      redirectCount: source.redirectCount,
    },
  };
}

function isPrivateOrSpecialIp(address: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped?.[1]) return isPrivateOrSpecialIpv4(mapped[1]);

  if (isIP(address) === 4) return isPrivateOrSpecialIpv4(address);
  if (isIP(address) === 6) return isPrivateOrSpecialIpv6(address);
  return true;
}

function isPrivateOrSpecialIpv4(address: string): boolean {
  const octets = address.split(".").map((part) => Number(part));
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }
  const [a, b, c, d] = octets as [number, number, number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    (a === 169 && b === 254 && c === 169 && d === 254)
  );
}

function isPrivateOrSpecialIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  return (
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized)
  );
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DocumentCapabilityHandlerError("cancelled", "Image resolution was cancelled");
  }
}

function resolverError(
  code: ConstructorParameters<typeof DocumentCapabilityHandlerError>[0],
  message: string,
  detailCode: string,
): DocumentCapabilityHandlerError {
  return new DocumentCapabilityHandlerError(code, message, undefined, detailCode);
}
