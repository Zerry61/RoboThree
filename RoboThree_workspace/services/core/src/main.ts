import { ConsoleLogger } from "./adapters/console-logger.js";
import { SystemClock } from "./adapters/system-clock.js";
import { SystemScheduler } from "./adapters/system-scheduler.js";
import { GracefulWorkController } from "./application/graceful-work-controller.js";
import { createCore } from "./bootstrap/create-core.js";

const clock = new SystemClock();
const logger = new ConsoleLogger();
const gracefulShutdown = new GracefulWorkController({
  scheduler: new SystemScheduler(),
});

// KAF-0 verifies an Electron-independent Core process. Concrete runtime
// components are composed here only after their ADR-backed adapters exist.
const core = createCore({
  clock,
  logger,
  components: [],
  gracefulShutdown,
});

try {
  await core.start();

  if (process.argv.includes("--check")) {
    console.log(JSON.stringify(await core.health()));
    await core.stop();
  } else {
    const shutdown = async () => {
      await core.stop();
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  }
} catch (error) {
  logger.write({
    level: "error",
    event: "core.fatal",
    message: error instanceof Error ? error.message : "Unknown fatal error",
  });
  process.exitCode = 1;
}
