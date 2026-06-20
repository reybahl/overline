export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  ts: string;
  level: LogLevel;
  ctx: string;
  msg: string;
  runId?: string;
  data?: Record<string, unknown>;
}

export type LogData = Record<string, unknown>;
