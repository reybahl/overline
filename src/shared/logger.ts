import type { LogEntry, LogLevel, LogData } from "@/shared/types/log";

type LogRelay = (entry: LogEntry) => void;

let activeRunId: string | undefined;
let relay: LogRelay | undefined;

/** Background registers the dev sink once at startup. */
export function bindLogRelay(fn: LogRelay): void {
  relay = fn;
}

export function newRunId(): string {
  activeRunId = crypto.randomUUID().slice(0, 8);
  return activeRunId;
}

export function clearRunId(): void {
  activeRunId = undefined;
}

export class Logger {
  constructor(private readonly ctx: string) {}

  debug(msg: string, data?: LogData): void {
    this.emit("debug", msg, data);
  }

  info(msg: string, data?: LogData): void {
    this.emit("info", msg, data);
  }

  warn(msg: string, data?: LogData): void {
    this.emit("warn", msg, data);
  }

  error(msg: string, data?: LogData): void {
    this.emit("error", msg, data);
  }

  private emit(level: LogLevel, msg: string, data?: LogData): void {
    const entry: LogEntry = {
      ts: new Date().toISOString(),
      level,
      ctx: this.ctx,
      msg,
      ...(activeRunId ? { runId: activeRunId } : {}),
      ...(data ? { data } : {}),
    };

    this.writeConsole(level, entry);
    this.forward(entry);
  }

  private writeConsole(level: LogLevel, entry: LogEntry): void {
    const prefix = `[Overline:${entry.ctx}]`;
    const args: unknown[] = entry.data ? [entry.msg, entry.data] : [entry.msg];

    switch (level) {
      case "debug":
        if (import.meta.env.DEV) console.debug(prefix, ...args);
        break;
      case "info":
        console.info(prefix, ...args);
        break;
      case "warn":
        console.warn(prefix, ...args);
        break;
      case "error":
        console.error(prefix, ...args);
        break;
    }
  }

  private forward(entry: LogEntry): void {
    if (!import.meta.env.DEV) return;

    if (relay) {
      relay(entry);
      return;
    }

    if (typeof chrome !== "undefined" && chrome.runtime?.id) {
      void chrome.runtime
        .sendMessage({ type: "DEV_LOG", entry })
        .catch(() => {});
    }
  }
}

export function createLogger(ctx: string): Logger {
  return new Logger(ctx);
}
