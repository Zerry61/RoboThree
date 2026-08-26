import type { Clock } from "../../ports/clock.js";

export class FakeClock implements Clock {
  #current: string;

  constructor(initial: string) {
    this.#current = initial;
  }

  now(): string {
    return this.#current;
  }

  set(value: string): void {
    this.#current = value;
  }
}
