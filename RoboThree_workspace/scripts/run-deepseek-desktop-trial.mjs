import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import process from "node:process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const keyName = "ROBOTHREE_CGF2B2_DIRECT_PROVIDER_KEY";
const lockfile = resolve(root, "pnpm-lock.yaml");
const before = digest(lockfile);
let key = process.env[keyName]?.trim() ?? "";

try {
  if (key === "") key = await readHidden("请输入 DeepSeek API Key（输入不会显示）：");
  if (key === "") throw new Error("deepseek_api_key_required");

  const providerEnvironment = {
    ...process.env,
    [keyName]: key,
    ROBOTHREE_CGF2B2_DIRECT_PROVIDER_ENDPOINT: "https://api.deepseek.com",
    ROBOTHREE_CGF2B2_DIRECT_PROVIDER_PROTOCOL: "OPENAI_COMPATIBLE",
    ROBOTHREE_CGF2B2_DIRECT_PROVIDER_MODEL_ID: "deepseek-v4-flash",
    ROBOTHREE_DR2_RUN_INTERACTIVE_DESKTOP: "true",
    ELECTRON_RUN_AS_NODE: undefined,
  };
  const homebrewJava = "/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home";
  if ((providerEnvironment.JAVA_HOME ?? "") === "" && existsSync(homebrewJava)) {
    providerEnvironment.JAVA_HOME = homebrewJava;
    providerEnvironment.PATH = `${homebrewJava}/bin:${providerEnvironment.PATH ?? ""}`;
  }

  execFileSync("pnpm", ["run", "build"], {
    cwd: root,
    env: { ...process.env, CI: "true" },
    stdio: "inherit",
  });
  execFileSync("pnpm", ["--filter", "@robothree/desktop", "run", "build:renderer"], {
    cwd: root,
    env: {
      ...process.env,
      CI: "true",
      VITE_ROBOTHREE_RUNTIME_MODE: "local_demo",
    },
    stdio: "inherit",
  });

  process.stdout.write("\n正在启动 RoboThree 本地演示。关闭客户端后，本次模型连接会自动结束。\n");
  execFileSync("./mvnw", [
    "-q",
    "-Dtest=MvpVs1RealProviderDesktopE2E#opensInteractiveLocalDemoWithActualCentralAndDeepSeek",
    "-DfailIfNoTests=false",
    "test",
  ], {
    cwd: resolve(root, "services/central-service"),
    env: providerEnvironment,
    stdio: "inherit",
  });
  if (digest(lockfile) !== before) throw new Error("deepseek_trial_lockfile_changed");
  process.stdout.write("RoboThree DeepSeek 本地试运行已结束，API Key 未写入仓库或客户端存储。\n");
} finally {
  key = "";
  delete process.env[keyName];
}

function digest(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

async function readHidden(prompt) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("deepseek_trial_requires_interactive_terminal");
  }
  process.stdout.write(`${prompt}\n`);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");
  return await new Promise((resolveSecret, reject) => {
    let value = "";
    const finish = (error) => {
      process.stdin.off("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write("\n");
      if (error === undefined) resolveSecret(value.trim());
      else reject(error);
    };
    const onData = (chunk) => {
      if (chunk === "\u0003") return finish(new Error("deepseek_trial_cancelled"));
      if (chunk === "\r" || chunk === "\n") return finish();
      if (chunk === "\u007f") {
        value = value.slice(0, -1);
        return;
      }
      if (!chunk.startsWith("\u001b")) value += chunk;
    };
    process.stdin.on("data", onData);
  });
}
