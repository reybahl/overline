import type { Plugin } from "vite";

function formatTerminalLine(entry: {
  level?: string;
  ctx?: string;
  msg?: string;
  runId?: string;
  data?: Record<string, unknown>;
}): string {
  const level = (entry.level ?? "info").toUpperCase().padEnd(5);
  const ctx = entry.ctx ?? "?";
  const run = entry.runId ? ` run=${entry.runId}` : "";
  const data =
    entry.data && Object.keys(entry.data).length > 0
      ? ` ${JSON.stringify(entry.data)}`
      : "";
  return `[Overline:${ctx}] ${level}${run} ${entry.msg ?? ""}${data}`;
}

export function devLogsPlugin(): Plugin {
  return {
    name: "overline-dev-logs",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__dev/log", (req, res, next) => {
        if (req.method !== "POST") {
          next();
          return;
        }

        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
        });
        req.on("end", () => {
          try {
            const entry = JSON.parse(body) as Record<string, unknown>;
            console.log(
              formatTerminalLine(entry as Parameters<typeof formatTerminalLine>[0]),
            );
            res.writeHead(204);
            res.end();
          } catch {
            res.writeHead(400);
            res.end("Invalid log entry");
          }
        });
      });
    },
  };
}
