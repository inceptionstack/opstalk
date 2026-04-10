import os from "node:os";
import path from "node:path";

export function getConfigDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME;

  if (xdg && xdg.length > 0) {
    return path.join(xdg, "opstalk");
  }

  return path.join(os.homedir(), ".config", "opstalk");
}

export function getConfigPath(): string {
  return path.join(getConfigDir(), "config.json");
}
