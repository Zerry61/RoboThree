import type { LogRecord, Logger } from "../ports/logger.js";

const sensitiveKeyPattern = /(authorization|credential|password|secret|token|api[-_]?key)/iu;

export class ConsoleLogger implements Logger {
  write(record: LogRecord): void {
    const output = JSON.stringify(redactRecord(record));
    if (record.level === "error") {
      console.error(output);
      return;
    }
    console.log(output);
  }
}

function redactRecord(record: LogRecord): LogRecord {
  if (record.attributes === undefined) {
    return record;
  }
  return {
    ...record,
    attributes: redactObject(record.attributes),
  };
}

function redactObject(input: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return redactEntries(input, new WeakSet<object>());
}

function redactEntries(
  input: Readonly<Record<string, unknown>>,
  seen: WeakSet<object>,
): Record<string, unknown> {
  if (seen.has(input)) {
    return { circular: "[CIRCULAR]" };
  }
  seen.add(input);

  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [
      key,
      sensitiveKeyPattern.test(key) ? "[REDACTED]" : redactValue(value, seen),
    ]),
  );
}

function redactValue(value: unknown, seen: WeakSet<object>): unknown {
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return "[CIRCULAR]";
    }
    seen.add(value);
    return value.map((item) => redactValue(item, seen));
  }
  if (value !== null && typeof value === "object") {
    return redactEntries(value as Readonly<Record<string, unknown>>, seen);
  }
  return value;
}
