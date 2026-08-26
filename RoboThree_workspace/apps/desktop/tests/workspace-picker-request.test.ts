import { describe, expect, it } from "vitest";

import {
  createWorkspacePickerRequest,
} from "../src/renderer/workspace-picker-request.js";

describe("Workspace Picker Renderer request", () => {
  it("projects generic command metadata into the exact five-field safe request", () => {
    const request = createWorkspacePickerRequest({
      contractVersion: "v1alpha1",
      commandId: "00000000-0000-4000-8000-000000000001",
      correlationId: "00000000-0000-4000-8000-000000000002",
      clientInstanceId: "00000000-0000-4000-8000-000000000003",
      displayName: "Local Workspace",
      accessMode: "read_write",
    });

    expect(request).toEqual({
      commandId: "00000000-0000-4000-8000-000000000001",
      correlationId: "00000000-0000-4000-8000-000000000002",
      clientInstanceId: "00000000-0000-4000-8000-000000000003",
      displayName: "Local Workspace",
      accessMode: "read_write",
    });
    expect(request).not.toHaveProperty("contractVersion");
    expect(Object.keys(request)).toHaveLength(5);
  });
});
