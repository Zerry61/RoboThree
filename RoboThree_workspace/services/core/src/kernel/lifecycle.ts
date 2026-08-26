import type { Clock } from "../ports/clock.js";
import type { GracefulShutdownController } from "../ports/graceful-shutdown.js";
import type { Logger } from "../ports/logger.js";
import type { RuntimeComponent } from "../ports/runtime-component.js";

export type CoreLifecycleState =
  | "created"
  | "starting"
  | "ready"
  | "stopping"
  | "stopped"
  | "failed";

export class CoreLifecycle {
  readonly #clock: Clock;
  readonly #components: readonly RuntimeComponent[];
  readonly #gracefulShutdown: GracefulShutdownController | undefined;
  readonly #shutdownTimeoutMs: number;
  readonly #logger: Logger;
  #startedComponents: RuntimeComponent[] = [];
  #state: CoreLifecycleState = "created";

  constructor(input: {
    clock: Clock;
    components: readonly RuntimeComponent[];
    gracefulShutdown?: GracefulShutdownController;
    shutdownTimeoutMs?: number;
    logger: Logger;
  }) {
    this.#clock = input.clock;
    this.#components = input.components;
    this.#gracefulShutdown = input.gracefulShutdown;
    this.#shutdownTimeoutMs = requireShutdownTimeout(input.shutdownTimeoutMs ?? 5_000);
    this.#logger = input.logger;
  }

  get state(): CoreLifecycleState {
    return this.#state;
  }

  async start(): Promise<void> {
    if (this.#state !== "created" && this.#state !== "stopped") {
      throw new Error(`Cannot start core from state ${this.#state}`);
    }

    this.#state = "starting";
    this.#startedComponents = [];

    try {
      this.#gracefulShutdown?.startAccepting();
      for (const component of this.#components) {
        await component.start();
        this.#startedComponents.push(component);
      }
      this.#state = "ready";
      this.#logger.write({
        level: "info",
        event: "core.ready",
        message: "RoboThree Core is ready",
        attributes: { checkedAt: this.#clock.now() },
      });
    } catch (error) {
      this.#state = "failed";
      await this.#beginGracefulShutdown();
      await this.#rollbackStartedComponents();
      this.#logger.write({
        level: "error",
        event: "core.start_failed",
        message: "RoboThree Core failed to start",
      });
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.#state === "created" || this.#state === "stopped") {
      this.#state = "stopped";
      return;
    }
    if (this.#state === "starting" || this.#state === "stopping") {
      throw new Error(`Cannot stop core from state ${this.#state}`);
    }

    this.#state = "stopping";
    const errors: unknown[] = [];
    try {
      await this.#beginGracefulShutdown();
    } catch (error) {
      errors.push(error);
    }
    errors.push(...await this.#stopComponents(this.#startedComponents));
    this.#startedComponents = [];
    this.#state = errors.length === 0 ? "stopped" : "failed";

    if (errors.length > 0) {
      throw new AggregateError(errors, "One or more core components failed to stop");
    }
  }

  async #rollbackStartedComponents(): Promise<void> {
    const errors = await this.#stopComponents(this.#startedComponents);
    this.#startedComponents = [];
    for (const error of errors) {
      this.#logger.write({
        level: "error",
        event: "core.rollback_failed",
        message: error instanceof Error ? error.message : "Unknown rollback error",
      });
    }
  }

  async #beginGracefulShutdown(): Promise<void> {
    if (this.#gracefulShutdown === undefined) {
      return;
    }
    const report = await this.#gracefulShutdown.beginShutdown(this.#shutdownTimeoutMs);
    if (report.timedOutWorkIds.length > 0) {
      this.#logger.write({
        level: "warn",
        event: "core.shutdown_timeout",
        message: "Core graceful shutdown reached its deadline",
        attributes: {
          activeAtStart: report.activeAtStart,
          completedBeforeDeadline: report.completedBeforeDeadline,
          timedOut: report.timedOutWorkIds.length,
        },
      });
    }
  }

  async #stopComponents(components: readonly RuntimeComponent[]): Promise<unknown[]> {
    const errors: unknown[] = [];
    for (const component of [...components].reverse()) {
      try {
        await component.stop();
      } catch (error) {
        errors.push(error);
      }
    }
    return errors;
  }
}

function requireShutdownTimeout(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("shutdownTimeoutMs must be a finite non-negative number");
  }
  return value;
}
