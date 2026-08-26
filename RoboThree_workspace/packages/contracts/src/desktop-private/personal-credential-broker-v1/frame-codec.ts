import type { z } from "zod";

import {
  PERSONAL_CREDENTIAL_BROKER_MAX_HEADER_BYTES,
  PERSONAL_CREDENTIAL_BROKER_MAX_SECRET_BYTES,
} from "./protocol.js";

const PREFIX_BYTES = 8;
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });
const utf8Encoder = new TextEncoder();

export class SensitiveFrameError extends Error {
  public constructor(readonly code: string) {
    super(code);
    this.name = "SensitiveFrameError";
  }
}

export type SensitiveFrame<T> = Readonly<{
  header: T;
  body: Uint8Array;
}>;

export function encodeSensitiveFrame(
  header: Readonly<{ secretByteLength: number }>,
  body: Uint8Array,
): Uint8Array {
  if (body.byteLength !== header.secretByteLength) {
    throw new SensitiveFrameError("credential_frame_body_length_mismatch");
  }
  if (body.byteLength > PERSONAL_CREDENTIAL_BROKER_MAX_SECRET_BYTES) {
    throw new SensitiveFrameError("credential_frame_body_too_large");
  }
  const headerBytes = utf8Encoder.encode(JSON.stringify(header));
  if (headerBytes.byteLength === 0
    || headerBytes.byteLength > PERSONAL_CREDENTIAL_BROKER_MAX_HEADER_BYTES) {
    headerBytes.fill(0);
    throw new SensitiveFrameError("credential_frame_header_too_large");
  }
  const output = new Uint8Array(PREFIX_BYTES + headerBytes.byteLength + body.byteLength);
  const view = new DataView(output.buffer, output.byteOffset, output.byteLength);
  view.setUint32(0, headerBytes.byteLength, false);
  output.set(headerBytes, 4);
  view.setUint32(4 + headerBytes.byteLength, body.byteLength, false);
  output.set(body, PREFIX_BYTES + headerBytes.byteLength);
  headerBytes.fill(0);
  return output;
}

export class SensitiveFrameDecoder<T extends Readonly<{ secretByteLength: number }>> {
  readonly #schema: z.ZodType<T>;
  #buffer = new Uint8Array(0);
  #closed = false;

  public constructor(schema: z.ZodType<T>) {
    this.#schema = schema;
  }

  public push(chunk: Uint8Array): readonly SensitiveFrame<T>[] {
    if (this.#closed) throw new SensitiveFrameError("credential_frame_decoder_closed");
    if (chunk.byteLength === 0) return [];
    const combined = new Uint8Array(this.#buffer.byteLength + chunk.byteLength);
    combined.set(this.#buffer, 0);
    combined.set(chunk, this.#buffer.byteLength);
    this.#buffer.fill(0);
    this.#buffer = combined;

    const frames: SensitiveFrame<T>[] = [];
    let offset = 0;
    try {
      while (this.#buffer.byteLength - offset >= 4) {
        const view = new DataView(
          this.#buffer.buffer,
          this.#buffer.byteOffset + offset,
          this.#buffer.byteLength - offset,
        );
        const headerLength = view.getUint32(0, false);
        if (headerLength === 0 || headerLength > PERSONAL_CREDENTIAL_BROKER_MAX_HEADER_BYTES) {
          throw new SensitiveFrameError("credential_frame_header_length_invalid");
        }
        if (this.#buffer.byteLength - offset < 4 + headerLength + 4) break;
        const bodyLength = view.getUint32(4 + headerLength, false);
        if (bodyLength > PERSONAL_CREDENTIAL_BROKER_MAX_SECRET_BYTES) {
          throw new SensitiveFrameError("credential_frame_body_length_invalid");
        }
        const total = PREFIX_BYTES + headerLength + bodyLength;
        if (this.#buffer.byteLength - offset < total) break;
        const headerBytes = Uint8Array.from(
          this.#buffer.subarray(offset + 4, offset + 4 + headerLength),
        );
        const body = Uint8Array.from(
          this.#buffer.subarray(offset + PREFIX_BYTES + headerLength, offset + total),
        );
        try {
          const headerText = utf8Decoder.decode(headerBytes);
          const parsed = parseStrictJsonObject(headerText);
          const header = this.#schema.parse(parsed);
          if (header.secretByteLength !== bodyLength) {
            throw new SensitiveFrameError("credential_frame_body_length_mismatch");
          }
          frames.push(Object.freeze({ header, body }));
        } finally {
          headerBytes.fill(0);
        }
        offset += total;
      }
    } catch (error) {
      for (const frame of frames) frame.body.fill(0);
      this.reset();
      throw error;
    }

    if (offset > 0) {
      const remainder = Uint8Array.from(this.#buffer.subarray(offset));
      this.#buffer.fill(0);
      this.#buffer = remainder;
    }
    const maximum = PREFIX_BYTES
      + PERSONAL_CREDENTIAL_BROKER_MAX_HEADER_BYTES
      + PERSONAL_CREDENTIAL_BROKER_MAX_SECRET_BYTES;
    if (this.#buffer.byteLength > maximum) {
      this.reset();
      throw new SensitiveFrameError("credential_frame_buffer_overflow");
    }
    return frames;
  }

  public finish(): void {
    if (this.#buffer.byteLength !== 0) {
      this.reset();
      throw new SensitiveFrameError("credential_frame_truncated");
    }
    this.#closed = true;
  }

  public reset(): void {
    this.#buffer.fill(0);
    this.#buffer = new Uint8Array(0);
  }
}

export function parseStrictJsonObject(text: string): Record<string, unknown> {
  const scanner = new JsonDuplicateKeyScanner(text);
  scanner.scan();
  const value: unknown = JSON.parse(text);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new SensitiveFrameError("credential_frame_header_not_object");
  }
  return value as Record<string, unknown>;
}

class JsonDuplicateKeyScanner {
  #index = 0;

  public constructor(private readonly source: string) {}

  public scan(): void {
    this.#skipWhitespace();
    this.#value();
    this.#skipWhitespace();
    if (this.#index !== this.source.length) this.#fail();
  }

  #value(): void {
    this.#skipWhitespace();
    const token = this.source[this.#index];
    if (token === "{") this.#object();
    else if (token === "[") this.#array();
    else if (token === '"') void this.#string();
    else if (token === "t") this.#literal("true");
    else if (token === "f") this.#literal("false");
    else if (token === "n") this.#literal("null");
    else this.#number();
  }

  #object(): void {
    this.#index += 1;
    const keys = new Set<string>();
    this.#skipWhitespace();
    if (this.source[this.#index] === "}") {
      this.#index += 1;
      return;
    }
    while (true) {
      this.#skipWhitespace();
      if (this.source[this.#index] !== '"') this.#fail();
      const key = this.#string();
      if (keys.has(key)) {
        throw new SensitiveFrameError("credential_frame_duplicate_json_key");
      }
      keys.add(key);
      this.#skipWhitespace();
      if (this.source[this.#index] !== ":") this.#fail();
      this.#index += 1;
      this.#value();
      this.#skipWhitespace();
      const token = this.source[this.#index];
      if (token === "}") {
        this.#index += 1;
        return;
      }
      if (token !== ",") this.#fail();
      this.#index += 1;
    }
  }

  #array(): void {
    this.#index += 1;
    this.#skipWhitespace();
    if (this.source[this.#index] === "]") {
      this.#index += 1;
      return;
    }
    while (true) {
      this.#value();
      this.#skipWhitespace();
      const token = this.source[this.#index];
      if (token === "]") {
        this.#index += 1;
        return;
      }
      if (token !== ",") this.#fail();
      this.#index += 1;
    }
  }

  #string(): string {
    const start = this.#index;
    this.#index += 1;
    while (this.#index < this.source.length) {
      const token = this.source[this.#index];
      if (token === '"') {
        this.#index += 1;
        try {
          return JSON.parse(this.source.slice(start, this.#index)) as string;
        } catch {
          this.#fail();
        }
      }
      if (token === "\\") {
        this.#index += 1;
        if (this.source[this.#index] === "u") this.#index += 4;
      } else if (token !== undefined && token.charCodeAt(0) <= 0x1f) {
        this.#fail();
      }
      this.#index += 1;
    }
    this.#fail();
  }

  #literal(value: string): void {
    if (this.source.slice(this.#index, this.#index + value.length) !== value) this.#fail();
    this.#index += value.length;
  }

  #number(): void {
    const tail = this.source.slice(this.#index);
    const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/u.exec(tail);
    if (match === null) this.#fail();
    this.#index += match[0].length;
  }

  #skipWhitespace(): void {
    while (/\s/u.test(this.source[this.#index] ?? "")) this.#index += 1;
  }

  #fail(): never {
    throw new SensitiveFrameError("credential_frame_header_json_invalid");
  }
}

