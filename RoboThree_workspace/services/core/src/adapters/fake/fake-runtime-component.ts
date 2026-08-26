import type { ComponentHealth, HealthStatus } from "@robothree/contracts";

import type { Clock } from "../../ports/clock.js";
import type { RuntimeComponent } from "../../ports/runtime-component.js";

export class FakeRuntimeComponent implements RuntimeComponent {
  readonly componentId: string;
  readonly calls: string[] = [];
  readonly #clock: Clock;
  readonly #trace: string[] | undefined;
  #healthStatus: HealthStatus = "ready";
  #startError: Error | undefined;
  #stopError: Error | undefined;

  constructor(input: { componentId: string; clock: Clock; trace?: string[] }) {
    this.componentId = input.componentId;
    this.#clock = input.clock;
    this.#trace = input.trace;
  }

  failOnStart(error: Error): void {
    this.#startError = error;
  }

  failOnStop(error: Error): void {
    this.#stopError = error;
  }

  setHealth(status: HealthStatus): void {
    this.#healthStatus = status;
  }

  async start(): Promise<void> {
    this.calls.push("start");
    this.#trace?.push(`${this.componentId}.start`);
    if (this.#startError !== undefined) {
      throw this.#startError;
    }
  }

  async stop(): Promise<void> {
    this.calls.push("stop");
    this.#trace?.push(`${this.componentId}.stop`);
    if (this.#stopError !== undefined) {
      throw this.#stopError;
    }
  }

  async health(): Promise<ComponentHealth> {
    return {
      componentId: this.componentId,
      status: this.#healthStatus,
      checkedAt: this.#clock.now(),
    };
  }
}
