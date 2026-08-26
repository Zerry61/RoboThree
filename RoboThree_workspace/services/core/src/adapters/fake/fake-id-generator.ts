import type { IdGenerator } from "../../ports/id-generator.js";

export class FakeIdGenerator implements IdGenerator {
  readonly #values: string[];

  constructor(values: readonly string[]) {
    this.#values = [...values];
  }

  next(): string {
    const value = this.#values.shift();
    if (value === undefined) {
      throw new Error("FakeIdGenerator is exhausted");
    }
    return value;
  }
}
