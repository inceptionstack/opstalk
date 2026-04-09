import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { resolveConfigPath } from './paths.js';
import type { CliOverrides, OpsTalkConfig } from '../tui/lib/types.js';

export const DEFAULT_CONFIG: OpsTalkConfig = {
  gateway: {
    url: 'ws://127.0.0.1:3001',
    connectTimeoutMs: 8000,
    requestTimeoutMs: 15000,
  },
  session: {
    lastSessionKey: 'main',
    autoReconnect: true,
    historyLimit: 50,
  },
  ui: {
    thinkingMode: 'off',
    showTimestamps: false,
  },
};

export interface LoadedConfig {
  config: OpsTalkConfig;
  warnings: string[];
  path: string;
}

function mergeConfig(base: OpsTalkConfig, override: Partial<OpsTalkConfig>): OpsTalkConfig {
  return {
    gateway: { ...base.gateway, ...override.gateway },
    session: { ...base.session, ...override.session },
    ui: { ...base.ui, ...override.ui },
  };
}

export async function readConfig(): Promise<LoadedConfig> {
  const { configDir, configFile } = resolveConfigPath();
  await mkdir(configDir, { recursive: true, mode: 0o700 });

  try {
    const fileStat = await stat(configFile);
    const warnings: string[] = [];
    if (process.platform !== 'win32' && (fileStat.mode & 0o077) !== 0) {
      warnings.push(`Config file permissions are broader than 0600: ${configFile}`);
    }
    const raw = await readFile(configFile, 'utf8');
    const parsed = JSON.parse(raw) as Partial<OpsTalkConfig>;
    return { config: mergeConfig(DEFAULT_CONFIG, parsed), warnings, path: configFile };
  } catch {
    return { config: DEFAULT_CONFIG, warnings: [], path: configFile };
  }
}

export async function writeConfig(config: OpsTalkConfig): Promise<string> {
  const { configDir, configFile } = resolveConfigPath();
  await mkdir(configDir, { recursive: true, mode: 0o700 });
  await writeFile(configFile, `${JSON.stringify(config, null, 2)}\n`, {
    mode: 0o600,
  });
  return configFile;
}

export function applyOverrides(config: OpsTalkConfig, overrides: CliOverrides): OpsTalkConfig {
  return {
    ...config,
    gateway: {
      ...config.gateway,
      ...(overrides.gatewayUrl ? { url: overrides.gatewayUrl } : {}),
      ...(overrides.token ? { token: overrides.token } : {}),
    },
    session: {
      ...config.session,
      ...(overrides.session ? { lastSessionKey: overrides.session } : {}),
    },
  };
}
