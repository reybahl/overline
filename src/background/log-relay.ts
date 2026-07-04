import type { LogEntry } from "@/shared/types/log";

/** Must match vite dev server in vite.config.ts */
const DEV_LOG_URL = "http://127.0.0.1:5173/__dev/log";

export function relayLogEntry(entry: LogEntry): void {
  if (!import.meta.env.DEV) return;

  void fetch(DEV_LOG_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
  }).catch(() => {});
}
