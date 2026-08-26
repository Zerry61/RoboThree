import type { RandomSource } from "../ports/random-source.js";

export class SystemRandomSource implements RandomSource {
  public next(): number {
    return Math.random();
  }
}
