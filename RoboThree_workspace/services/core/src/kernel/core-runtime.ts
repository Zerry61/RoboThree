import { CoreHealthSchema } from "@robothree/contracts";
import type { CoreHealth, HealthStatus } from "@robothree/contracts";

import type { Clock } from "../ports/clock.js";
import type { RuntimeComponent } from "../ports/runtime-component.js";
import type { CoreLifecycle } from "./lifecycle.js";

export class CoreRuntime {
  readonly #clock: Clock;
  readonly #components: readonly RuntimeComponent[];
  readonly #lifecycle: CoreLifecycle;

  constructor(input: {
    clock: Clock;
    components: readonly RuntimeComponent[];
    lifecycle: CoreLifecycle;
  }) {
    this.#clock = input.clock;
    this.#components = input.components;
    this.#lifecycle = input.lifecycle;
  }

  get state() {
    return this.#lifecycle.state;
  }

  start(): Promise<void> {
    return this.#lifecycle.start();
  }

  stop(): Promise<void> {
    return this.#lifecycle.stop();
  }

  async health(): Promise<CoreHealth> {
    const components = await Promise.all(this.#components.map((component) => component.health()));
    const status = components.reduce<HealthStatus>(
      (current, component) => worstStatus(current, component.status),
      "ready",
    );

    return CoreHealthSchema.parse({
      status: this.state === "ready" ? status : "unavailable",
      checkedAt: this.#clock.now(),
      components,
    });
  }
}

const statusWeight: Record<HealthStatus, number> = {
  ready: 0,
  degraded: 1,
  unavailable: 2,
};

function worstStatus(left: HealthStatus, right: HealthStatus): HealthStatus {
  return statusWeight[left] >= statusWeight[right] ? left : right;
}
