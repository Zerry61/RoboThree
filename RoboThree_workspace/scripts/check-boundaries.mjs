import { access, readdir, readFile } from "node:fs/promises";
import { isBuiltin } from "node:module";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import ts from "typescript";

const defaultWorkspaceRoot = fileURLToPath(new URL("../", import.meta.url));
const sourceExtensions = new Set([".cjs", ".cts", ".js", ".jsx", ".mjs", ".mts", ".ts", ".tsx"]);

const boundaryRules = [
  {
    name: "contracts",
    root: "packages/contracts/src",
    required: true,
  },
  {
    name: "kernel",
    root: "services/core/src/kernel",
    required: true,
  },
];

export function analyzeModuleSource({ boundary, filePath, source, workspaceRoot }) {
  const references = collectModuleReferences(source, filePath);
  const violations = [];

  if (boundary === "contracts") {
    violations.push(...collectForbiddenContractDeclarations(source, filePath, workspaceRoot));
  }

  for (const reference of references) {
    if (reference.specifier === undefined) {
      violations.push(
        formatViolation(filePath, workspaceRoot, reference, `${boundary} dynamic module references must use string literals`),
      );
      continue;
    }

    const reason = boundary === "contracts"
      ? contractsViolationReason(reference.specifier)
      : kernelViolationReason(reference.specifier, filePath, workspaceRoot);

    if (reason !== undefined) {
      violations.push(formatViolation(filePath, workspaceRoot, reference, reason));
    }
  }

  return violations;
}

export async function runBoundaryChecks(workspaceRoot = defaultWorkspaceRoot) {
  const violations = [];

  for (const rule of boundaryRules) {
    const root = join(workspaceRoot, rule.root);
    const exists = await pathExists(root);
    if (!exists) {
      if (rule.required) {
        violations.push(`${rule.root}: required architecture boundary root does not exist`);
      }
      continue;
    }

    const files = await collectSourceFiles(root);
    if (files.length === 0) {
      violations.push(`${rule.root}: architecture boundary root contains no source files`);
      continue;
    }

    for (const filePath of files) {
      const source = await readFile(filePath, "utf8");
      violations.push(...analyzeModuleSource({ boundary: rule.name, filePath, source, workspaceRoot }));
    }
  }

  violations.push(...await collectKaf42Violations(workspaceRoot));
  violations.push(...await collectKaf43Violations(workspaceRoot));
  violations.push(...await collectDcf0Violations(workspaceRoot));
  violations.push(...await collectCgf0Violations(workspaceRoot));
  violations.push(...await collectDcf1ContractViolations(workspaceRoot));
  violations.push(...await collectCgf1ContractViolations(workspaceRoot));
  violations.push(...await collectCgf11aViolations(workspaceRoot));
  violations.push(...await collectCgf12aViolations(workspaceRoot));
  violations.push(...await collectCgf12bViolations(workspaceRoot));
  violations.push(...await collectCgf12cViolations(workspaceRoot));
  violations.push(...await collectCgf13bViolations(workspaceRoot));
  violations.push(...await collectDcf11aViolations(workspaceRoot));
  violations.push(...await collectDcf11bViolations(workspaceRoot));
  violations.push(...await collectDcf12aViolations(workspaceRoot));
  violations.push(...await collectDcf12bViolations(workspaceRoot));
  violations.push(...await collectDcf13aViolations(workspaceRoot));
  violations.push(...await collectDcf13bViolations(workspaceRoot));
  violations.push(...await collectDcf13cViolations(workspaceRoot));
  violations.push(...await collectDcf20Violations(workspaceRoot));
  violations.push(...await collectDcf2aViolations(workspaceRoot));
  violations.push(...await collectDcf2bViolations(workspaceRoot));
  violations.push(...await collectDcf2cViolations(workspaceRoot));

  return violations;
}

async function collectDcf2cViolations(workspaceRoot) {
  const planPath = join(
    workspaceRoot,
    "docs/architecture/DCF-2-DEVELOPMENT-PLAN.md",
  );
  if (!await pathExists(planPath)) return [];
  const plan = await readFile(planPath, "utf8");
  if (
    !plan.includes("DCF-2C：AUTHORIZED")
    && !plan.includes("DCF-2C：IN_PROGRESS")
    && !plan.includes("DCF-2C：IMPLEMENTED")
    && !plan.includes("DCF-2C：PASS / CLOSED")
  ) return [];

  const violations = [];
  for (const file of [
    "services/core/tests/dcf2c-task-recovery-harness.test.ts",
    "tests/e2e/dcf2c-desktop-recovery-harness.e2e.test.ts",
    "tests/e2e/dcf2c-user-demo.e2e.test.ts",
    "apps/desktop/tests/desktop-event-reconnect-controller.test.ts",
    "services/core/tests/sse-backpressure-writer.test.ts",
    "services/core/src/application/dcf2c-demo-agent-runner.ts",
  ]) {
    if (!await pathExists(join(workspaceRoot, file))) {
      violations.push(`${file}: DCF-2C recovery Harness evidence is required`);
    }
  }

  const packagePath = join(workspaceRoot, "package.json");
  if (await pathExists(packagePath)) {
    const source = await readFile(packagePath, "utf8");
    if (!source.includes("\"harness:dcf2c\"")) {
      violations.push("package.json: DCF-2C requires harness:dcf2c");
    }
    if (!source.includes("\"demo:dcf2c\"")) {
      violations.push("package.json: DCF-2C user experience requires an isolated demo:dcf2c entrypoint");
    }
    if (!source.includes("tests/e2e/dcf2c-user-demo.e2e.test.ts")) {
      violations.push("package.json: DCF-2C Harness must execute the isolated user demo E2E");
    }
  }

  const rendererPath = join(workspaceRoot, "apps/desktop/src/renderer/legacy/LegacyWorkbench.ts");
  if (await pathExists(rendererPath)) {
    const source = await readFile(rendererPath, "utf8");
    for (const required of [
      "taskStatusGuidance",
      "waiting_confirmation",
      "recovering",
      "manual_attention",
    ]) {
      if (!source.includes(required)) {
        violations.push(
          `apps/desktop/src/renderer/legacy/LegacyWorkbench.ts: DCF-2C requires ${required}`,
        );
      }
    }
  }

  for (const root of [
    "packages/contracts/src",
    "services/core/src/kernel",
  ]) {
    const absoluteRoot = join(workspaceRoot, root);
    if (!await pathExists(absoluteRoot)) continue;
    for (const file of await collectSourceFiles(absoluteRoot)) {
      const source = await readFile(file, "utf8");
      for (const forbidden of [
        "Dcf2cRecoveryHarness",
        "DCF-2C Recovery Harness",
        "harness:dcf2c",
        "Dcf2cDemoAgentRunner",
        "ROBOTHREE_DCF2C_DEMO",
      ]) {
        if (source.includes(forbidden)) {
          violations.push(
            `${relative(workspaceRoot, file)}: DCF-2C Harness types must remain outside Contracts and Kernel`,
          );
        }
      }
    }
  }

  for (const root of [
    "packages/contracts/src",
    "services/core/src/kernel",
    "apps/desktop/src/preload",
    "apps/desktop/src/renderer",
  ]) {
    const absoluteRoot = join(workspaceRoot, root);
    if (!await pathExists(absoluteRoot)) continue;
    for (const file of await collectSourceFiles(absoluteRoot)) {
      const source = await readFile(file, "utf8");
      if (
        source.includes("ROBOTHREE_DCF2C_DEMO")
        || source.includes("Dcf2cDemoAgentRunner")
      ) {
        violations.push(
          `${relative(workspaceRoot, file)}: DCF-2C demo mode must remain in Desktop Main and Core Application/Adapter boundaries`,
        );
      }
    }
  }

  return violations;
}

async function collectDcf2bViolations(workspaceRoot) {
  const planPath = join(
    workspaceRoot,
    "docs/architecture/DCF-2-DEVELOPMENT-PLAN.md",
  );
  if (!await pathExists(planPath)) return [];
  const plan = await readFile(planPath, "utf8");
  if (
    !plan.includes("DCF-2B：IN_PROGRESS")
    && !plan.includes("DCF-2B：IMPLEMENTED")
    && !plan.includes("DCF-2B：PASS / CLOSED")
  ) return [];

  const violations = [];
  for (const file of [
    "services/core/src/application/desktop-task-control-service.ts",
    "services/core/src/application/desktop-task-projection-service.ts",
    "services/core/src/application/durable-agent-loop-starter.ts",
    "services/core/src/adapters/http/core-private-http-server.ts",
    "apps/desktop/src/main/core-private-client.ts",
    "apps/desktop/src/main/desktop-ipc-router.ts",
    "apps/desktop/src/preload/create-desktop-api.ts",
    "apps/desktop/src/renderer/main.ts",
    "services/core/tests/desktop-task-control-service.test.ts",
    "services/core/tests/user-confirmation.integration.test.ts",
  ]) {
    if (!await pathExists(join(workspaceRoot, file))) {
      violations.push(`${file}: DCF-2B Task control and confirmation evidence is required`);
    }
  }

  const rendererPath = join(workspaceRoot, "apps/desktop/src/renderer/legacy/LegacyWorkbench.ts");
  if (await pathExists(rendererPath)) {
    const source = await readFile(rendererPath, "utf8");
    for (const required of [
      "controlTask",
      "decideConfirmation",
      "provideSelectedTaskInput",
      "requestDigest",
    ]) {
      if (!source.includes(required)) {
        violations.push(
          `apps/desktop/src/renderer/legacy/LegacyWorkbench.ts: DCF-2B requires ${required}`,
        );
      }
    }
    for (const forbidden of [
      "UserConfirmationDecisionRecord",
      "PersistedUserConfirmation",
      "UserConfirmationCoordinator",
      "EffectAttempt",
      "ActionIntent",
      "rawToolArguments",
    ]) {
      if (source.includes(forbidden)) {
        violations.push(
          `apps/desktop/src/renderer/legacy/LegacyWorkbench.ts: ${forbidden} must remain behind the Desktop-safe Confirmation Projection`,
        );
      }
    }
  }

  const kernelRoot = join(workspaceRoot, "services/core/src/kernel");
  if (await pathExists(kernelRoot)) {
    for (const file of await collectSourceFiles(kernelRoot)) {
      const source = await readFile(file, "utf8");
      for (const forbidden of [
        "DesktopTaskControlService",
        "UserConfirmationProjection",
        "runtimeInstanceId",
      ]) {
        if (source.includes(forbidden)) {
          violations.push(
            `${relative(workspaceRoot, file)}: ${forbidden} must stay outside Kernel`,
          );
        }
      }
    }
  }

  return violations;
}

async function collectDcf2aViolations(workspaceRoot) {
  const planPath = join(
    workspaceRoot,
    "docs/architecture/DCF-2-DEVELOPMENT-PLAN.md",
  );
  if (!await pathExists(planPath)) return [];
  const plan = await readFile(planPath, "utf8");
  if (
    !plan.includes("DCF-2A：IN_PROGRESS")
    && !plan.includes("DCF-2A：IMPLEMENTED")
    && !plan.includes("DCF-2A：PASS / CLOSED")
  ) return [];

  const violations = [];
  for (const file of [
    "services/core/src/application/desktop-task-projection-service.ts",
    "services/core/src/ports/task-persistence.ts",
    "services/core/src/adapters/http/core-private-http-server.ts",
    "apps/desktop/src/main/core-private-client.ts",
    "apps/desktop/src/main/desktop-ipc-router.ts",
    "apps/desktop/src/preload/create-desktop-api.ts",
    "apps/desktop/src/renderer/main.ts",
    "services/core/tests/desktop-task-projection-service.test.ts",
    "tests/e2e/dcf12a-core-private.e2e.test.ts",
  ]) {
    if (!await pathExists(join(workspaceRoot, file))) {
      violations.push(`${file}: DCF-2A Task projection evidence is required`);
    }
  }

  const rendererPath = join(workspaceRoot, "apps/desktop/src/renderer/legacy/LegacyWorkbench.ts");
  if (await pathExists(rendererPath)) {
    const source = await readFile(rendererPath, "utf8");
    for (const required of ["listTasks", "loadTaskDetail"]) {
      if (!source.includes(required)) {
        violations.push(
          `apps/desktop/src/renderer/legacy/LegacyWorkbench.ts: DCF-2A requires ${required}`,
        );
      }
    }
    for (const forbidden of [
      "EffectAttempt",
      "TaskCapabilityLock",
      "RegistrySnapshot",
      "ActionIntent",
      "idempotencyKey",
      "rawToolArguments",
    ]) {
      if (source.includes(forbidden)) {
        violations.push(
          `apps/desktop/src/renderer/legacy/LegacyWorkbench.ts: ${forbidden} must remain behind the Desktop-safe Task Projection`,
        );
      }
    }
  }

  const kernelRoot = join(workspaceRoot, "services/core/src/kernel");
  if (await pathExists(kernelRoot)) {
    for (const file of await collectSourceFiles(kernelRoot)) {
      const source = await readFile(file, "utf8");
      for (const forbidden of [
        "DesktopTaskProjectionService",
        "TaskDetailProjection",
        "ToolActivityProjection",
      ]) {
        if (source.includes(forbidden)) {
          violations.push(
            `${relative(workspaceRoot, file)}: ${forbidden} must stay outside Kernel`,
          );
        }
      }
    }
  }

  return violations;
}

async function collectDcf20Violations(workspaceRoot) {
  const planPath = join(
    workspaceRoot,
    "docs/architecture/DCF-2-DEVELOPMENT-PLAN.md",
  );
  if (!await pathExists(planPath)) return [];
  const plan = await readFile(planPath, "utf8");
  if (!plan.includes("DCF-2.0：UNBLOCKED")) return [];

  const violations = [];
  for (const file of [
    "packages/contracts/src/desktop-local/v1alpha1/task.ts",
    "packages/contracts/tests/dcf-2-0-contracts.test.ts",
  ]) {
    if (!await pathExists(join(workspaceRoot, file))) {
      violations.push(`${file}: DCF-2.0 Contract and Conformance evidence is required`);
    }
  }

  const taskContractPath = join(
    workspaceRoot,
    "packages/contracts/src/desktop-local/v1alpha1/task.ts",
  );
  if (await pathExists(taskContractPath)) {
    const source = await readFile(taskContractPath, "utf8");
    for (const required of [
      "TaskDetailProjectionSchema",
      "UserConfirmationProjectionSchema",
      "ToolActivityProjectionSchema",
      "CancelTaskCommandSchema",
      "RetryTaskCommandSchema",
      "ContinueTaskCommandSchema",
      "ProvideTaskInputCommandSchema",
      "DecideUserConfirmationCommandSchema",
      "requestDigest",
      "expectedTaskRevision",
    ]) {
      if (!source.includes(required)) {
        violations.push(
          `packages/contracts/src/desktop-local/v1alpha1/task.ts: DCF-2.0 requires ${required}`,
        );
      }
    }
    for (const forbidden of [
      "decidedByUserId",
      "ActionIntent",
      "RuntimeAdapterHandle",
      "Credential",
      "rawToolArguments",
      "getPrivateKey",
    ]) {
      if (source.includes(forbidden)) {
        violations.push(
          `packages/contracts/src/desktop-local/v1alpha1/task.ts: ${forbidden} must not enter the Desktop-safe Task Contract`,
        );
      }
    }
  }

  const kernelRoot = join(workspaceRoot, "services/core/src/kernel");
  if (await pathExists(kernelRoot)) {
    for (const file of await collectSourceFiles(kernelRoot)) {
      const source = await readFile(file, "utf8");
      for (const forbidden of [
        "TaskDetailProjection",
        "UserConfirmationProjection",
        "ToolActivityProjection",
        "DecideUserConfirmationCommand",
      ]) {
        if (source.includes(forbidden)) {
          violations.push(
            `${relative(workspaceRoot, file)}: ${forbidden} is a Desktop/Application concern and must remain outside Kernel`,
          );
        }
      }
    }
  }

  return violations;
}

async function collectCgf13bViolations(workspaceRoot) {
  const planPath = join(
    workspaceRoot,
    "docs/architecture/CGF-1.3-DEVELOPMENT-PLAN.md",
  );
  if (!await pathExists(planPath)) return [];
  const plan = await readFile(planPath, "utf8");
  if (
    !plan.includes("CGF-1.3B：IN_PROGRESS")
    && !plan.includes("CGF-1.3B：IMPLEMENTED")
    && !plan.includes("CGF-1.3B：PASS / CLOSED")
  ) return [];

  const violations = [];
  for (const file of [
    "services/core/src/ports/runtime-activation-persistence.ts",
    "services/core/src/ports/controlled-core-restart.ts",
    "services/core/src/ports/runtime-registry-installer.ts",
    "services/core/src/application/runtime-activation-coordinator.ts",
    "services/core/src/adapters/memory/in-memory-runtime-activation-persistence.ts",
    "services/core/src/adapters/sqlite/sqlite-runtime-activation-persistence.ts",
    "services/core/tests/runtime-activation-persistence.conformance.test.ts",
    "services/core/tests/runtime-activation-coordinator.test.ts",
  ]) {
    if (!await pathExists(join(workspaceRoot, file))) {
      violations.push(`${file}: CGF-1.3B Runtime Activation boundary is required`);
    }
  }

  for (const root of [
    "packages/contracts/src",
    "services/core/src/kernel",
  ]) {
    const fullRoot = join(workspaceRoot, root);
    if (!await pathExists(fullRoot)) continue;
    for (const file of await collectSourceFiles(fullRoot)) {
      const source = await readFile(file, "utf8");
      for (const forbidden of [
        "RuntimeActivationCoordinator",
        "RuntimeActivationPersistence",
        "ControlledCoreRestartPort",
        "RuntimeRegistryInstaller",
        "runtimeActiveGeneration",
      ]) {
        if (source.includes(forbidden)) {
          violations.push(
            `${relative(workspaceRoot, file)}: ${forbidden} is an internal Application/Adapter concern and must not enter Contracts or Kernel`,
          );
        }
      }
    }
  }

  const activationFiles = [
    "services/core/src/application/runtime-activation-coordinator.ts",
    "services/core/src/ports/controlled-core-restart.ts",
    "services/core/src/ports/runtime-registry-installer.ts",
  ];
  for (const file of activationFiles) {
    const fullPath = join(workspaceRoot, file);
    if (!await pathExists(fullPath)) continue;
    const source = await readFile(fullPath, "utf8");
    for (const forbidden of [
      'from "electron"',
      'from "node:child_process"',
      'from "child_process"',
      "packages/contracts/src",
    ]) {
      if (source.includes(forbidden)) {
        violations.push(
          `${file}: CGF-1.3B internal Port must not bind Electron, process APIs or public Contract implementation`,
        );
      }
    }
  }

  return violations;
}

async function collectDcf12aViolations(workspaceRoot) {
  const planPath = join(
    workspaceRoot,
    "docs/architecture/DCF-1.2-DEVELOPMENT-PLAN.md",
  );
  if (!await pathExists(planPath)) return [];
  const plan = await readFile(planPath, "utf8");
  if (!plan.includes("DCF-1.2A：")) return [];

  const violations = [];
  for (const file of [
    "services/core/src/application/desktop-application-facade.ts",
    "services/core/src/application/durable-agent-loop-starter.ts",
    "services/core/src/adapters/memory/ephemeral-workspace-selection-store.ts",
    "services/core/src/adapters/http/core-private-http-server.ts",
    "services/core/src/bootstrap/create-desktop-private-runtime.ts",
    "services/core/src/desktop-private-main.ts",
    "apps/desktop/src/main/core-private-client.ts",
    "apps/desktop/src/main/core-private-supervisor.ts",
    "tests/e2e/dcf12a-core-private.e2e.test.ts",
  ]) {
    if (!await pathExists(join(workspaceRoot, file))) {
      violations.push(`${file}: DCF-1.2A formal Desktop bridge is required`);
    }
  }

  const headlessPath = join(
    workspaceRoot,
    "services/core/src/application/headless-desktop-runtime.ts",
  );
  if (await pathExists(headlessPath)) {
    const source = await readFile(headlessPath, "utf8");
    if (!source.includes("DesktopApplicationFacade")) {
      violations.push(
        "services/core/src/application/headless-desktop-runtime.ts: Headless must delegate the Application Facade",
      );
    }
    for (const forbidden of ["SubmitTurnPersistence", "SubmitTurnCoordinator"]) {
      if (source.includes(forbidden)) {
        violations.push(
          `services/core/src/application/headless-desktop-runtime.ts: ${forbidden} would create a second business entry`,
        );
      }
    }
  }

  const serverPath = join(
    workspaceRoot,
    "services/core/src/adapters/http/core-private-http-server.ts",
  );
  if (await pathExists(serverPath)) {
    const source = await readFile(serverPath, "utf8");
    if (!source.includes("DesktopApplicationFacade")) {
      violations.push(
        "services/core/src/adapters/http/core-private-http-server.ts: transport must delegate the Application Facade",
      );
    }
    for (const forbidden of [
      "SubmitTurnCoordinator",
      "WorkspaceGrantService",
      "DesktopSessionService",
      "RuntimeSelectionService",
    ]) {
      if (source.includes(forbidden)) {
        violations.push(
          `services/core/src/adapters/http/core-private-http-server.ts: ${forbidden} must remain behind the Facade`,
        );
      }
    }
  }

  const desktopIndex = join(workspaceRoot, "apps/desktop/src/main/index.ts");
  if (await pathExists(desktopIndex)) {
    const source = await readFile(desktopIndex, "utf8");
    if (
      source.includes("CoreHarnessSupervisor")
      || source.includes("fake-core-process")
    ) {
      violations.push(
        "apps/desktop/src/main/index.ts: production startup must not use the DCF-0 fixture transport",
      );
    }
  }

  for (const root of [
    "apps/desktop/src/preload",
    "apps/desktop/src/renderer",
    "apps/desktop/src/shared",
  ]) {
    const fullRoot = join(workspaceRoot, root);
    if (!await pathExists(fullRoot)) continue;
    for (const file of await collectSourceFiles(fullRoot)) {
      const source = await readFile(file, "utf8");
      for (const forbidden of [
        "selectionHandle",
        "authorizationToken",
        "rootRealPath",
        "CorePrivateClient",
      ]) {
        if (source.includes(forbidden)) {
          violations.push(
            `${relative(workspaceRoot, file)}: ${forbidden} must not enter Renderer/Preload safe views`,
          );
        }
      }
    }
  }

  for (const root of ["apps/desktop/src", "services/core/src"]) {
    for (const file of await collectSourceFiles(join(workspaceRoot, root))) {
      if (file.includes(`${join("apps", "desktop", "src", "main", "fixtures")}`)) {
        continue;
      }
      const source = await readFile(file, "utf8");
      if (/(?:phoenix|socket\.io|sockjs|eventsource|ws:\/\/|wss:\/\/)/iu.test(source)) {
        violations.push(
          `${relative(workspaceRoot, file)}: DCF-1.2A production transport is HTTP/SSE only`,
        );
      }
    }
  }

  return violations;
}

async function collectDcf12bViolations(workspaceRoot) {
  const planPath = join(
    workspaceRoot,
    "docs/architecture/DCF-1.2-DEVELOPMENT-PLAN.md",
  );
  if (!await pathExists(planPath)) return [];
  const plan = await readFile(planPath, "utf8");
  if (
    !plan.includes("DCF-1.2B：IN_PROGRESS")
    && !plan.includes("DCF-1.2B：IMPLEMENTED")
    && !plan.includes("DCF-1.2B：PASS / CLOSED")
  ) return [];

  const violations = [];
  for (const file of [
    "apps/desktop/src/main/desktop-ipc-router.ts",
    "apps/desktop/src/preload/create-desktop-api.ts",
    "apps/desktop/src/renderer/main.ts",
    "apps/desktop/src/renderer/styles.css",
    "apps/desktop/tests/desktop-ipc-router.test.ts",
    "apps/desktop/tests/renderer-workbench-boundary.test.ts",
    "tests/e2e/dcf12b-workbench-bridge.e2e.test.ts",
  ]) {
    if (!await pathExists(join(workspaceRoot, file))) {
      violations.push(`${file}: DCF-1.2B typed workbench boundary is required`);
    }
  }

  const rendererPath = join(
    workspaceRoot,
    "apps/desktop/src/renderer/legacy/LegacyWorkbench.ts",
  );
  if (await pathExists(rendererPath)) {
    const source = await readFile(rendererPath, "utf8");
    for (const required of [
      "createWorkspaceGrantFromPicker",
      "createSession",
      "listAgents",
      "listModels",
      "loadConversationSnapshot",
      "submitTurn",
      "onDesktopEvent",
    ]) {
      if (!source.includes(required)) {
        violations.push(
          `apps/desktop/src/renderer/legacy/LegacyWorkbench.ts: DCF-1.2B workbench requires ${required}`,
        );
      }
    }
  }

  const sharedApiPath = join(
    workspaceRoot,
    "apps/desktop/src/shared/foundation-api.ts",
  );
  if (await pathExists(sharedApiPath)) {
    const source = await readFile(sharedApiPath, "utf8");
    for (const forbidden of [
      "authorizationToken",
      "selectedPath",
      "selectionHandle:",
      "baseUrl:",
      "rootRealPath",
    ]) {
      if (source.includes(forbidden)) {
        violations.push(
          `apps/desktop/src/shared/foundation-api.ts: ${forbidden} must not enter the Renderer-safe contract`,
        );
      }
    }
  }

  return violations;
}

async function collectDcf13aViolations(workspaceRoot) {
  const planPath = join(
    workspaceRoot,
    "docs/architecture/DCF-1.3-DEVELOPMENT-PLAN.md",
  );
  if (!await pathExists(planPath)) return [];
  const plan = await readFile(planPath, "utf8");
  if (!plan.includes("DCF-1.3A")) return [];

  const violations = [];
  for (const file of [
    "apps/desktop/src/main/core-private-supervisor.ts",
    "apps/desktop/src/main/desktop-event-reconnect-controller.ts",
    "apps/desktop/tests/core-private-supervisor-lifecycle.test.ts",
    "apps/desktop/tests/core-private-supervisor.integration.test.ts",
    "services/core/src/adapters/memory/ephemeral-workspace-selection-store.ts",
  ]) {
    if (!await pathExists(join(workspaceRoot, file))) {
      violations.push(`${file}: DCF-1.3A lifecycle and recovery evidence is required`);
    }
  }

  const sharedApiPath = join(
    workspaceRoot,
    "apps/desktop/src/shared/foundation-api.ts",
  );
  const supervisorPath = join(
    workspaceRoot,
    "apps/desktop/src/main/core-private-supervisor.ts",
  );
  for (const file of [sharedApiPath, supervisorPath]) {
    if (!await pathExists(file)) continue;
    const source = await readFile(file, "utf8");
    if (source.includes("\"recovering\"")) {
      violations.push(
        `${relative(workspaceRoot, file)}: recovering belongs to Runtime Projection, not the Core lifecycle state machine`,
      );
    }
  }

  const desktopMainPath = join(workspaceRoot, "apps/desktop/src/main/index.ts");
  if (await pathExists(desktopMainPath)) {
    const source = await readFile(desktopMainPath, "utf8");
    if (!/maxUnexpectedRestarts:\s*1\b/u.test(source)) {
      violations.push(
        "apps/desktop/src/main/index.ts: Alpha must freeze the automatic Core restart budget at one",
      );
    }
  }

  const selectionStorePath = join(
    workspaceRoot,
    "services/core/src/adapters/memory/ephemeral-workspace-selection-store.ts",
  );
  if (await pathExists(selectionStorePath)) {
    const source = await readFile(selectionStorePath, "utf8");
    for (const forbidden of ["node:sqlite", "TaskEvent", "Audit", "Outbox"]) {
      if (source.includes(forbidden)) {
        violations.push(
          `services/core/src/adapters/memory/ephemeral-workspace-selection-store.ts: ${forbidden} must not enter the process-local selection store`,
        );
      }
    }
  }

  const kernelRoot = join(workspaceRoot, "services/core/src/kernel");
  if (await pathExists(kernelRoot)) {
    for (const file of await collectSourceFiles(kernelRoot)) {
      const source = await readFile(file, "utf8");
      for (const forbidden of [
        "CorePrivateSupervisor",
        "EphemeralWorkspaceSelectionStore",
        "runtimeInstanceId",
        "maxUnexpectedRestarts",
      ]) {
        if (source.includes(forbidden)) {
          violations.push(
            `${relative(workspaceRoot, file)}: ${forbidden} is an Application/Adapter lifecycle concern and must remain outside Kernel`,
          );
        }
      }
    }
  }

  return violations;
}

async function collectDcf13bViolations(workspaceRoot) {
  const planPath = join(
    workspaceRoot,
    "docs/architecture/DCF-1.3-DEVELOPMENT-PLAN.md",
  );
  if (!await pathExists(planPath)) return [];
  const plan = await readFile(planPath, "utf8");
  if (
    !plan.includes("DCF-1.3B：AUTHORIZED")
    && !plan.includes("DCF-1.3B：IMPLEMENTED")
    && !plan.includes("DCF-1.3B：PASS / CLOSED")
  ) return [];

  const violations = [];
  for (const file of [
    "services/core/src/adapters/http/sse-backpressure-writer.ts",
    "services/core/tests/sse-backpressure-writer.test.ts",
    "apps/desktop/src/main/desktop-event-reconnect-controller.ts",
    "apps/desktop/tests/desktop-event-reconnect-controller.test.ts",
    "tests/e2e/dcf12a-core-private.e2e.test.ts",
  ]) {
    if (!await pathExists(join(workspaceRoot, file))) {
      violations.push(`${file}: DCF-1.3B backpressure and resource evidence is required`);
    }
  }

  const serverPath = join(
    workspaceRoot,
    "services/core/src/adapters/http/core-private-http-server.ts",
  );
  if (await pathExists(serverPath)) {
    const source = await readFile(serverPath, "utf8");
    for (const required of [
      "SseBackpressureWriter",
      "slowConsumerDeadlineMs",
      "activePollTimers",
      "activeHeartbeatTimers",
      "activeEphemeralSubscriptions",
      "cleanupCount",
    ]) {
      if (!source.includes(required)) {
        violations.push(
          `services/core/src/adapters/http/core-private-http-server.ts: DCF-1.3B requires ${required}`,
        );
      }
    }
    if (source.includes("function writeSse(")) {
      violations.push(
        "services/core/src/adapters/http/core-private-http-server.ts: SSE frames must pass through the backpressure owner",
      );
    }
  }

  const writerPath = join(
    workspaceRoot,
    "services/core/src/adapters/http/sse-backpressure-writer.ts",
  );
  if (await pathExists(writerPath)) {
    const source = await readFile(writerPath, "utf8");
    for (const required of [
      "SLOW_CONSUMER_DEADLINE_MS = 30_000",
      "writableNeedDrain",
      "\"drain\"",
      "ephemeralFramesDropped",
      "heartbeatFramesSkipped",
    ]) {
      if (!source.includes(required)) {
        violations.push(
          `services/core/src/adapters/http/sse-backpressure-writer.ts: DCF-1.3B requires ${required}`,
        );
      }
    }
  }

  const reconnectPath = join(
    workspaceRoot,
    "apps/desktop/src/main/desktop-event-reconnect-controller.ts",
  );
  if (await pathExists(reconnectPath)) {
    const source = await readFile(reconnectPath, "utf8");
    for (const required of [
      "dedupeSetSize",
      "maxDedupeSize",
      "cleanupCount",
      "MAX_DEDUPE_SIZE = 2_048",
    ]) {
      if (!source.includes(required)) {
        violations.push(
          `apps/desktop/src/main/desktop-event-reconnect-controller.ts: DCF-1.3B requires ${required}`,
        );
      }
    }
  }

  const contractsRoot = join(workspaceRoot, "packages/contracts/src");
  if (await pathExists(contractsRoot)) {
    for (const file of await collectSourceFiles(contractsRoot)) {
      const source = await readFile(file, "utf8");
      if (
        source.includes("SseBackpressureMetrics")
        || source.includes("slowConsumerDeadlineMs")
        || source.includes("dedupeSetSize")
      ) {
        violations.push(
          `${relative(workspaceRoot, file)}: DCF-1.3B transport metrics must remain internal and must not enter Contracts`,
        );
      }
    }
  }

  const kernelRoot = join(workspaceRoot, "services/core/src/kernel");
  if (await pathExists(kernelRoot)) {
    for (const file of await collectSourceFiles(kernelRoot)) {
      const source = await readFile(file, "utf8");
      if (
        source.includes("SseBackpressureWriter")
        || source.includes("slowConsumerDeadlineMs")
        || source.includes("dedupeSetSize")
      ) {
        violations.push(
          `${relative(workspaceRoot, file)}: DCF-1.3B transport backpressure must remain outside Kernel`,
        );
      }
    }
  }

  return violations;
}

async function collectDcf13cViolations(workspaceRoot) {
  const planPath = join(
    workspaceRoot,
    "docs/architecture/DCF-1.3-DEVELOPMENT-PLAN.md",
  );
  if (!await pathExists(planPath)) return [];
  const plan = await readFile(planPath, "utf8");
  if (
    !plan.includes("DCF-1.3C：AUTHORIZED")
    && !plan.includes("DCF-1.3C：IMPLEMENTED")
    && !plan.includes("DCF-1.3C：PASS / CLOSED")
  ) return [];

  const violations = [];
  for (const file of [
    "scripts/run-dcf13c-stability.mjs",
    "scripts/run-dcf13c-stability.test.mjs",
  ]) {
    if (!await pathExists(join(workspaceRoot, file))) {
      violations.push(`${file}: DCF-1.3C stability Harness evidence is required`);
    }
  }

  const harnessPath = join(
    workspaceRoot,
    "scripts/run-dcf13c-stability.mjs",
  );
  if (await pathExists(harnessPath)) {
    const source = await readFile(harnessPath, "utf8");
    for (const required of [
      "\"30m\": 30 * 60 * 1_000",
      "\"60m\": 60 * 60 * 1_000",
      "CorePrivateSupervisor",
      "DesktopEventReconnectController",
      "SseBackpressureWriter",
      "assertSafeHarnessReport",
      "finalDigest",
      "errorCodes",
    ]) {
      if (!source.includes(required)) {
        violations.push(
          `scripts/run-dcf13c-stability.mjs: DCF-1.3C requires ${required}`,
        );
      }
    }
  }

  const packagePath = join(workspaceRoot, "package.json");
  if (await pathExists(packagePath)) {
    const source = await readFile(packagePath, "utf8");
    for (const required of [
      "harness:dcf13c:30",
      "harness:dcf13c:60",
    ]) {
      if (!source.includes(required)) {
        violations.push(`package.json: DCF-1.3C requires ${required}`);
      }
    }
  }

  for (const root of [
    "packages/contracts/src",
    "services/core/src/kernel",
  ]) {
    for (const file of await collectSourceFiles(join(workspaceRoot, root))) {
      const source = await readFile(file, "utf8");
      if (
        source.includes("Dcf13cStability")
        || source.includes("StabilityHarnessReport")
        || source.includes("configuredDurationMs")
      ) {
        violations.push(
          `${relative(workspaceRoot, file)}: DCF-1.3C Harness types must remain outside Contracts and Kernel`,
        );
      }
    }
  }

  return violations;
}

async function collectDcf11aViolations(workspaceRoot) {
  const planPath = join(
    workspaceRoot,
    "docs/architecture/DCF-1.1-DEVELOPMENT-PLAN.md",
  );
  if (!await pathExists(planPath)) return [];
  const plan = await readFile(planPath, "utf8");
  if (
    !plan.includes("DCF-1.1A 已获用户授权")
    && !plan.includes("DCF-1.1A PASS/CLOSED")
  ) return [];

  const violations = [];
  for (const file of [
    "services/core/src/ports/desktop-foundation-persistence.ts",
    "services/core/src/ports/workspace-selection.ts",
    "services/core/src/application/workspace-grant-service.ts",
    "services/core/src/application/desktop-session-service.ts",
    "services/core/src/application/desktop-conversation-projection-service.ts",
    "services/core/src/adapters/memory/in-memory-desktop-foundation-persistence.ts",
    "services/core/src/adapters/sqlite/sqlite-desktop-foundation-persistence.ts",
    "services/core/src/adapters/node/node-workspace-path-resolver.ts",
    "services/core/tests/desktop-foundation-persistence.conformance.test.ts",
    "services/core/tests/desktop-foundation-services.integration.test.ts",
  ]) {
    if (!await pathExists(join(workspaceRoot, file))) {
      violations.push(`${file}: DCF-1.1A Desktop foundation boundary is required`);
    }
  }

  const sqlitePath = join(
    workspaceRoot,
    "services/core/src/adapters/sqlite/sqlite-desktop-foundation-persistence.ts",
  );
  if (await pathExists(sqlitePath)) {
    const source = await readFile(sqlitePath, "utf8");
    if (source.includes("selectionHandle")) {
      violations.push(
        "services/core/src/adapters/sqlite/sqlite-desktop-foundation-persistence.ts: opaque selectionHandle must not be persisted",
      );
    }
    for (const forbidden of [
      "RuntimeAdapterHandle",
      "TaskRuntimeSelection",
      "SubmitTurn",
      "Electron",
    ]) {
      if (source.includes(forbidden)) {
        violations.push(
          `services/core/src/adapters/sqlite/sqlite-desktop-foundation-persistence.ts: ${forbidden} is outside DCF-1.1A persistence scope`,
        );
      }
    }
  }

  const kernelRoot = join(workspaceRoot, "services/core/src/kernel");
  if (await pathExists(kernelRoot)) {
    const kernelFiles = await collectSourceFiles(kernelRoot);
    for (const file of kernelFiles) {
      const source = await readFile(file, "utf8");
      if (
        source.includes("desktop-foundation")
        || source.includes("workspace-selection")
        || source.includes("WorkspaceGrantService")
        || source.includes("DesktopSessionService")
      ) {
        violations.push(
          `${relative(workspaceRoot, file)}: DCF-1.1A Application and Adapter concerns must remain outside Kernel`,
        );
      }
    }
  }

  return violations;
}

async function collectDcf11bViolations(workspaceRoot) {
  const planPath = join(
    workspaceRoot,
    "docs/architecture/DCF-1.1-DEVELOPMENT-PLAN.md",
  );
  if (!await pathExists(planPath)) return [];
  const plan = await readFile(planPath, "utf8");
  if (
    !plan.includes("DCF-1.1B 已获用户授权")
    && !plan.includes("DCF-1.1B IMPLEMENTED")
  ) return [];

  const violations = [];
  for (const file of [
    "packages/contracts/src/runtime-selection/runtime-selection.ts",
    "services/core/src/ports/trusted-runtime-catalog.ts",
    "services/core/src/application/model-eligibility-evaluator.ts",
    "services/core/src/application/runtime-selection-revisions.ts",
    "services/core/src/application/runtime-selection-service.ts",
    "services/core/src/adapters/memory/in-memory-trusted-runtime-catalog.ts",
    "services/core/tests/runtime-selection.integration.test.ts",
  ]) {
    if (!await pathExists(join(workspaceRoot, file))) {
      violations.push(`${file}: DCF-1.1B Runtime Selection boundary is required`);
    }
  }

  const contractPath = join(
    workspaceRoot,
    "packages/contracts/src/runtime-selection/runtime-selection.ts",
  );
  if (await pathExists(contractPath)) {
    const source = await readFile(contractPath, "utf8");
    for (const forbidden of [
      "credentialRef",
      "RuntimeAdapterHandle",
      "contextRevision",
      "process.pid",
    ]) {
      if (source.includes(forbidden)) {
        violations.push(
          `packages/contracts/src/runtime-selection/runtime-selection.ts: ${forbidden} must not enter TaskRuntimeSelection`,
        );
      }
    }
  }

  const kernelRoot = join(workspaceRoot, "services/core/src/kernel");
  if (await pathExists(kernelRoot)) {
    const kernelFiles = await collectSourceFiles(kernelRoot);
    for (const file of kernelFiles) {
      const source = await readFile(file, "utf8");
      if (
        source.includes("TaskRuntimeSelection")
        || source.includes("RuntimeSelectionService")
        || source.includes("TrustedAgentRepository")
        || source.includes("ModelEligibilityEvaluator")
      ) {
        violations.push(
          `${relative(workspaceRoot, file)}: DCF-1.1B selection concerns must remain outside Kernel`,
        );
      }
    }
  }

  for (const gated of [
    "services/core/src/application/submit-turn-coordinator.ts",
    "services/core/src/application/desktop-delivery-service.ts",
  ]) {
    if (await pathExists(join(workspaceRoot, gated))) {
      violations.push(`${gated}: DCF-1.1C remains GATED`);
    }
  }

  return violations;
}

async function collectDcf1ContractViolations(workspaceRoot) {
  const violations = [];
  if (!await pathExists(join(
    workspaceRoot,
    "docs/architecture/DCF-1-CONTRACT-THREAT-MODEL-AND-CONFORMANCE-PLAN.md",
  ))) {
    return violations;
  }
  const contractRoot = join(
    workspaceRoot,
    "packages/contracts/src/desktop-local/v1alpha1",
  );
  const requiredFiles = [
    "catalog.ts",
    "common.ts",
    "control.ts",
    "error.ts",
    "event.ts",
    "index.ts",
    "session.ts",
    "submit-turn.ts",
    "workspace.ts",
  ];

  for (const file of requiredFiles) {
    if (!await pathExists(join(contractRoot, file))) {
      violations.push(
        `packages/contracts/src/desktop-local/v1alpha1/${file}: DCF-1.0 formal Contract file is required`,
      );
    }
  }

  const eventPath = join(contractRoot, "event.ts");
  if (await pathExists(eventPath)) {
    const source = await readFile(eventPath, "utf8");
    for (const required of [
      "DurableDesktopEventEnvelopeSchema",
      "EphemeralDesktopEventEnvelopeSchema",
      "ReplayResetRequiredSchema",
      "DesktopHeartbeatSchema",
      "queryRef",
    ]) {
      if (!source.includes(required)) {
        violations.push(
          `packages/contracts/src/desktop-local/v1alpha1/event.ts: missing ${required}`,
        );
      }
    }
    for (const forbidden of [
      "credentialRef",
      "RuntimeAdapterHandle",
      "TaskCapabilityLockSchema",
      "process.pid",
    ]) {
      if (source.includes(forbidden)) {
        violations.push(
          `packages/contracts/src/desktop-local/v1alpha1/event.ts: ${forbidden} must not enter Desktop Event Contract`,
        );
      }
    }
  }

  for (const corpus of ["valid.json", "invalid.json"]) {
    if (!await pathExists(join(
      workspaceRoot,
      "packages/contracts/fixtures/desktop-local/v1alpha1",
      corpus,
    ))) {
      violations.push(
        `packages/contracts/fixtures/desktop-local/v1alpha1/${corpus}: DCF-1.0 conformance corpus is required`,
      );
    }
  }

  return violations;
}

async function collectCgf1ContractViolations(workspaceRoot) {
  const violations = [];
  if (!await pathExists(join(
    workspaceRoot,
    "docs/architecture/CGF-1-INFRASTRUCTURE-IDENTITY-AND-CONFORMANCE-PLAN.md",
  ))) {
    return violations;
  }
  const canonicalRoot = join(
    workspaceRoot,
    "contracts/enterprise-gateway/v1alpha1",
  );
  const requiredFiles = [
    "openapi.yaml",
    "CANONICAL-DIGEST.md",
    "fixtures/manifest.json",
    "fixtures/conformance/model-invocation-decisions.json",
    "fixtures/conformance/model-invocation-sequences.json",
    "fixtures/provider-stubs/anthropic-compatible-stream.json",
    "fixtures/provider-stubs/openai-compatible-stream.json",
    "fixtures/provider-stubs/provider-neutral-projection.json",
    "schemas/access-token-claims.schema.json",
    "schemas/compatibility.schema.json",
    "schemas/configuration-snapshot.schema.json",
    "schemas/descriptor.schema.json",
    "schemas/device-challenge.schema.json",
    "schemas/enrollment.schema.json",
    "schemas/error.schema.json",
    "schemas/exact-package-read.schema.json",
    "schemas/model-invocation-recovery.schema.json",
    "schemas/model-invocation.schema.json",
    "schemas/package-document.schema.json",
    "schemas/token.schema.json",
  ];

  for (const file of requiredFiles) {
    if (!await pathExists(join(canonicalRoot, file))) {
      violations.push(
        `contracts/enterprise-gateway/v1alpha1/${file}: CGF-1.0 canonical Contract file is required`,
      );
    }
  }

  for (const file of [
    "schemas/access-token-claims.schema.json",
    "schemas/device-challenge.schema.json",
    "schemas/enrollment.schema.json",
    "schemas/token.schema.json",
  ]) {
    const path = join(canonicalRoot, file);
    if (await pathExists(path)) {
      const source = await readFile(path, "utf8");
      if (!source.includes('"additionalProperties": false')) {
        violations.push(
          `contracts/enterprise-gateway/v1alpha1/${file}: strict identity object boundaries are required`,
        );
      }
      for (const forbidden of [
        '"authorizationCode"',
        '"codeVerifier"',
        '"username"',
        '"password"',
        '"privateKey"',
        '"keychainHandle"',
        '"providerReference"',
      ]) {
        if (source.includes(forbidden)) {
          violations.push(
            `contracts/enterprise-gateway/v1alpha1/${file}: ${forbidden} must not enter the canonical enterprise identity Contract`,
          );
        }
      }
    }
  }

  const openApiPath = join(canonicalRoot, "openapi.yaml");
  if (await pathExists(openApiPath)) {
    const source = await readFile(openApiPath, "utf8");
    for (const required of [
      "/v1alpha1/device-challenges:",
      "/v1alpha1/device-enrollment:",
      "issueAccessToken",
      "roboThreeAccessToken",
      "device-challenge.schema.json#/$defs/deviceChallengeRequest",
      "device-challenge.schema.json#/$defs/deviceChallenge",
      "enrollment.schema.json#/$defs/enrollDeviceRequest",
      "enrollment.schema.json#/$defs/enrollDeviceResult",
      "token.schema.json#/$defs/issueAccessTokenRequest",
      "token.schema.json#/$defs/tokenResult",
      "/v1alpha1/configuration/{snapshotId}/revisions/{snapshotRevision}/packages/{kind}/{packageId}/revisions/{packageRevision}:",
      "getExactPackageDocument",
      "snapshotDigest",
      "packageDigest",
      "If-None-Match",
      "package-document.schema.json",
      "/v1alpha1/model-invocations:",
      "/v1alpha1/model-invocations/{invocationId}:",
      "/v1alpha1/model-invocations/{invocationId}/cancel:",
      "/v1alpha1/model-invocations/{invocationId}/events:",
      "acceptModelInvocation",
      "getModelInvocation",
      "cancelModelInvocation",
      "streamModelInvocationEvents",
      "model-invocation.schema.json#/$defs/acceptRequest",
      "model-invocation.schema.json#/$defs/acceptedResponse",
      "model-invocation.schema.json#/$defs/statusResponse",
      "model-invocation.schema.json#/$defs/cancelRequest",
      "model-invocation.schema.json#/$defs/eventEnvelope",
      "text/event-stream",
    ]) {
      if (!source.includes(required)) {
        violations.push(
          `contracts/enterprise-gateway/v1alpha1/openapi.yaml: missing identity boundary ${required}`,
        );
      }
    }
    for (const forbidden of [
      "/oidc",
      "authorizationCode:",
      "codeVerifier:",
      "username:",
      "password:",
    ]) {
      if (source.includes(forbidden)) {
        violations.push(
          `contracts/enterprise-gateway/v1alpha1/openapi.yaml: ${forbidden} must remain adapter-specific`,
        );
      }
    }
  }

  const modelInvocationSchemaPath = join(
    canonicalRoot,
    "schemas/model-invocation.schema.json",
  );
  if (await pathExists(modelInvocationSchemaPath)) {
    const source = await readFile(modelInvocationSchemaPath, "utf8");
    for (const required of [
      '"additionalProperties": false',
      '"enterprise-model-gateway"',
      '"model.use"',
      '"accepted"',
      '"running"',
      '"completed"',
      '"failed"',
      '"cancelled"',
      '"timed_out"',
      '"uncertain"',
      '"eventClass"',
      '"durableSequence"',
      '"streamSequence"',
      '"durableCursor"',
      '"providerRequestDeadlineAt"',
      '"providerStreamIdleTimeoutMillis"',
    ]) {
      if (!source.includes(required)) {
        violations.push(
          `contracts/enterprise-gateway/v1alpha1/schemas/model-invocation.schema.json: missing Model Gateway boundary ${required}`,
        );
      }
    }
    for (const forbidden of [
      '"unknown"',
      '"credentialRef"',
      '"apiKey"',
      '"accessToken"',
      '"enterpriseId"',
      '"userId"',
      '"deviceId"',
      '"providerEndpoint"',
      '"leaseTtlMillis"',
      '"recoveryQueryDeadlineMillis"',
    ]) {
      if (source.includes(forbidden)) {
        violations.push(
          `contracts/enterprise-gateway/v1alpha1/schemas/model-invocation.schema.json: ${forbidden} must not enter the public Model Invocation Contract`,
        );
      }
    }
  }

  const modelRecoverySchemaPath = join(
    canonicalRoot,
    "schemas/model-invocation-recovery.schema.json",
  );
  if (await pathExists(modelRecoverySchemaPath)) {
    const source = await readFile(modelRecoverySchemaPath, "utf8");
    for (const required of [
      '"additionalProperties": false',
      '"leaseTtlMillis"',
      '"leaseRenewalIntervalMillis"',
      '"recoveryQueryDeadlineMillis"',
      '"fencingEpoch"',
      '"expectedStatusRevision"',
      '"nextDurableSequence"',
      '"databaseObservedAt"',
    ]) {
      if (!source.includes(required)) {
        violations.push(
          `contracts/enterprise-gateway/v1alpha1/schemas/model-invocation-recovery.schema.json: missing recovery boundary ${required}`,
        );
      }
    }
    for (const forbidden of [
      '"providerRequestDeadlineAt"',
      '"providerStreamIdleTimeoutMillis"',
      '"credentialRef"',
      '"apiKey"',
      '"accessToken"',
    ]) {
      if (source.includes(forbidden)) {
        violations.push(
          `contracts/enterprise-gateway/v1alpha1/schemas/model-invocation-recovery.schema.json: ${forbidden} must not enter server-owned recovery policy`,
        );
      }
    }
  }

  for (const file of [
    "schemas/configuration-snapshot.schema.json",
    "schemas/descriptor.schema.json",
  ]) {
    const path = join(canonicalRoot, file);
    if (await pathExists(path)) {
      const source = await readFile(path, "utf8");
      if (source.includes("credentialRef")) {
        violations.push(
          `contracts/enterprise-gateway/v1alpha1/${file}: enterprise credentialRef must not enter client Contract`,
        );
      }
      if (!source.includes('"additionalProperties": false')) {
        violations.push(
          `contracts/enterprise-gateway/v1alpha1/${file}: strict object boundaries are required`,
        );
      }
    }
  }

  const packageSchemaPath = join(
    canonicalRoot,
    "schemas/package-document.schema.json",
  );
  if (await pathExists(packageSchemaPath)) {
    const source = await readFile(packageSchemaPath, "utf8");
    for (const required of ["524288", "4194304", "67108864", "256"]) {
      if (!source.includes(required)) {
        violations.push(
          `contracts/enterprise-gateway/v1alpha1/schemas/package-document.schema.json: missing safety limit ${required}`,
        );
      }
    }
  }

  if (await pathExists(join(
    workspaceRoot,
    "packages/contracts/src/enterprise-gateway",
  ))) {
    violations.push(
      "packages/contracts/src/enterprise-gateway: a second editable Enterprise Gateway canonical source is forbidden",
    );
  }

  const adrPath = join(
    workspaceRoot,
    "docs/adr/014-enterprise-client-identity-and-credential-bootstrap.md",
  );
  if (!await pathExists(adrPath)) {
    violations.push(
      "docs/adr/014-enterprise-client-identity-and-credential-bootstrap.md: accepted enterprise identity ADR is required",
    );
  } else {
    const adr = await readFile(adrPath, "utf8");
    for (const required of [
      "状态：**ACCEPTED**",
      "EnterpriseUserIdentityClient",
      "EnterpriseUserIdentityVerifier",
      "EnterpriseCredentialStore",
      "EnterpriseDeviceSigner",
      "EnterpriseDeviceTrustProvider",
      "RoboThreeAccessTokenIssuer",
    ]) {
      if (!adr.includes(required)) {
        violations.push(
          `docs/adr/014-enterprise-client-identity-and-credential-bootstrap.md: missing ${required}`,
        );
      }
    }
  }

  return violations;
}

async function collectCgf12aViolations(workspaceRoot) {
  const planPath = join(
    workspaceRoot,
    "docs/architecture/CGF-1.2-DEVELOPMENT-PLAN.md",
  );
  if (!await pathExists(planPath)) return [];
  const plan = await readFile(planPath, "utf8");
  if (!plan.includes("CGF-1.2A 已获用户授权")) return [];

  const violations = [];
  for (const file of [
    "packages/contracts/src/desktop-local/v1alpha2/common.ts",
    "packages/contracts/src/desktop-local/v1alpha2/control.ts",
    "packages/contracts/src/desktop-local/v1alpha2/enterprise-configuration.ts",
    "packages/contracts/src/desktop-local/v1alpha2/index.ts",
    "packages/contracts/fixtures/desktop-local/v1alpha2/valid.json",
    "packages/contracts/fixtures/desktop-local/v1alpha2/invalid.json",
    "services/core/src/ports/enterprise-access-token-provider.ts",
    "services/core/src/application/enterprise-configuration-token-session.ts",
    "services/core/src/application/enterprise-configuration-status.ts",
  ]) {
    if (!await pathExists(join(workspaceRoot, file))) {
      violations.push(`${file}: CGF-1.2A Contract and local lifecycle boundary is required`);
    }
  }

  const exactPackageSchema = join(
    workspaceRoot,
    "contracts/enterprise-gateway/v1alpha1/schemas/exact-package-read.schema.json",
  );
  if (await pathExists(exactPackageSchema)) {
    const source = await readFile(exactPackageSchema, "utf8");
    for (const required of [
      '"additionalProperties": false',
      '"snapshotId"',
      '"snapshotRevision"',
      '"snapshotDigest"',
      '"packageRevision"',
      '"packageDigest"',
    ]) {
      if (!source.includes(required)) {
        violations.push(
          `contracts/enterprise-gateway/v1alpha1/schemas/exact-package-read.schema.json: missing exact immutable reference ${required}`,
        );
      }
    }
    if (source.includes('"latest"')) {
      violations.push(
        "contracts/enterprise-gateway/v1alpha1/schemas/exact-package-read.schema.json: latest package resolution is forbidden",
      );
    }
  }

  const desktopV2Root = join(
    workspaceRoot,
    "packages/contracts/src/desktop-local/v1alpha2",
  );
  if (await pathExists(desktopV2Root)) {
    const files = await collectSourceFiles(desktopV2Root);
    const source = (await Promise.all(
      files.map((file) => readFile(file, "utf8")),
    )).join("\n");
    for (const forbidden of [
      "compactToken",
      "credentialRef",
      "TaskCapabilityLock",
      "RegistrySnapshot",
      "storagePath",
      "databasePath",
    ]) {
      if (source.includes(forbidden)) {
        violations.push(
          `packages/contracts/src/desktop-local/v1alpha2: ${forbidden} must not enter the Desktop configuration status Contract`,
        );
      }
    }
  }

  const kernelRoot = join(workspaceRoot, "services/core/src/kernel");
  if (await pathExists(kernelRoot)) {
    const kernelFiles = await collectSourceFiles(kernelRoot);
    for (const file of kernelFiles) {
      const source = await readFile(file, "utf8");
      if (
        source.includes("EnterpriseConfiguration")
        || source.includes("enterprise-configuration")
        || source.includes("enterprise_configuration")
      ) {
        violations.push(
          `${relative(workspaceRoot, file)}: enterprise configuration orchestration must remain outside Kernel`,
        );
      }
    }
  }

  return violations;
}

async function collectCgf12bViolations(workspaceRoot) {
  const planPath = join(
    workspaceRoot,
    "docs/architecture/CGF-1.2-DEVELOPMENT-PLAN.md",
  );
  if (!await pathExists(planPath)) return [];
  const plan = await readFile(planPath, "utf8");
  if (!plan.includes("CGF-1.2B 已获用户授权")) return [];

  const violations = [];
  for (const file of [
    "packages/contracts/src/enterprise-configuration-consumer/v1alpha1.ts",
    "services/core/src/application/configuration-validator.ts",
    "services/core/src/application/package-materializer.ts",
    "services/core/src/ports/enterprise-configuration-persistence.ts",
    "services/core/src/adapters/memory/in-memory-enterprise-configuration-persistence.ts",
    "services/core/src/adapters/sqlite/enterprise-configuration-migrations.ts",
    "services/core/src/adapters/sqlite/enterprise-configuration-schema-preflight.ts",
    "services/core/src/adapters/sqlite/sqlite-enterprise-configuration-persistence.ts",
    "services/core/tests/enterprise-configuration-persistence.conformance.test.ts",
  ]) {
    if (!await pathExists(join(workspaceRoot, file))) {
      violations.push(`${file}: CGF-1.2B local materialization boundary is required`);
    }
  }

  const sqliteRoot = join(workspaceRoot, "services/core/src/adapters/sqlite");
  const sqliteFiles = await collectSourceFiles(sqliteRoot);
  const enterpriseFiles = sqliteFiles.filter((file) =>
    file.includes("enterprise-configuration"));
  const sqliteSource = (await Promise.all(
    enterpriseFiles.map((file) => readFile(file, "utf8")),
  )).join("\n");
  for (const required of [
    "enterprise_configuration_schema_migrations",
    "enterprise-config-V1",
    "enterprise_configuration_candidates",
    "enterprise_configuration_scope_pointers",
    "enterprise_configuration_status_events",
  ]) {
    if (!sqliteSource.includes(required)) {
      violations.push(
        `services/core/src/adapters/sqlite: CGF-1.2B independent configuration persistence requires ${required}`,
      );
    }
  }
  if (/\bATTACH\b/u.test(sqliteSource)) {
    violations.push(
      "services/core/src/adapters/sqlite: CGF-1.2B enterprise configuration persistence must not create cross-database transactions",
    );
  }
  if (sqliteSource.includes("pendingRuntimeActivation")) {
    violations.push(
      "services/core/src/adapters/sqlite: pendingRuntimeActivation must remain derived and must not become a persisted fact",
    );
  }

  return violations;
}

async function collectCgf12cViolations(workspaceRoot) {
  const planPath = join(
    workspaceRoot,
    "docs/architecture/CGF-1.2-DEVELOPMENT-PLAN.md",
  );
  if (!await pathExists(planPath)) return [];
  const plan = await readFile(planPath, "utf8");
  if (!plan.includes("CGF-1.2C 已获用户授权")) return [];

  const violations = [];
  for (const file of [
    "services/core/src/ports/enterprise-configuration-client.ts",
    "services/core/src/adapters/http/http-enterprise-configuration-client.ts",
    "services/core/src/application/enterprise-configuration-sync-coordinator.ts",
    "services/core/tests/http-enterprise-configuration-client.integration.test.ts",
    "services/core/tests/enterprise-configuration-sync-coordinator.test.ts",
    "services/core/tests/e2e/cgf12c-java-node-runner.mjs",
    "services/central-service/src/test/java/com/robothree/central/configuration/Cgf12cJavaNodeE2e.java",
    "scripts/run-cgf12c-e2e.mjs",
  ]) {
    if (!await pathExists(join(workspaceRoot, file))) {
      violations.push(`${file}: CGF-1.2C transport and recovery Harness is required`);
    }
  }

  const adapterPath = join(
    workspaceRoot,
    "services/core/src/adapters/http/http-enterprise-configuration-client.ts",
  );
  if (await pathExists(adapterPath)) {
    const source = await readFile(adapterPath, "utf8");
    for (const required of [
      'redirect: "manual"',
      "AbortController",
      "content-length",
      "readBoundedBytes",
      "assertReadyToSeal",
    ]) {
      if (!source.includes(required)) {
        violations.push(
          `services/core/src/adapters/http/http-enterprise-configuration-client.ts: missing fail-closed transport boundary ${required}`,
        );
      }
    }
    if (source.includes('redirect: "follow"')) {
      violations.push(
        "services/core/src/adapters/http/http-enterprise-configuration-client.ts: enterprise bearer requests must not follow redirects",
      );
    }
  }

  const migrationPath = join(
    workspaceRoot,
    "services/core/src/adapters/sqlite/enterprise-configuration-migrations.ts",
  );
  if (await pathExists(migrationPath)) {
    const source = await readFile(migrationPath, "utf8");
    if (!source.includes("enterprise-config-V2")
      || !source.includes("last_successful_sync_at")
      || !source.includes("last_error_code")) {
      violations.push(
        "services/core/src/adapters/sqlite/enterprise-configuration-migrations.ts: CGF-1.2C requires a forward-only V2 sync-facts migration",
      );
    }
  }

  return violations;
}

async function collectCgf0Violations(workspaceRoot) {
  const violations = [];
  const centralRoot = join(workspaceRoot, "services/central-service");
  if (!await pathExists(centralRoot)) {
    return violations;
  }

  const pomPath = join(centralRoot, "pom.xml");
  const javaVersionPath = join(workspaceRoot, ".java-version");
  const packageJsonPath = join(workspaceRoot, "package.json");
  const javaToolchainPath = join(workspaceRoot, "scripts/java-toolchain.mjs");
  const applicationConfigPath = join(centralRoot, "src/main/resources/application.yaml");
  const controllerPath = join(
    centralRoot,
    "src/main/java/com/robothree/central/compatibility/FoundationFixtureController.java",
  );
  const migrationPath = join(centralRoot, "src/main/resources/db/migration");
  const cgf11PlanPath = join(
    workspaceRoot,
    "docs/architecture/CGF-1.1-DEVELOPMENT-PLAN.md",
  );
  const cgf11Plan = await pathExists(cgf11PlanPath)
    ? await readFile(cgf11PlanPath, "utf8")
    : "";
  const cgf11Authorized = /CONFIRMED — CGF-1\.1[ABCD] AUTHORIZED/.test(cgf11Plan)
    || cgf11Plan.includes("CLOSED — CGF-1.1");

  if (!await pathExists(pomPath)) {
    violations.push("services/central-service/pom.xml: CGF-0 must have a reproducible Java build");
  } else {
    const pom = await readFile(pomPath, "utf8");
    const forbiddenDependencies = [
      "spring-boot-starter-data-jpa",
      "spring-boot-starter-security",
      "spring-ai",
      "modelcontextprotocol",
    ];
    if (!cgf11Authorized) {
      forbiddenDependencies.push("spring-boot-starter-jdbc");
    }
    for (const dependency of forbiddenDependencies) {
      if (pom.includes(dependency)) {
        violations.push(
          `services/central-service/pom.xml: CGF-0 fixture scaffold must not add ${dependency}`,
        );
      }
    }
  }

  if (!await pathExists(javaVersionPath)) {
    violations.push(".java-version: Central development must declare its Java major");
  } else if ((await readFile(javaVersionPath, "utf8")).trim() !== "21") {
    violations.push(".java-version: CGF requires the declared Java major to remain 21");
  }

  if (!await pathExists(javaToolchainPath)) {
    violations.push("scripts/java-toolchain.mjs: portable Java toolchain validation is required");
  } else {
    const source = await readFile(javaToolchainPath, "utf8");
    if (source.includes("/private/tmp") || source.includes("/Users/")) {
      violations.push(
        "scripts/java-toolchain.mjs: Java toolchain discovery must not hardcode a developer-machine path",
      );
    }
  }

  if (await pathExists(packageJsonPath)) {
    const rootPackage = JSON.parse(await readFile(packageJsonPath, "utf8"));
    if (rootPackage.scripts?.["check:central"] !== "node scripts/run-central-check.mjs") {
      violations.push(
        "package.json: check:central must use portable Java discovery instead of invoking Maven with an ambient machine path",
      );
    }
  }

  if (!await pathExists(applicationConfigPath)) {
    violations.push("services/central-service/src/main/resources/application.yaml: CGF-0 loopback binding is required");
  } else {
    const source = await readFile(applicationConfigPath, "utf8");
    if (!source.includes("address: 127.0.0.1")) {
      violations.push(
        "services/central-service/src/main/resources/application.yaml: CGF-0 must bind only to loopback",
      );
    }
    if (!source.includes("ROBOTHREE_CGF_FIXTURE_PORT:0")) {
      violations.push(
        "services/central-service/src/main/resources/application.yaml: CGF-0 must default to an ephemeral port",
      );
    }
  }

  if (!await pathExists(controllerPath)) {
    violations.push(
      "services/central-service/src/main/java/com/robothree/central/compatibility/FoundationFixtureController.java: marked CGF-0 fixture endpoints are required",
    );
  } else {
    const fixtureAssemblerPath = join(
      centralRoot,
      "src/main/java/com/robothree/central/compatibility/FoundationFixtureResponseAssembler.java",
    );
    const fixtureResponseSource = await pathExists(fixtureAssemblerPath)
      ? await readFile(fixtureAssemblerPath, "utf8")
      : "";
    if (!fixtureResponseSource.includes('header("X-RoboThree-Fixture", "true")')) {
      violations.push(
        "services/central-service/src/main/java/com/robothree/central/compatibility/FoundationFixtureResponseAssembler.java: CGF-0 responses must be explicitly marked as fixtures",
      );
    }
  }

  if (await pathExists(migrationPath) && !cgf11Authorized) {
    violations.push(
      "services/central-service/src/main/resources/db/migration: CGF-0 must not introduce persistence or formal configuration schema",
    );
  }

  return violations;
}

async function collectCgf11aViolations(workspaceRoot) {
  const planPath = join(
    workspaceRoot,
    "docs/architecture/CGF-1.1-DEVELOPMENT-PLAN.md",
  );
  if (!await pathExists(planPath)) {
    return [];
  }
  const plan = await readFile(planPath, "utf8");
  const cgf11Closed = plan.includes("CLOSED — CGF-1.1");
  if (!/CONFIRMED — CGF-1\.1[ABCD] AUTHORIZED/.test(plan) && !cgf11Closed) {
    return [];
  }
  const cgf11bAuthorized = cgf11Closed
    || /CONFIRMED — CGF-1\.1[BCD] AUTHORIZED/.test(plan);
  const cgf11cAuthorized = cgf11Closed
    || /CONFIRMED — CGF-1\.1[CD] AUTHORIZED/.test(plan);
  const cgf11dAuthorized = cgf11Closed
    || plan.includes("CONFIRMED — CGF-1.1D AUTHORIZED");

  const violations = [];
  const centralRoot = join(workspaceRoot, "services/central-service");
  const pomPath = join(centralRoot, "pom.xml");
  const pom = await readFile(pomPath, "utf8");
  for (const required of [
    "spring-boot-starter-jdbc",
    "mybatis-plus-spring-boot3-starter",
    "postgresql",
    "testcontainers",
    "embedded-postgres",
  ]) {
    if (!pom.includes(required)) {
      violations.push(`services/central-service/pom.xml: CGF-1.1A requires ${required}`);
    }
  }
  for (const forbidden of [
    "spring-boot-starter-data-jpa",
    "hibernate-core",
    "spring-ai",
    "modelcontextprotocol",
  ]) {
    if (pom.includes(forbidden)) {
      violations.push(`services/central-service/pom.xml: CGF-1.1A must not add ${forbidden}`);
    }
  }

  const requiredMigrations = cgf11bAuthorized
    ? ["V1", "V2", "V3", "V4", "V5"]
    : ["V1", "V2", "V3", "V4"];
  const legacyMigrationRoot = join(
    centralRoot,
    "deploy/sql/postgresql/legacy-flyway",
  );
  for (const version of requiredMigrations) {
    const files = await pathExists(legacyMigrationRoot)
      ? await readdir(legacyMigrationRoot)
      : [];
    if (!files.some((file) => file.startsWith(`${version}__`) && file.endsWith(".sql"))) {
      violations.push(
        `services/central-service/deploy/sql/postgresql/legacy-flyway: CGF-1.1 history requires frozen ${version} audit SQL`,
      );
    }
  }

  const migrationRoot = join(centralRoot, "src/main/resources/db/migration");
  const governedSqlRoot = join(centralRoot, "deploy/sql/postgresql");
  if (await pathExists(governedSqlRoot)) {
    const migrationFiles = await collectFilesByExtension(
      governedSqlRoot,
      new Set([".sql"]),
    );
    for (const migrationFile of migrationFiles) {
      const source = (await readFile(migrationFile, "utf8")).toLowerCase();
      for (const forbidden of [
        "token_plaintext",
        "bearer_token",
        "private_key",
        "keychain_handle",
        "provider_reference",
        "oa_password",
      ]) {
        if (source.includes(forbidden)) {
          violations.push(
            `${relative(workspaceRoot, migrationFile)}: CGF-1.1A must not persist ${forbidden}`,
          );
        }
      }
    }
  }

  for (const requiredFile of [
    "src/main/java/com/robothree/central/persistence/mybatis/configuration/CentralMyBatisPersistenceConfiguration.java",
    "src/main/java/com/robothree/central/persistence/mybatis/schema/CentralSchemaPreflight.java",
    "src/main/java/com/robothree/central/persistence/mybatis/transaction/SpringCentralTransactionRunner.java",
    "src/main/java/com/robothree/central/persistence/mybatis/adapter/MyBatisAuthenticationPersistence.java",
    "src/main/java/com/robothree/central/persistence/mybatis/adapter/MyBatisConfigurationPersistence.java",
    "src/main/java/com/robothree/central/persistence/memory/InMemoryCentralPersistence.java",
  ]) {
    if (!await pathExists(join(centralRoot, requiredFile))) {
      violations.push(`services/central-service/${requiredFile}: CGF-1.1A persistence component is required`);
    }
  }

  const sourceRoot = join(centralRoot, "src/main/java");
  const sourceFiles = await collectFilesByExtension(sourceRoot, new Set([".java"]));
  for (const filePath of sourceFiles) {
    const source = await readFile(filePath, "utf8");
    const relativePath = relative(workspaceRoot, filePath);
    if (
      /\/(?:domain|application)\//u.test(relativePath)
      && /(?:org\.springframework\.jdbc|javax\.sql|org\.flywaydb|org\.testcontainers)/u.test(source)
    ) {
      violations.push(
        `${relativePath}: CGF-1.1A domain/application must not depend on JDBC, Flyway, DataSource or Testcontainers`,
      );
    }
    for (const forbidden of [
      "@Entity",
      "getPrivateKey(",
      "resolvePrivateKey(",
      "exportPrivateKey(",
    ]) {
      if (source.includes(forbidden)) {
        violations.push(`${relativePath}: CGF-1.1A forbids ${forbidden}`);
      }
    }
  }

  const forbiddenPaths = [];
  if (!cgf11cAuthorized) {
    forbiddenPaths.push(
      "src/main/java/com/robothree/central/configuration/adapter/http",
    );
  }
  if (!cgf11bAuthorized) {
    forbiddenPaths.push(
      "src/main/java/com/robothree/central/authentication/adapter/http",
    );
  }
  for (const forbiddenPath of forbiddenPaths) {
    if (await pathExists(join(centralRoot, forbiddenPath))) {
      violations.push(
        `services/central-service/${forbiddenPath}: CGF-1.1A must not implement formal identity or configuration routes`,
      );
    }
  }

  if (cgf11bAuthorized) {
    const requiredBFiles = [
      "src/main/java/com/robothree/central/authentication/application/IssueDeviceChallengeService.java",
      "src/main/java/com/robothree/central/authentication/application/ManualDeviceEnrollmentService.java",
      "src/main/java/com/robothree/central/authentication/adapter/security/Es256DeviceProofVerifier.java",
      "src/main/java/com/robothree/central/authentication/adapter/http/EnterpriseIdentityController.java",
      "src/main/java/com/robothree/central/authentication/port/EnterpriseDeviceTrustProvider.java",
      "src/main/java/com/robothree/central/authentication/port/EnterpriseUserIdentityVerifier.java",
    ];
    for (const requiredFile of requiredBFiles) {
      if (!await pathExists(join(centralRoot, requiredFile))) {
        violations.push(
          `services/central-service/${requiredFile}: CGF-1.1B component is required`,
        );
      }
    }
    const bSource = (
      await Promise.all(sourceFiles.map((filePath) => readFile(filePath, "utf8")))
    ).join("\n");
    for (const requiredError of [
      "device_not_managed",
      "device_not_compliant",
      "device_access_denied",
      "device_challenge_expired",
      "device_challenge_replayed",
      "device_proof_invalid",
      "device_context_mismatch",
    ]) {
      if (!bSource.includes(`"${requiredError}"`)) {
        violations.push(
          `services/central-service/src/main/java: CGF-1.1B requires typed error ${requiredError}`,
        );
      }
    }
    const controllerPath = join(
      centralRoot,
      "src/main/java/com/robothree/central/authentication/adapter/http/EnterpriseIdentityController.java",
    );
    if (await pathExists(controllerPath)) {
      const controller = await readFile(controllerPath, "utf8");
      for (const route of ["/device-challenges", "/device-enrollment"]) {
        if (!controller.includes(`"${route}"`)) {
          violations.push(
            `${relative(workspaceRoot, controllerPath)}: CGF-1.1B requires formal ${route} route`,
          );
        }
      }
    }
  }

  if (cgf11cAuthorized) {
    const requiredCFiles = [
      "src/main/java/com/robothree/central/authentication/application/RoboThreeAccessTokenService.java",
      "src/main/java/com/robothree/central/authentication/application/RoboThreeAccessTokenValidator.java",
      "src/main/java/com/robothree/central/authentication/application/FrozenCompatibilityEvaluator.java",
      "src/main/java/com/robothree/central/authentication/port/RoboThreeAccessTokenCodec.java",
      "src/main/java/com/robothree/central/configuration/application/ConfigurationIntegrityVerifier.java",
      "src/main/java/com/robothree/central/configuration/application/ConfigurationReadService.java",
      "src/main/java/com/robothree/central/authentication/adapter/http/EnterpriseAccessTokenController.java",
      "src/main/java/com/robothree/central/configuration/adapter/http/EnterpriseConfigurationController.java",
    ];
    for (const requiredFile of requiredCFiles) {
      if (!await pathExists(join(centralRoot, requiredFile))) {
        violations.push(
          `services/central-service/${requiredFile}: CGF-1.1C component is required`,
        );
      }
    }
    const cSource = (
      await Promise.all(sourceFiles.map((filePath) => readFile(filePath, "utf8")))
    ).join("\n");
    for (const requiredError of [
      "permission_denied",
      "compatibility_mismatch",
      "access_token_invalid",
      "access_token_expired",
      "configuration_unavailable",
      "configuration_integrity_failed",
    ]) {
      if (!cSource.includes(`"${requiredError}"`)) {
        violations.push(
          `services/central-service/src/main/java: CGF-1.1C requires typed error ${requiredError}`,
        );
      }
    }
    const tokenControllerPath = join(
      centralRoot,
      "src/main/java/com/robothree/central/authentication/adapter/http/EnterpriseAccessTokenController.java",
    );
    if (await pathExists(tokenControllerPath)) {
      const controller = await readFile(tokenControllerPath, "utf8");
      for (const route of ["/compatibility", "/token"]) {
        if (!controller.includes(`"${route}"`)) {
          violations.push(
            `${relative(workspaceRoot, tokenControllerPath)}: CGF-1.1C requires formal ${route} route`,
          );
        }
      }
    }
    const configurationControllerPath = join(
      centralRoot,
      "src/main/java/com/robothree/central/configuration/adapter/http/EnterpriseConfigurationController.java",
    );
    if (await pathExists(configurationControllerPath)) {
      const controller = await readFile(configurationControllerPath, "utf8");
      if (!controller.includes('"/configuration"')) {
        violations.push(
          `${relative(workspaceRoot, configurationControllerPath)}: CGF-1.1C requires formal /configuration route`,
        );
      }
      const bearerFilterPath = join(
        centralRoot,
        "src/main/java/com/robothree/central/shared/adapter/http/EnterpriseBearerTokenFilter.java",
      );
      const responseAssemblerPath = join(
        centralRoot,
        "src/main/java/com/robothree/central/configuration/adapter/http/EnterpriseConfigurationResponseAssembler.java",
      );
      const bearerFilter = await pathExists(bearerFilterPath)
        ? await readFile(bearerFilterPath, "utf8")
        : "";
      const responseAssembler = await pathExists(responseAssemblerPath)
        ? await readFile(responseAssemblerPath, "utf8")
        : "";
      if (!bearerFilter.includes("HttpHeaders.AUTHORIZATION")) {
        violations.push(
          `${relative(workspaceRoot, bearerFilterPath)}: CGF-1.1C configuration route requires centralized Authorization extraction`,
        );
      }
      if (!controller.includes("HttpHeaders.IF_NONE_MATCH")) {
        violations.push(
          `${relative(workspaceRoot, configurationControllerPath)}: CGF-1.1C configuration route requires If-None-Match`,
        );
      }
      if (!responseAssembler.includes("HttpHeaders.ETAG")) {
        violations.push(
          `${relative(workspaceRoot, responseAssemblerPath)}: CGF-1.1C configuration response requires ETag`,
        );
      }
      if (!cSource.includes('"configuration.read"')) {
        violations.push(
          "services/central-service/src/main/java: CGF-1.1C configuration route requires configuration.read",
        );
      }
    }
  }

  if (cgf11dAuthorized) {
    const recoveryConformancePath = join(
      centralRoot,
      "src/test/java/com/robothree/central/persistence/Cgf11dPostgreSqlRecoveryConformance.java",
    );
    if (!await pathExists(recoveryConformancePath)) {
      violations.push(
        "services/central-service/src/test/java/com/robothree/central/persistence/Cgf11dPostgreSqlRecoveryConformance.java: CGF-1.1D requires the real PostgreSQL recovery matrix",
      );
    } else {
      const recovery = await readFile(recoveryConformancePath, "utf8");
      for (const required of [
        "AFTER_IDENTITY_COMMIT",
        "AFTER_ENROLLMENT_CHALLENGE_COMMIT",
        "AFTER_DEVICE_ENROLLMENT_COMMIT",
        "AFTER_TOKEN_CHALLENGE_COMMIT",
        "BEFORE_TOKEN_COMMIT",
        "AFTER_TOKEN_COMMIT_BEFORE_RESPONSE",
        "AFTER_CONFIGURATION_SEED_COMMIT",
        "assertDatabaseDoesNotContain",
        "newFixedThreadPool(8)",
      ]) {
        if (!recovery.includes(required)) {
          violations.push(
            `${relative(workspaceRoot, recoveryConformancePath)}: CGF-1.1D recovery matrix requires ${required}`,
          );
        }
      }
    }

    for (const integrationTest of [
      "src/test/java/com/robothree/central/persistence/PostgreSqlMyBatisPersistenceIntegrationTest.java",
      "src/test/java/com/robothree/central/persistence/EmbeddedPostgreSqlMyBatisPersistenceIntegrationTest.java",
    ]) {
      const integrationPath = join(centralRoot, integrationTest);
      if (!await pathExists(integrationPath)) {
        violations.push(
          `services/central-service/${integrationTest}: CGF-1.1D requires the MyBatis PostgreSQL recovery path`,
        );
        continue;
      }
      const source = await readFile(integrationPath, "utf8");
      if (
        !source.includes("Cgf11dPostgreSqlRecoveryConformance.verify(")
        || !source.includes("CentralPersistenceVariants::myBatis")
      ) {
        violations.push(
          `services/central-service/${integrationTest}: CGF-1.1D must run the same recovery matrix against this PostgreSQL path`,
        );
      }
    }

    if (await pathExists(migrationRoot)) {
      const migrationFiles = await readdir(migrationRoot);
      for (const migrationFile of migrationFiles) {
        violations.push(
          `services/central-service/src/main/resources/db/migration/${migrationFile}: Alignment-2A requires external governed SQL and forbids runtime migration resources`,
        );
      }
    }

    const mainSource = (
      await Promise.all(sourceFiles.map((filePath) => readFile(filePath, "utf8")))
    ).join("\n");
    for (const testOnlyHook of [
      "NamedCrash",
      "AFTER_TOKEN_COMMIT_BEFORE_RESPONSE",
      "failAfterWorkBeforeCommit",
    ]) {
      if (mainSource.includes(testOnlyHook)) {
        violations.push(
          `services/central-service/src/main/java: CGF-1.1D test fault hook ${testOnlyHook} must not enter production code`,
        );
      }
    }
  }

  return violations;
}

async function collectDcf0Violations(workspaceRoot) {
  const violations = [];
  const desktopRoot = join(workspaceRoot, "apps/desktop");
  if (!await pathExists(desktopRoot)) {
    return violations;
  }

  const rendererRoot = join(desktopRoot, "src/renderer");
  const rendererFiles = await collectSourceFiles(rendererRoot);
  for (const filePath of rendererFiles) {
    const source = await readFile(filePath, "utf8");
    const references = collectModuleReferences(source, filePath);
    for (const reference of references) {
      if (reference.specifier === undefined) {
        violations.push(formatViolation(
          filePath,
          workspaceRoot,
          reference,
          "Desktop Renderer dynamic module references must use string literals",
        ));
        continue;
      }
      const specifier = reference.specifier;
      if (
        isBuiltin(specifier)
        || matchesPackage(specifier, "electron")
        || specifier.startsWith("@robothree/contracts/desktop-private/")
        || specifier === "@robothree/contracts/reasoning-mode/v1alpha1"
        || specifier === "@robothree/contracts/runtime-selection/v1alpha2"
        || specifier === "@robothree/contracts/submit-turn-coordination/v1alpha3"
        || /(?:^|\/)(?:main|preload)(?:\/|$)/u.test(specifier)
      ) {
        violations.push(formatViolation(
          filePath,
          workspaceRoot,
          reference,
          "Desktop Renderer must not import Node, Electron, Main, or Preload capabilities",
        ));
      }
    }
    if (/\b(?:fetch|WebSocket|EventSource)\s*\(/u.test(source) || source.includes("ipcRenderer")) {
      violations.push(
        `${relative(workspaceRoot, filePath)}: Desktop Renderer must use the typed Preload API instead of direct transport or IPC`,
      );
    }
  }

  const preloadRoot = join(desktopRoot, "src/preload");
  const preloadFiles = await collectSourceFiles(preloadRoot);
  for (const filePath of preloadFiles) {
    const source = await readFile(filePath, "utf8");
    const references = collectModuleReferences(source, filePath);
    for (const reference of references) {
      if (
        reference.specifier !== undefined
        && (
          isBuiltin(reference.specifier)
          || reference.specifier === "@robothree/contracts/desktop-private/personal-credential-broker-v1"
          || reference.specifier === "@robothree/contracts/reasoning-mode/v1alpha1"
          || reference.specifier === "@robothree/contracts/runtime-selection/v1alpha2"
          || reference.specifier === "@robothree/contracts/submit-turn-coordination/v1alpha3"
        )
      ) {
        violations.push(formatViolation(
          filePath,
          workspaceRoot,
          reference,
          "Desktop Preload must not expose filesystem, process, transport, or other Node capabilities",
        ));
      }
    }
    if (source.includes('exposeInMainWorld("ipcRenderer"') || source.includes("window.ipcRenderer")) {
      violations.push(
        `${relative(workspaceRoot, filePath)}: Desktop Preload must not expose raw ipcRenderer`,
      );
    }
  }

  const windowSecurity = join(desktopRoot, "src/main/window-security.ts");
  if (!await pathExists(windowSecurity)) {
    violations.push("apps/desktop/src/main/window-security.ts: secure BrowserWindow options are required");
  } else {
    const source = await readFile(windowSecurity, "utf8");
    const requiredGuards = [
      ["contextIsolation: true", "Desktop BrowserWindow must enable context isolation"],
      ["nodeIntegration: false", "Desktop BrowserWindow must disable Node integration"],
      ["sandbox: true", "Desktop BrowserWindow must enable Renderer sandboxing"],
      ["webSecurity: true", "Desktop BrowserWindow must keep web security enabled"],
      ["allowRunningInsecureContent: false", "Desktop BrowserWindow must reject insecure active content"],
    ];
    for (const [guard, reason] of requiredGuards) {
      if (!source.includes(guard)) {
        violations.push(`apps/desktop/src/main/window-security.ts: ${reason}`);
      }
    }
  }

  return violations;
}

async function collectKaf43Violations(workspaceRoot) {
  const violations = [];
  const boundedStream = join(
    workspaceRoot,
    "services/core/src/reliability/bounded-event-stream.ts",
  );
  if (await pathExists(boundedStream)) {
    const source = await readFile(boundedStream, "utf8");
    const requiredGuards = [
      ["MAX_SUBSCRIBER_CAPACITY", "subscriber stream must have an absolute capacity ceiling"],
      ["subscriber.buffer.length >= subscriber.capacity", "subscriber enqueue must check its configured capacity"],
      ['event.kind === "delta"', "only typed delta events may use the coalescing/drop path"],
      ['"slow_consumer"', "critical-only overflow must disconnect the slow consumer explicitly"],
    ];
    for (const [guard, reason] of requiredGuards) {
      if (!source.includes(guard)) {
        violations.push(`services/core/src/reliability/bounded-event-stream.ts: ${reason}`);
      }
    }
    const forbidden = collectModuleReferences(source, boundedStream)
      .filter((reference) => reference.specifier !== undefined
        && /(?:task-persistence|sqlite|event-publisher)/u.test(reference.specifier));
    for (const reference of forbidden) {
      violations.push(formatViolation(
        boundedStream,
        workspaceRoot,
        reference,
        "BoundedEventStream must remain a non-blocking in-process stream and not own durable persistence",
      ));
    }
  }

  const gracefulWork = join(
    workspaceRoot,
    "services/core/src/application/graceful-work-controller.ts",
  );
  if (await pathExists(gracefulWork)) {
    const source = await readFile(gracefulWork, "utf8");
    const forbidden = collectModuleReferences(source, gracefulWork)
      .filter((reference) => reference.specifier !== undefined
        && /(?:\/adapters\/|process-echo|sqlite)/u.test(reference.specifier));
    for (const reference of forbidden) {
      violations.push(formatViolation(
        gracefulWork,
        workspaceRoot,
        reference,
        "GracefulWorkController must orchestrate through ports, not concrete Adapters",
      ));
    }
  }

  const durableRuntime = join(
    workspaceRoot,
    "services/core/src/application/durable-task-runtime.ts",
  );
  if (await pathExists(durableRuntime)) {
    const source = await readFile(durableRuntime, "utf8");
    if (!source.includes("#maxCachedSnapshots") || !source.includes("this.#snapshots.size > this.#maxCachedSnapshots")) {
      violations.push(
        "services/core/src/application/durable-task-runtime.ts: in-process Task snapshots must have an explicit cache bound",
      );
    }
  }
  return violations;
}

async function collectKaf42Violations(workspaceRoot) {
  const violations = [];
  const retryCoordinator = join(
    workspaceRoot,
    "services/core/src/application/retry-coordinator.ts",
  );
  if (await pathExists(retryCoordinator)) {
    const source = await readFile(retryCoordinator, "utf8");
    const forbidden = collectModuleReferences(source, retryCoordinator)
      .filter((reference) => reference.specifier !== undefined
        && /(?:effect-coordinator|effect-executor|tool-execution-backend)/u.test(reference.specifier));
    for (const reference of forbidden) {
      violations.push(formatViolation(
        retryCoordinator,
        workspaceRoot,
        reference,
        "RetryCoordinator must not dispatch or re-execute Tool Effects",
      ));
    }
  }

  const processEcho = join(
    workspaceRoot,
    "services/core/src/adapters/process-echo/process-echo-tool-backend.ts",
  );
  if (await pathExists(processEcho)) {
    const source = await readFile(processEcho, "utf8");
    if (source.includes("#tail")) {
      violations.push(
        "services/core/src/adapters/process-echo/process-echo-tool-backend.ts: Process Echo must reject admission bypass instead of maintaining an internal Promise tail",
      );
    }
  }
  return violations;
}

function collectModuleReferences(source, filePath) {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(filePath),
  );
  const references = [];

  const addReference = (node, kind, moduleNode) => {
    const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    references.push({
      kind,
      line: position.line + 1,
      column: position.character + 1,
      specifier: moduleNode !== undefined && ts.isStringLiteralLike(moduleNode) ? moduleNode.text : undefined,
    });
  };

  const visit = (node) => {
    if (ts.isImportDeclaration(node) && node.moduleSpecifier !== undefined) {
      addReference(node, "import", node.moduleSpecifier);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined) {
      addReference(node, "export", node.moduleSpecifier);
    } else if (
      ts.isImportEqualsDeclaration(node)
      && ts.isExternalModuleReference(node.moduleReference)
    ) {
      addReference(node, "import-equals", node.moduleReference.expression);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      addReference(node, "dynamic-import", node.arguments[0]);
    } else if (
      ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === "require"
    ) {
      addReference(node, "require", node.arguments[0]);
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return references;
}

function contractsViolationReason(specifier) {
  if (isBuiltin(specifier)) {
    return "contracts must not depend on Node system APIs";
  }
  if (matchesPackage(specifier, "electron")) {
    return "contracts must not depend on Electron";
  }
  if (matchesPackage(specifier, "@robothree/core")) {
    return "contracts must not depend on Core implementation";
  }
  if (matchesAnyPackage(specifier, ["better-sqlite3", "openai"])) {
    return "contracts must not depend on databases or provider SDKs";
  }
  return undefined;
}

function kernelViolationReason(specifier, filePath, workspaceRoot) {
  if (matchesPackage(specifier, "electron")) {
    return "kernel must not depend on Electron";
  }
  if (stripNodePrefix(specifier) === "sqlite") {
    return "kernel must not depend directly on SQLite";
  }
  if (["child_process", "cluster", "net", "tls", "worker_threads"].includes(stripNodePrefix(specifier))) {
    return "kernel must not depend on process or transport APIs";
  }
  if (matchesAnyPackage(specifier, ["better-sqlite3", "openai"])) {
    return "kernel must depend on provider ports, not concrete SDKs";
  }

  const adaptersRoot = join(workspaceRoot, "services/core/src/adapters");
  const applicationRoot = join(workspaceRoot, "services/core/src/application");
  const apiRoot = join(workspaceRoot, "services/core/src/api");
  const registryRoot = join(workspaceRoot, "services/core/src/registry");
  const reliabilityRoot = join(workspaceRoot, "services/core/src/reliability");
  const resolvedImport = resolveLocalModule(filePath, specifier);
  if (resolvedImport !== undefined && isWithin(resolvedImport, adaptersRoot)) {
    return "kernel must depend on ports, never concrete adapters";
  }
  if (resolvedImport !== undefined && isWithin(resolvedImport, applicationRoot)) {
    return "kernel must not depend on application orchestration or authorization";
  }
  if (resolvedImport !== undefined && isWithin(resolvedImport, apiRoot)) {
    return "kernel must not depend on delivery APIs";
  }
  if (resolvedImport !== undefined && isWithin(resolvedImport, registryRoot)) {
    return "kernel must not depend on application registry or runtime handles";
  }
  if (resolvedImport !== undefined && isWithin(resolvedImport, reliabilityRoot)) {
    return "kernel must not depend on reliability orchestration or subscriber streams";
  }
  if (
    matchesPackage(specifier, "@robothree/core")
    && /(?:^|\/)(?:adapters|api)(?:\/|$)/u.test(specifier)
  ) {
    return "kernel must not reach Core adapters or delivery APIs through package imports";
  }
  return undefined;
}

function collectForbiddenContractDeclarations(source, filePath, workspaceRoot) {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(filePath),
  );
  const violations = [];
  const visit = (node) => {
    const forbiddenDeclarationReasons = new Map([
      ["RuntimeAdapterHandle", "RuntimeAdapterHandle must not enter contracts"],
      ["SelectedSkillContext", "SelectedSkillContext must remain Core-internal and must not enter contracts"],
    ]);
    const declarationName = (
      ts.isInterfaceDeclaration(node)
      || ts.isTypeAliasDeclaration(node)
      || ts.isClassDeclaration(node)
      || ts.isEnumDeclaration(node)
    )
      ? node.name?.text
      : undefined;
    const reason = declarationName === undefined
      ? undefined
      : forbiddenDeclarationReasons.get(declarationName);
    if (reason !== undefined) {
      const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      violations.push(
        `${relative(workspaceRoot, filePath)}:${position.line + 1}:${position.character + 1} [declaration] ${reason}`,
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return violations;
}

function resolveLocalModule(filePath, specifier) {
  if (!specifier.startsWith(".") && !isAbsolute(specifier)) {
    return undefined;
  }
  return resolve(dirname(filePath), specifier);
}

function isWithin(candidate, root) {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot === "" || (!pathFromRoot.startsWith("..") && !isAbsolute(pathFromRoot));
}

function matchesAnyPackage(specifier, packages) {
  return packages.some((packageName) => matchesPackage(specifier, packageName));
}

function matchesPackage(specifier, packageName) {
  return specifier === packageName || specifier.startsWith(`${packageName}/`);
}

function stripNodePrefix(specifier) {
  return specifier.startsWith("node:") ? specifier.slice(5) : specifier;
}

function formatViolation(filePath, workspaceRoot, reference, reason) {
  return `${relative(workspaceRoot, filePath)}:${reference.line}:${reference.column} [${reference.kind}] ${reason}`;
}

async function collectSourceFiles(directory) {
  return collectFilesByExtension(directory, sourceExtensions);
}

async function collectFilesByExtension(directory, extensions) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFilesByExtension(path, extensions)));
    } else if (entry.isFile() && extensions.has(extname(path))) {
      files.push(path);
    }
  }

  return files.sort();
}

async function pathExists(path) {
  return access(path).then(
    () => true,
    () => false,
  );
}

function scriptKindFor(filePath) {
  switch (extname(filePath)) {
    case ".js":
    case ".cjs":
    case ".mjs":
      return ts.ScriptKind.JS;
    case ".jsx":
      return ts.ScriptKind.JSX;
    case ".tsx":
      return ts.ScriptKind.TSX;
    default:
      return ts.ScriptKind.TS;
  }
}

const isMain = process.argv[1] !== undefined
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  const violations = await runBoundaryChecks();
  if (violations.length > 0) {
    console.error(violations.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("Architecture boundary checks passed.");
  }
}
