import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const required = [
  "ROBOTHREE_CGF2B2_DIRECT_PROVIDER_KEY",
  "ROBOTHREE_CGF2B2_DIRECT_PROVIDER_ENDPOINT",
  "ROBOTHREE_CGF2B2_DIRECT_PROVIDER_PROTOCOL",
  "ROBOTHREE_CGF2B2_DIRECT_PROVIDER_MODEL_ID",
];

for (const name of required) {
  if (typeof process.env[name] !== "string" || process.env[name].trim() === "") {
    throw new Error("dr2_provider_environment_incomplete");
  }
}
if (process.env.ROBOTHREE_CGF2B2_DIRECT_PROVIDER_PROTOCOL !== "OPENAI_COMPATIBLE") {
  throw new Error("dr2_provider_protocol_invalid");
}

const lockfile = resolve(root, "pnpm-lock.yaml");
const before = digest(lockfile);
execFileSync("pnpm", ["run", "build"], {
  cwd: root,
  env: { ...process.env, CI: "true" },
  stdio: "inherit",
});
execFileSync("./mvnw", [
  "-q",
  "-Dtest=MvpVs1RealProviderDesktopE2E",
  "-DfailIfNoTests=false",
  "test",
], {
  cwd: resolve(root, "services/central-service"),
  env: {
    ...process.env,
    ROBOTHREE_DR2_RUN_REAL_PROVIDER: "true",
    ELECTRON_RUN_AS_NODE: undefined,
  },
  stdio: "inherit",
});
if (digest(lockfile) !== before) throw new Error("dr2_lockfile_changed");

function digest(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
