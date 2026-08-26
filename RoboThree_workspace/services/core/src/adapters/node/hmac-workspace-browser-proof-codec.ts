import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import {
  WorkspaceBrowserPortError,
  type WorkspaceBrowserProofCodec,
  type WorkspaceCursorProof,
  type WorkspaceEntryProof,
  type WorkspaceRevealAuthorityProof,
} from "../../ports/workspace-browser.js";

export class HmacWorkspaceBrowserProofCodec implements WorkspaceBrowserProofCodec {
  readonly #key: Buffer;

  constructor(key: Uint8Array = randomBytes(32)) {
    if (key.byteLength < 32) throw new Error("workspace proof key must be at least 256 bits");
    this.#key = Buffer.from(key);
  }

  sealEntry(proof: WorkspaceEntryProof): string {
    return this.#seal("wse1", proof);
  }

  openEntry(token: string): WorkspaceEntryProof {
    const value = this.#open("wse1", token);
    if (value.kind !== "entry") throw invalidProof();
    return value as WorkspaceEntryProof;
  }

  sealCursor(proof: WorkspaceCursorProof): string {
    return this.#seal("wsc1", proof);
  }

  openCursor(token: string): WorkspaceCursorProof {
    const value = this.#open("wsc1", token);
    if (value.kind !== "cursor") throw invalidProof();
    return value as WorkspaceCursorProof;
  }

  sealRevealAuthority(proof: WorkspaceRevealAuthorityProof): string {
    return this.#seal("wra1", proof);
  }

  openRevealAuthority(token: string): WorkspaceRevealAuthorityProof {
    const value = this.#open("wra1", token);
    if (value.kind !== "reveal_authority") throw invalidProof();
    return value as WorkspaceRevealAuthorityProof;
  }

  #seal(prefix: "wse1" | "wsc1" | "wra1", proof: object): string {
    const payload = Buffer.from(JSON.stringify(proof), "utf8").toString("base64url");
    const signature = createHmac("sha256", this.#key)
      .update(`${prefix}.${payload}`, "utf8")
      .digest("base64url");
    return `${prefix}.${payload}.${signature}`;
  }

  #open(prefix: "wse1" | "wsc1" | "wra1", token: string): Record<string, unknown> {
    try {
      const parts = token.split(".");
      if (parts.length !== 3 || parts[0] !== prefix) throw invalidProof();
      const expected = createHmac("sha256", this.#key)
        .update(`${prefix}.${parts[1]}`, "utf8")
        .digest();
      const received = Buffer.from(parts[2]!, "base64url");
      if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
        throw invalidProof();
      }
      const parsed = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8"));
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw invalidProof();
      }
      return parsed as Record<string, unknown>;
    } catch (error) {
      if (error instanceof WorkspaceBrowserPortError) throw error;
      throw invalidProof();
    }
  }
}

function invalidProof(): WorkspaceBrowserPortError {
  return new WorkspaceBrowserPortError(
    "workspace.browser_invalid_proof",
    "workspace browser proof is invalid or belongs to another runtime",
  );
}
