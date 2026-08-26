import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDirectory, "..");
const formalRunner = readFileSync(
  join(scriptDirectory, "run-arh333-harness.mjs"),
  "utf8",
);
const stabilityRunner = readFileSync(
  join(scriptDirectory, "run-arh333-stability-cycle.mjs"),
  "utf8",
);
const centralFixture = readFileSync(
  join(
    workspaceRoot,
    "services/central-service/src/test/java/com/robothree/central/modelgateway/recovery/"
      + "Cgf2b32DualNodeRelayRecoveryIntegrationTest.java",
  ),
  "utf8",
);
const failpointBackend = readFileSync(
  join(
    workspaceRoot,
    "services/central-service/src/test/java/com/robothree/central/modelgateway/recovery/"
      + "Cgf2b32FailpointBackend.java",
  ),
  "utf8",
);

describe("ARH-3.3.3 formal stability runner boundary", () => {
  it("runs the full M1-M8 matrix only in the three semantic replay rounds", () => {
    expect(formalRunner).toContain("for (let index = 0; index < 3; index += 1)");
    expect(formalRunner).toContain("executeFullSemanticCycle(index + 1");
    expect(formalRunner).toContain("executeLightweightStabilityCycle(");
    expect(formalRunner).not.toContain("executeFullSemanticCycle(stabilityCycleCount");
  });

  it("requires Node 24.13.0 through the workspace version file", () => {
    expect(readFileSync(join(workspaceRoot, ".node-version"), "utf8").trim())
      .toBe("24.13.0");
    expect(formalRunner).toContain("arh333.node_version_unsupported");
  });

  it("persists safe success or failure evidence without copying raw child logs", () => {
    expect(formalRunner).toContain('writeSafeEvidence("result.json"');
    expect(formalRunner).toContain('writeSafeEvidence("failure.json"');
    expect(formalRunner).toContain("stdoutDigest");
    expect(formalRunner).toContain("stderrDigest");
    expect(formalRunner).not.toContain("slice(-8_192)");
  });

  it("uses a lightweight Central takeover fixture instead of the full F1-F10 class", () => {
    expect(stabilityRunner).toContain(
      "#executesArh333LightweightTakeoverAndResourceClosure",
    );
    expect(centralFixture).toContain(
      "void executesArh333LightweightTakeoverAndResourceClosure()",
    );
    expect(centralFixture).toContain("ROBOTHREE_ARH333_CENTRAL_STABILITY_RESULT=");
    expect(centralFixture).toContain("return startAt(0, 0, environment, capturedOutputs)");
    expect(centralFixture).toContain("awaitRelayPorts(process, output)");
  });

  it("reconciles an observed stale owner from durable status without replaying execute", () => {
    expect(centralFixture).toContain("statusFirstClosureResult(node, invocationId, post(");
    expect(centralFixture).toContain("Only a stale execution owner may reconcile");
    expect(centralFixture).toContain("A fencing conflict must already have one durable terminal winner");
  });

  it("keeps every formal stability resource counter evidence-backed", () => {
    for (const metric of [
      "childProcessCount",
      "openLoopbackPortCount",
      "connectionCount",
      "recoveryLeaseCount",
      "subscriberCount",
      "bufferCount",
      "pendingTimerCount",
      "temporaryArtifactHandleCount",
    ]) {
      expect(stabilityRunner).toContain(metric);
    }
    expect(stabilityRunner).not.toContain("expect(true)");
  });

  it("uses one exact failpoint session handshake instead of blocked-state polling", () => {
    expect(failpointBackend).toContain("UUID sessionId");
    expect(failpointBackend).toContain("current.entered().await(15, TimeUnit.SECONDS)");
    expect(failpointBackend).toContain("requireSession(sessionId)");
    expect(centralFixture).toContain("/failpoint/await-blocked?sessionId=");
    expect(centralFixture).toContain("/failpoint/release?sessionId=");
    expect(centralFixture).not.toMatch(
      /awaitCondition\(\s*\(\) => get\(node, "\/cgf2b32-harness\/failpoint"/u,
    );
  });

  it("reports explicit zero counts for all four leakage channels", () => {
    for (const channel of [
      "processOutput",
      "childLogAndTrace",
      "testAndMachineEvidence",
      "safeJsonAndDiagnostics",
    ]) {
      expect(stabilityRunner).toContain(channel);
    }
    for (const marker of [
      "credential",
      "providerEndpoint",
      "contentBody",
      "absolutePath",
    ]) {
      expect(stabilityRunner).toContain(marker);
    }
    expect(formalRunner).toContain("perStabilityCycleLeakageChannelMatchCounts");
  });
});
