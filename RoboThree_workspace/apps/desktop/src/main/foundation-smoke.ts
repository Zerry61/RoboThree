import { fileURLToPath } from "node:url";

import { CoreHarnessSupervisor } from "./core-harness-supervisor.js";

const supervisor = new CoreHarnessSupervisor({
  entryPath: fileURLToPath(new URL("./fixtures/fake-core-process.js", import.meta.url)),
  maxUnexpectedRestarts: 0,
});

try {
  await supervisor.start();
  const status = await supervisor.probe();
  if (!status.coreReady || !status.compatible || !status.fixtureOnly) {
    throw new Error(`Desktop foundation smoke failed: ${JSON.stringify(status)}`);
  }
  process.stdout.write(`${JSON.stringify({ status: "ready", fixtureOnly: true })}\n`);
} finally {
  await supervisor.stop();
}
