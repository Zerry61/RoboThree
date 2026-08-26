import { describe, it, expect } from "vitest";
import {
  NdjsonFrameDecoder,
  NdjsonFrameError,
} from "../../src/protocol/ndjson-frame-decoder.js";

describe("NdjsonFrameDecoder", () => {
  const MAX = 1024;

  it("decodes a single complete frame", () => {
    const d = new NdjsonFrameDecoder(MAX);
    const frames = d.push(Buffer.from('{"a":1}\n'));
    expect(frames).toHaveLength(1);
    expect(JSON.parse(frames[0]!)).toEqual({ a: 1 });
    d.finish(); // no throw
  });

  it("decodes multiple frames in one chunk", () => {
    const d = new NdjsonFrameDecoder(MAX);
    const frames = d.push(Buffer.from('{"a":1}\n{"b":2}\n'));
    expect(frames).toHaveLength(2);
    expect(JSON.parse(frames[0]!)).toEqual({ a: 1 });
    expect(JSON.parse(frames[1]!)).toEqual({ b: 2 });
  });

  it("handles split frames across chunks", () => {
    const d = new NdjsonFrameDecoder(MAX);
    const f1 = d.push(Buffer.from('{"a":'));
    expect(f1).toHaveLength(0);
    const f2 = d.push(Buffer.from('1}\n{"b":2}\n'));
    expect(f2).toHaveLength(2);
    expect(JSON.parse(f2[0]!)).toEqual({ a: 1 });
    expect(JSON.parse(f2[1]!)).toEqual({ b: 2 });
  });

  it("skips empty frames (bare newline)", () => {
    const d = new NdjsonFrameDecoder(MAX);
    const frames = d.push(Buffer.from('\n{"a":1}\n\n'));
    expect(frames).toHaveLength(1);
    expect(JSON.parse(frames[0]!)).toEqual({ a: 1 });
  });

  it("rejects frame exceeding max size", () => {
    const d = new NdjsonFrameDecoder(10);
    expect(() => d.push(Buffer.from("x".repeat(11) + "\n"))).toThrow(
      NdjsonFrameError,
    );
    expect(() => d.push(Buffer.from("x".repeat(11) + "\n"))).toThrow(
      "frame exceeds",
    );
  });

  it("rejects buffered incomplete frame exceeding max size", () => {
    const d = new NdjsonFrameDecoder(5);
    // Push 6 bytes without a newline
    expect(() => d.push(Buffer.from("abcdef"))).toThrow(NdjsonFrameError);
    expect(() => d.push(Buffer.from("abcdef"))).toThrow("Incomplete NDJSON frame exceeds");
  });

  it("throws on finish with incomplete data", () => {
    const d = new NdjsonFrameDecoder(MAX);
    d.push(Buffer.from('{"unfinished":'));
    expect(() => d.finish()).toThrow(NdjsonFrameError);
    expect(() => d.finish()).toThrow("incomplete");
  });

  it("rejects maxFrameBytes <= 0 in constructor", () => {
    expect(() => new NdjsonFrameDecoder(0)).toThrow();
    expect(() => new NdjsonFrameDecoder(-1)).toThrow();
    expect(() => new NdjsonFrameDecoder(1.5)).toThrow();
  });

  it("accepts empty push with no output", () => {
    const d = new NdjsonFrameDecoder(MAX);
    const frames = d.push(Buffer.from(""));
    expect(frames).toHaveLength(0);
    d.finish();
  });

  it("handles control characters in frame content", () => {
    const d = new NdjsonFrameDecoder(MAX);
    // JSON strings escape control chars — this is safe in NDJSON
    const frames = d.push(Buffer.from('{"text":"hello\\nworld"}\n'));
    expect(frames).toHaveLength(1);
    expect(JSON.parse(frames[0]!)).toEqual({ text: "hello\nworld" });
  });

  it("rejects raw newline injection (two frames from one logical message)", () => {
    // This verifies that raw `\n` inside a JSON value would split into
    // two NDJSON frames — the protocol layer must use JSON.stringify
    // which escapes newlines. This test documents the expected behavior.
    const d = new NdjsonFrameDecoder(MAX);
    const frames = d.push(Buffer.from('{"text":"hello\nworld"}\n'));
    // The raw \n splits this into two "frames" — the first is malformed JSON
    expect(frames).toHaveLength(2);
    // First "frame" is {"text":"hello  (malformed — unterminated string)
    expect(() => JSON.parse(frames[0]!)).toThrow();
  });
});
