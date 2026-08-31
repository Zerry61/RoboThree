import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveJavaToolchain } from "./java-toolchain.mjs";

const workspaceRoot = fileURLToPath(new URL("../", import.meta.url));
const providerResources = Object.freeze([
  "ROBOTHREE_CGF2B2_DIRECT_PROVIDER_KEY",
  "ROBOTHREE_CGF2B2_DIRECT_PROVIDER_ENDPOINT",
  "ROBOTHREE_CGF2B2_DIRECT_PROVIDER_PROTOCOL",
  "ROBOTHREE_CGF2B2_DIRECT_PROVIDER_MODEL_ID",
]);
const requiredFiles = Object.freeze([
  "apps/desktop/node_modules/.bin/electron",
  "apps/desktop/dist/main/index.js",
  "apps/desktop/dist/main/preload-smoke.js",
  "apps/desktop/dist/preload/index.cjs",
  "apps/desktop/dist/renderer/index.html",
  "services/core/dist/desktop-private-main.js",
  "services/central-service/mvnw",
]);

const declaredNode = (await readFile(join(workspaceRoot, ".node-version"), "utf8")).trim();
const missingResources = providerResources.filter((name) => !present(process.env[name]));
const missingFiles = [];
for (const relativePath of requiredFiles) {
  try {
    await access(join(workspaceRoot, relativePath));
  } catch {
    missingFiles.push(relativePath);
  }
}

const [rootPackage, desktopPackage] = await Promise.all([
  json("package.json"),
  json("apps/desktop/package.json"),
]);
const java = await javaState();
const protocol = process.env.ROBOTHREE_CGF2B2_DIRECT_PROVIDER_PROTOCOL;
const protocolValid = protocol === undefined
  || protocol === "OPENAI_COMPATIBLE"
  || protocol === "ANTHROPIC_COMPATIBLE";
const electronLaunchSanitized = [
  rootPackage.scripts?.["e2e:mvp-vs1"],
  desktopPackage.scripts?.start,
  desktopPackage.scripts?.["smoke:preload"],
].every((command) => typeof command === "string"
  && command.includes("env -u ELECTRON_RUN_AS_NODE"));
const codeReady = process.version === `v${declaredNode}`
  && java.ready
  && missingFiles.length === 0
  && electronLaunchSanitized;
const resourceReady = missingResources.length === 0 && protocolValid;

process.stdout.write(`${JSON.stringify({
  status: !codeReady
    ? "CODE_GATED"
    : resourceReady ? "READY" : "RESOURCE_GATED",
  outcome: "MVP_VS1_DEMO_PREFLIGHT",
  codeReady,
  resourceReady,
  node: {
    declared: declaredNode,
    actual: process.version.replace(/^v/u, ""),
    matches: process.version === `v${declaredNode}`,
  },
  java: {
    ready: java.ready,
    major: java.major,
  },
  electronLaunchSanitized,
  missingFiles,
  missingResources,
  providerProtocolValid: protocolValid,
  sensitiveValuesReported: false,
  liveProviderRequestAttempted: false,
})}\n`);

async function json(relativePath) {
  return JSON.parse(await readFile(join(workspaceRoot, relativePath), "utf8"));
}

async function javaState() {
  try {
    const toolchain = await resolveJavaToolchain();
    return {
      ready: toolchain.expectedMajor === 21,
      major: toolchain.expectedMajor,
    };
  } catch {
    return { ready: false, major: undefined };
  }
}

function present(value) {
  return typeof value === "string" && value.trim().length > 0;
}
