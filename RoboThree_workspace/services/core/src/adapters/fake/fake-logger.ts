import type { LogRecord, Logger } from "../../ports/logger.js";

export class FakeLogger implements Logger {
  readonly records: LogRecord[] = [];

  write(record: LogRecord): void {
    this.records.push(record);
  }
}
