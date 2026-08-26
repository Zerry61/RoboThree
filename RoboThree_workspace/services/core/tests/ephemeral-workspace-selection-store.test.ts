import { describe, expect, it } from "vitest";

import {
  EphemeralWorkspaceSelectionStore,
  FakeClock,
  FakeIdGenerator,
} from "../src/index.js";

const firstHandle = "019f9300-0000-7000-8000-000000000001";
const secondHandle = "019f9300-0000-7000-8000-000000000002";
const context = {
  clientInstanceId: "019f9300-0000-7000-8000-000000000010",
  correlationId: "019f9300-0000-7000-8000-000000000011",
};

describe("DCF-1.2A EphemeralWorkspaceSelectionStore", () => {
  it("binds a handle to one request and deletes it after successful resolve", async () => {
    const store = new EphemeralWorkspaceSelectionStore({
      clock: new FakeClock("2026-07-26T17:00:00.000Z"),
      ids: new FakeIdGenerator([firstHandle]),
    });
    const handle = store.issue({
      ...context,
      selectedPath: "/private/tmp/workspace",
    });
    await expect(store.resolve(handle, {
      ...context,
      correlationId: "019f9300-0000-7000-8000-000000000012",
    })).rejects.toMatchObject({
      code: "workspace.selection_context_mismatch",
    });
    await expect(store.resolve(handle, context))
      .resolves.toBe("/private/tmp/workspace");
    await expect(store.resolve(handle, context)).rejects.toMatchObject({
      code: "workspace.selection_not_found",
    });
  });

  it("expires at the exact deadline and never accepts more than 30 seconds", async () => {
    const clock = new FakeClock("2026-07-26T17:00:00.000Z");
    const store = new EphemeralWorkspaceSelectionStore({
      clock,
      ids: new FakeIdGenerator([firstHandle, secondHandle]),
    });
    const short = store.issue({
      ...context,
      selectedPath: "/private/tmp/short",
      ttlMs: 5,
    });
    clock.set("2026-07-26T17:00:00.005Z");
    await expect(store.resolve(short, context)).rejects.toMatchObject({
      code: "workspace.selection_expired",
    });

    const bounded = store.issue({
      ...context,
      selectedPath: "/private/tmp/bounded",
      ttlMs: 90_000,
    });
    clock.set("2026-07-26T17:00:30.005Z");
    await expect(store.resolve(bounded, context)).rejects.toMatchObject({
      code: "workspace.selection_expired",
    });
  });

  it("invalidates all handles on clear, which models Core restart", async () => {
    const store = new EphemeralWorkspaceSelectionStore({
      clock: new FakeClock("2026-07-26T17:00:00.000Z"),
      ids: new FakeIdGenerator([firstHandle]),
    });
    const handle = store.issue({
      ...context,
      selectedPath: "/private/tmp/workspace",
    });
    store.clear();
    await expect(store.resolve(handle, context)).rejects.toMatchObject({
      code: "workspace.selection_not_found",
    });
  });

  it("deletes a cancelled handle and treats repeated discard as a no-op", async () => {
    const store = new EphemeralWorkspaceSelectionStore({
      clock: new FakeClock("2026-07-26T17:00:00.000Z"),
      ids: new FakeIdGenerator([firstHandle]),
    });
    const handle = store.issue({
      ...context,
      selectedPath: "/private/tmp/workspace",
    });
    store.discard(handle);
    store.discard(handle);
    await expect(store.resolve(handle, context)).rejects.toMatchObject({
      code: "workspace.selection_not_found",
    });
  });
});
