import type { Clock } from "../ports/clock.js";
import type { GracefulShutdownController } from "../ports/graceful-shutdown.js";
import type { Logger } from "../ports/logger.js";
import type { RuntimeComponent } from "../ports/runtime-component.js";
import { CoreLifecycle } from "../kernel/lifecycle.js";
import { CoreRuntime } from "../kernel/core-runtime.js";

export function createCore(input: {
  clock: Clock;
  components: readonly RuntimeComponent[];
  gracefulShutdown?: GracefulShutdownController;
  shutdownTimeoutMs?: number;
  logger: Logger;
}): CoreRuntime {
  const lifecycle = new CoreLifecycle(input);
  return new CoreRuntime({
    clock: input.clock,
    components: input.components,
    lifecycle,
  });
}
