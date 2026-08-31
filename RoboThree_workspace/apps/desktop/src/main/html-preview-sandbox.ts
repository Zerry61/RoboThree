import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, normalize, relative, sep } from "node:path";

import {
  ArtifactHtmlPreviewProjectionSchema,
  ArtifactPreviewCloseReceiptSchema,
  type ArtifactHtmlPreviewProjection,
  type ArtifactPreviewCloseReceipt,
} from "@robothree/contracts";

const DEFAULT_TTL_MS = 5 * 60 * 1_000;
const MAX_HTML_BYTES = 256 * 1024;
const CSP = [
  "default-src 'none'",
  "script-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors file:",
  "connect-src 'none'",
  "img-src 'none'",
  "media-src 'none'",
  "font-src 'none'",
  "style-src 'none'",
].join("; ");

export type HtmlPreviewSandboxSnapshot = Readonly<{
  activeSessionCount: number;
  activeServerCount: number;
  activeTimerCount: number;
  cleanupCount: number;
  deniedRequestCount: number;
}>;

type HtmlPreviewSandboxSession = Readonly<{
  artifactId: string;
  previewSessionId: string;
  token: string;
  rootRealPath: string;
  indexPath: string;
  server: Server;
  port: number;
  expiresAt: string;
  timer: NodeJS.Timeout;
}>;

export class HtmlPreviewSandbox {
  readonly #sessions = new Map<string, HtmlPreviewSandboxSession>();
  #cleanupCount = 0;
  #deniedRequestCount = 0;

  async start(input: {
    artifactId: string;
    html: string;
    ttlMs?: number;
  }): Promise<ArtifactHtmlPreviewProjection> {
    const bytes = new TextEncoder().encode(input.html);
    if (bytes.byteLength > MAX_HTML_BYTES) {
      throw new Error("HTML preview document exceeds sandbox budget");
    }
    const previewSessionId = `preview:${randomUUID()}`;
    const token = randomUUID();
    const directory = await mkdtemp(join(tmpdir(), "robothree-apv1c-"));
    const rootRealPath = await realpath(directory);
    const indexPath = join(rootRealPath, "index.html");
    await writeFile(indexPath, input.html, { encoding: "utf8", flag: "wx" });
    const server = createServer((request, response) => {
      void this.#serve(previewSessionId, request, response);
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        server.off("error", reject);
        resolve();
      });
    });
    const address = server.address();
    if (address === null || typeof address === "string") {
      await closeServer(server);
      await rm(rootRealPath, { force: true, recursive: true });
      throw new Error("HTML preview server did not bind a TCP port");
    }
    const ttlMs = input.ttlMs ?? DEFAULT_TTL_MS;
    const expiresAt = new Date(Date.now() + ttlMs).toISOString();
    const timer = setTimeout(() => {
      void this.close(previewSessionId);
    }, ttlMs);
    const session: HtmlPreviewSandboxSession = {
      artifactId: input.artifactId,
      previewSessionId,
      token,
      rootRealPath,
      indexPath,
      server,
      port: address.port,
      expiresAt,
      timer,
    };
    this.#sessions.set(previewSessionId, session);
    return ArtifactHtmlPreviewProjectionSchema.parse({
      artifactId: input.artifactId,
      previewSessionId,
      localOrigin: "http://127.0.0.1",
      previewUrl: `http://127.0.0.1:${address.port}/${previewSessionId}/${token}/index.html`,
      csp: CSP,
      expiresAt,
      warnings: [],
    });
  }

  async close(
    previewSessionId: string,
    commandId: string = randomUUID(),
  ): Promise<ArtifactPreviewCloseReceipt> {
    const session = this.#sessions.get(previewSessionId);
    if (session !== undefined) {
      this.#sessions.delete(previewSessionId);
      clearTimeout(session.timer);
      await closeServer(session.server);
      await rm(session.rootRealPath, { force: true, recursive: true });
      this.#cleanupCount += 1;
    }
    return ArtifactPreviewCloseReceiptSchema.parse({
      commandId,
      previewSessionId,
      closed: session !== undefined,
    });
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.#sessions.keys()].map((id) => this.close(id)));
  }

  snapshot(): HtmlPreviewSandboxSnapshot {
    return Object.freeze({
      activeSessionCount: this.#sessions.size,
      activeServerCount: this.#sessions.size,
      activeTimerCount: this.#sessions.size,
      cleanupCount: this.#cleanupCount,
      deniedRequestCount: this.#deniedRequestCount,
    });
  }

  async #serve(
    previewSessionId: string,
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const session = this.#sessions.get(previewSessionId);
    if (session === undefined) {
      this.#deny(response, 404);
      return;
    }
    try {
      if (request.method !== "GET" && request.method !== "HEAD") {
        this.#deny(response, 405);
        return;
      }
      if (request.headers.host !== `127.0.0.1:${session.port}`) {
        this.#deny(response, 403);
        return;
      }
      const url = new URL(request.url ?? "/", `http://127.0.0.1:${session.port}`);
      const segments = url.pathname.split("/").filter((part) => part.length > 0);
      if (
        segments.length !== 3
        || segments[0] !== session.previewSessionId
        || segments[1] !== session.token
        || segments[2] !== "index.html"
      ) {
        this.#deny(response, 404);
        return;
      }
      if (segments.some((part) => part.startsWith(".") || part.includes("\0"))) {
        this.#deny(response, 404);
        return;
      }
      const candidate = await realpath(join(session.rootRealPath, segments[2]));
      if (!isContained(session.rootRealPath, candidate) || basename(candidate) !== "index.html") {
        this.#deny(response, 404);
        return;
      }
      const info = await stat(candidate);
      if (!info.isFile() || info.size > MAX_HTML_BYTES) {
        this.#deny(response, 404);
        return;
      }
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": CSP,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
        "Cross-Origin-Resource-Policy": "same-origin",
      });
      if (request.method === "HEAD") {
        response.end();
        return;
      }
      response.end(await readFile(candidate, "utf8"));
    } catch {
      this.#deny(response, 404);
    }
  }

  #deny(response: ServerResponse, status: number): void {
    this.#deniedRequestCount += 1;
    response.writeHead(status, {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Security-Policy": CSP,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    });
    response.end("blocked");
  }
}

export function htmlPreviewDocumentFromText(input: {
  title: string;
  content: string;
}): string {
  return [
    "<!doctype html>",
    "<html>",
    "<head>",
    "<meta charset=\"utf-8\">",
    `<meta http-equiv="Content-Security-Policy" content="${escapeAttribute(CSP)}">`,
    `<title>${escapeHtml(input.title)}</title>`,
    "</head>",
    "<body>",
    "<main>",
    `<h1>${escapeHtml(input.title)}</h1>`,
    `<pre>${escapeHtml(input.content)}</pre>`,
    "</main>",
    "</body>",
    "</html>",
  ].join("");
}

function isContained(rootRealPath: string, candidateRealPath: string): boolean {
  const normalizedRoot = normalize(rootRealPath);
  const normalizedCandidate = normalize(candidateRealPath);
  const rel = relative(normalizedRoot, normalizedCandidate);
  return rel.length === 0 || (!rel.startsWith("..") && !rel.includes(`..${sep}`) && !rel.startsWith(sep));
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;");
}

function escapeAttribute(input: string): string {
  return escapeHtml(input).replace(/"/gu, "&quot;");
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error === undefined ? resolve() : reject(error));
    server.closeAllConnections();
  });
}
