import fs from "node:fs";
import path from "node:path";
import os from "node:os";

let logStream: fs.WriteStream | null = null;
let enabled = false;

export function initDebug(): string {
  enabled = true;
  const logPath = path.join(os.tmpdir(), `opstalk-debug-${Date.now()}.log`);
  logStream = fs.createWriteStream(logPath, { flags: "a" });
  debug("DEBUG", `Debug logging started at ${new Date().toISOString()}`);
  debug("DEBUG", `Log file: ${logPath}`);
  debug("DEBUG", `Node: ${process.version}, Platform: ${process.platform} ${process.arch}`);
  debug("DEBUG", `Terminal: ${process.env.TERM ?? "unknown"}, TERM_PROGRAM: ${process.env.TERM_PROGRAM ?? "unknown"}`);
  debug("DEBUG", `stdout columns: ${process.stdout.columns}, rows: ${process.stdout.rows}`);
  debug("DEBUG", `isTTY: ${process.stdout.isTTY}`);
  return logPath;
}

export function isDebugEnabled(): boolean {
  return enabled;
}

export function debug(category: string, message: string, data?: unknown): void {
  if (!enabled || !logStream) return;
  const ts = new Date().toISOString();
  let line = `[${ts}] [${category}] ${message}`;
  if (data !== undefined) {
    try {
      line += ` | ${JSON.stringify(data)}`;
    } catch {
      line += ` | [unserializable]`;
    }
  }
  logStream.write(line + "\n");
}

export function debugClose(): void {
  if (logStream) {
    logStream.end();
    logStream = null;
  }
}
