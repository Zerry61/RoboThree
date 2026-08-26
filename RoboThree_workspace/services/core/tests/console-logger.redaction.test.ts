// Independent QA repro test — added by Claude Code during 0.0.0-kaf.0.1 verification.
// Goal: confirm ConsoleLogger handles array and circular Secret paths that the original
// test does not exercise (item 5 of DEVELOPMENT-LOG "独立 QA 建议范围").
// First-round acceptance test only — no production code changed.

import { afterEach, describe, expect, it, vi } from "vitest";

import { ConsoleLogger } from "../src/index.js";

describe("ConsoleLogger — array and circular redaction (independent QA)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("redacts sensitive keys inside arrays (key name is non-sensitive)", () => {
    const output = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const logger = new ConsoleLogger();

    logger.write({
      level: "info",
      event: "provider.batch",
      message: "Batch configured",
      attributes: {
        providerId: "fake",
        // array key is intentionally NOT sensitive-named; only inner keys are sensitive
        users: [
          { username: "alice", password: "p1" },
          { username: "bob", token: "t2" },
        ],
      },
    });

    const text = String(output.mock.calls[0]?.[0] ?? "");
    expect(text).toContain('"password":"[REDACTED]"');
    expect(text).toContain('"token":"[REDACTED]"');
    expect(text).not.toContain("p1");
    expect(text).not.toContain("t2");
    expect(text).toContain('"username":"alice"');
    expect(text).toContain('"username":"bob"');
  });

  it("over-redacts entire value when array key itself matches sensitive pattern", () => {
    // Defensive design: when the array's parent key matches the sensitive-key
    // pattern (e.g. "credentials"), the whole value is replaced with [REDACTED]
    // rather than recursing. This is fail-safe and acceptable for KAF-0.
    const output = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const logger = new ConsoleLogger();

    logger.write({
      level: "info",
      event: "provider.creds",
      message: "Credentials batch",
      attributes: {
        credentials: [
          { username: "alice", password: "p1" },
        ],
      },
    });

    const text = String(output.mock.calls[0]?.[0] ?? "");
    expect(text).toContain('"credentials":"[REDACTED]"');
    expect(text).not.toContain("alice");
    expect(text).not.toContain("p1");
  });

  it("redacts sensitive keys inside deeply nested arrays", () => {
    const output = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const logger = new ConsoleLogger();

    logger.write({
      level: "info",
      event: "provider.deep",
      message: "Deep nested",
      attributes: {
        outer: {
          inner: {
            list: [
              { id: 1, apiKey: "k1" },
              { id: 2, secret: "s2" },
            ],
          },
        },
      },
    });

    const text = String(output.mock.calls[0]?.[0] ?? "");
    expect(text).toContain('"apiKey":"[REDACTED]"');
    expect(text).toContain('"secret":"[REDACTED]"');
    expect(text).not.toContain("k1");
    expect(text).not.toContain("s2");
    expect(text).toContain('"id":1');
    expect(text).toContain('"id":2');
  });

  it("does not crash on circular references and still redacts top-level sensitive keys", () => {
    const output = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const logger = new ConsoleLogger();

    const attributes: Record<string, unknown> = {
      apiKey: "top-secret",
      providerId: "fake",
    };
    attributes.self = attributes; // circular

    expect(() => logger.write({ level: "info", event: "circular.test", message: "x", attributes })).not.toThrow();

    const text = String(output.mock.calls[0]?.[0] ?? "");
    expect(text).toContain('"apiKey":"[REDACTED]"');
    expect(text).not.toContain("top-secret");
    expect(text).toContain("[CIRCULAR]");
  });
});