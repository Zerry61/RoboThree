export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogRecord {
  level: LogLevel;
  event: string;
  message: string;
  attributes?: Readonly<Record<string, unknown>>;
}

export interface Logger {
  write(record: LogRecord): void;
}
