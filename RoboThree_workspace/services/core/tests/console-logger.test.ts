import { afterEach, describe, expect, it, vi } from "vitest";

import { ConsoleLogger } from "../src/index.js";

describe("ConsoleLogger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("redacts sensitive structured attributes", () => {
    const output = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const logger = new ConsoleLogger();

    logger.write({
      level: "info",
      event: "provider.configured",
      message: "Provider configured",
      attributes: {
        apiKey: "secret-value",
        providerId: "fake",
        nested: { authorization: "nested-secret" },
      },
    });

    expect(output).toHaveBeenCalledOnce();
    expect(output.mock.calls[0]?.[0]).toContain('"apiKey":"[REDACTED]"');
    expect(output.mock.calls[0]?.[0]).toContain('"authorization":"[REDACTED]"');
    expect(output.mock.calls[0]?.[0]).not.toContain("secret-value");
    expect(output.mock.calls[0]?.[0]).not.toContain("nested-secret");
  });
});
