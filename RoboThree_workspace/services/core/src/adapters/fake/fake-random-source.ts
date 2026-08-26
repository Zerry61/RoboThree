import type { RandomSource } from "../../ports/random-source.js";

export class FakeRandomSource implements RandomSource {
  readonly #values: number[];

  public constructor(values: readonly number[]) {
    this.#values = [...values];
  }

  public next(): number {
    const value = this.#values.shift();
    if (value === undefined) {
      throw new Error("FakeRandomSource has no value available");
    }
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      throw new Error("FakeRandomSource values must be in [0, 1)");
    }
    return value;
  }
}
