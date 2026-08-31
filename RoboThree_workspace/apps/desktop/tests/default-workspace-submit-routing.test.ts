import { describe, expect, it, vi } from "vitest";

import { DesktopIpcRouter } from "../src/main/desktop-ipc-router.js";
import { DesktopV1Alpha4IpcRouter } from "../src/main/desktop-v1alpha4-ipc-router.js";
import { DesktopV1Alpha5IpcRouter } from "../src/main/desktop-v1alpha5-ipc-router.js";
import {
  DESKTOP_IPC_CHANNELS,
  DESKTOP_V1ALPHA4_IPC_CHANNELS,
  DESKTOP_V1ALPHA5_IPC_CHANNELS,
} from "../src/shared/foundation-api.js";

const clientInstanceId = "11111111-1111-4111-8111-111111111111";
const correlationId = "22222222-2222-4222-8222-222222222222";
const workspaceGrantId = "workspace.default";

describe("default workspace submit routing", () => {
  it("adds the default grant to v1alpha1 and preserves an explicit grant", async () => {
    const submitTurn = vi.fn(async () => ({ ok: true as const, value: {} }));
    const ensureDefaultWorkspaceGrant = vi.fn(async () => workspaceGrantId);
    const router = new DesktopIpcRouter({
      core: { client: { submitTurn } as never },
      chooseWorkspaceDirectory: async () => undefined,
      ensureDefaultWorkspaceGrant,
    });
    const base = {
      contractVersion: "v1alpha1" as const,
      type: "submit_turn" as const,
      commandId: "33333333-3333-4333-8333-333333333333",
      correlationId,
      clientInstanceId,
      clientTurnId: "default-workspace-turn",
      sessionId: "session.default",
      userInput: "创建 PPT",
      selectionRequest: {
        agentId: "agent.general",
        selectedSkillIds: [],
        selectedKnowledgeIds: [],
      },
    };
    await router.dispatch(DESKTOP_IPC_CHANNELS.submitTurn, base);
    expect(submitTurn).toHaveBeenLastCalledWith(expect.objectContaining({
      selectionRequest: expect.objectContaining({ workspaceGrantId }),
    }));

    await router.dispatch(DESKTOP_IPC_CHANNELS.submitTurn, {
      ...base,
      commandId: "44444444-4444-4444-8444-444444444444",
      clientTurnId: "explicit-workspace-turn",
      selectionRequest: {
        ...base.selectionRequest,
        workspaceGrantId: "workspace.user-selected",
      },
    });
    expect(submitTurn).toHaveBeenLastCalledWith(expect.objectContaining({
      selectionRequest: expect.objectContaining({
        workspaceGrantId: "workspace.user-selected",
      }),
    }));
    expect(ensureDefaultWorkspaceGrant).toHaveBeenCalledTimes(1);
  });

  it("adds the default grant to v1alpha4 and preserves an explicit grant", async () => {
    const submitTurnV1Alpha4 = vi.fn(async () => ({ ok: true as const, value: {} }));
    const ensureDefaultWorkspaceGrant = vi.fn(async () => workspaceGrantId);
    const router = new DesktopV1Alpha4IpcRouter({
      resolveConnection: () => ({ client: { submitTurnV1Alpha4 } } as never),
      isCurrentConnection: () => true,
      ensureDefaultWorkspaceGrant,
    });
    const base = v1alpha4Command();
    await router.dispatch(DESKTOP_V1ALPHA4_IPC_CHANNELS.submitTurn, base);
    expect(submitTurnV1Alpha4).toHaveBeenLastCalledWith(expect.objectContaining({
      selectionRequest: expect.objectContaining({ workspaceGrantId }),
    }));
    await router.dispatch(DESKTOP_V1ALPHA4_IPC_CHANNELS.submitTurn, {
      ...base,
      commandId: "44444444-4444-4444-8444-444444444444",
      clientTurnId: "explicit-workspace-turn",
      selectionRequest: {
        ...base.selectionRequest,
        workspaceGrantId: "workspace.user-selected",
      },
    });
    expect(submitTurnV1Alpha4).toHaveBeenLastCalledWith(expect.objectContaining({
      selectionRequest: expect.objectContaining({
        workspaceGrantId: "workspace.user-selected",
      }),
    }));
    expect(ensureDefaultWorkspaceGrant).toHaveBeenCalledTimes(1);
  });

  it("adds the default grant to negotiated v1alpha5 and preserves an explicit grant", async () => {
    const compatibilityV1Alpha5 = vi.fn(async () => ({
      ok: true as const,
      value: {
        contractVersion: "v1alpha5" as const,
        coreVersion: "test",
        selectedContractVersion: "v1alpha5" as const,
        runtimeInstanceId: "runtime.one",
        transportClientInstanceId: "55555555-5555-4555-8555-555555555555",
        features: [{
          feature: "max_reasoning_mode_core" as const,
          state: "unavailable" as const,
          reasonCode: "production_gate_disabled" as const,
        }],
      },
    }));
    const submitTurnV1Alpha5 = vi.fn(async () => ({ ok: true as const, value: {} }));
    const ensureDefaultWorkspaceGrant = vi.fn(async () => workspaceGrantId);
    const router = new DesktopV1Alpha5IpcRouter({
      resolveConnection: () => ({
        client: { compatibilityV1Alpha5, submitTurnV1Alpha5 },
        runtimeInstanceId: "runtime.one",
        transportClientInstanceId: "66666666-6666-4666-8666-666666666666",
      } as never),
      isCurrentConnection: () => true,
      ensureDefaultWorkspaceGrant,
    });
    await router.dispatch(DESKTOP_V1ALPHA5_IPC_CHANNELS.compatibility, {
      contractVersion: "v1alpha5",
      queryId: "77777777-7777-4777-8777-777777777777",
      correlationId,
      clientInstanceId,
      supportedContractVersions: ["v1alpha5"],
    });
    const base = v1alpha5Command();
    await router.dispatch(DESKTOP_V1ALPHA5_IPC_CHANNELS.submitTurn, base);
    expect(submitTurnV1Alpha5).toHaveBeenLastCalledWith(expect.objectContaining({
      selectionRequest: expect.objectContaining({ workspaceGrantId }),
    }));
    await router.dispatch(DESKTOP_V1ALPHA5_IPC_CHANNELS.submitTurn, {
      ...base,
      commandId: "44444444-4444-4444-8444-444444444444",
      clientTurnId: "explicit-workspace-turn",
      selectionRequest: {
        ...base.selectionRequest,
        workspaceGrantId: "workspace.user-selected",
      },
    });
    expect(submitTurnV1Alpha5).toHaveBeenLastCalledWith(expect.objectContaining({
      selectionRequest: expect.objectContaining({
        workspaceGrantId: "workspace.user-selected",
      }),
    }));
    expect(ensureDefaultWorkspaceGrant).toHaveBeenCalledTimes(1);
  });
});

function v1alpha4Command() {
  return {
    contractVersion: "v1alpha4" as const,
    type: "submit_turn" as const,
    commandId: "33333333-3333-4333-8333-333333333333",
    correlationId,
    clientInstanceId,
    clientTurnId: "default-workspace-turn",
    sessionId: "session.default",
    userInput: "创建 PPT",
    selectionRequest: {
      agentId: "agent.general",
      selectedSkillIds: [],
      selectedKnowledgeIds: [],
      authorizationPreference: { schemaVersion: "v1alpha1" as const, requestedMode: "task_scoped" as const },
      reasoningPreference: { requestedMode: "default" as const },
    },
  };
}

function v1alpha5Command() {
  return {
    ...v1alpha4Command(),
    contractVersion: "v1alpha5" as const,
  };
}
