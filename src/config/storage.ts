import fs from "node:fs/promises";

import { getConfigDir, getConfigPath } from "./paths.js";
import type { AppConfig } from "../tui/lib/types.js";

const DEFAULT_CONFIG: AppConfig = {
  region: process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? process.env.OPSTALK_REGION ?? "us-east-1",
  agentSpaceId: process.env.OPSTALK_AGENT_SPACE_ID,
  userId: process.env.OPSTALK_USER_ID ?? process.env.USER ?? "unknown",
  userType: "IAM",
  ui: {
    thinkingMode: "off",
  },
};

export async function loadConfig(): Promise<AppConfig> {
  try {
    const raw = await fs.readFile(getConfigPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<AppConfig>;

    return mergeConfig(parsed);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;

    if (nodeError.code === "ENOENT") {
      return DEFAULT_CONFIG;
    }

    throw error;
  }
}

export async function saveConfig(config: AppConfig): Promise<void> {
  const dir = getConfigDir();

  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  await fs.writeFile(getConfigPath(), `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  await fs.chmod(getConfigPath(), 0o600);
}

export function mergeConfig(partial: Partial<AppConfig>): AppConfig {
  const clean = Object.fromEntries(
    Object.entries(partial).filter(([, v]) => v !== undefined)
  ) as Partial<AppConfig>;
  return {
    ...DEFAULT_CONFIG,
    ...clean,
    ui: {
      ...DEFAULT_CONFIG.ui,
      ...(clean.ui ?? {}),
    },
  };
}
