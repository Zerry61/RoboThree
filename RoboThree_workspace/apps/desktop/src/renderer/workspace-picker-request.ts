import type {
  WorkspaceAccessMode,
} from "@robothree/contracts";

import type {
  CreateWorkspaceGrantFromPickerRequest,
} from "../shared/foundation-api.js";

export function createWorkspacePickerRequest(input: {
  contractVersion: "v1alpha1";
  commandId: string;
  correlationId: string;
  clientInstanceId: string;
  displayName: string;
  accessMode: WorkspaceAccessMode;
}): CreateWorkspaceGrantFromPickerRequest {
  return {
    commandId: input.commandId,
    correlationId: input.correlationId,
    clientInstanceId: input.clientInstanceId,
    displayName: input.displayName,
    accessMode: input.accessMode,
  };
}
