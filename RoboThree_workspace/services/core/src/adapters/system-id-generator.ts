import { randomUUID } from "node:crypto";

import type { IdGenerator } from "../ports/id-generator.js";

export class SystemIdGenerator implements IdGenerator {
  next(): string {
    return randomUUID();
  }
}
