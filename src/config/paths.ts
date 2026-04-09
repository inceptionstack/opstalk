import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export interface ConfigPaths {
  configDir: string;
  configFile: string;
}

export function resolveConfigPath(): ConfigPaths {
  const explicit = process.env.OPSTALK_CONFIG;
  if (explicit) {
    const configDir = explicit.endsWith('.json') ? dirname(explicit) : explicit;
    const configFile = explicit.endsWith('.json') ? explicit : join(explicit, 'config.json');
    return { configDir, configFile };
  }

  const xdgConfigHome = process.env.XDG_CONFIG_HOME;
  if (xdgConfigHome) {
    return {
      configDir: join(xdgConfigHome, 'opstalk'),
      configFile: join(xdgConfigHome, 'opstalk', 'config.json'),
    };
  }

  const home = homedir();
  if (process.platform === 'darwin') {
    return {
      configDir: join(home, 'Library', 'Application Support', 'opstalk'),
      configFile: join(home, 'Library', 'Application Support', 'opstalk', 'config.json'),
    };
  }

  if (process.platform === 'win32') {
    const appData = process.env.APPDATA ?? join(home, 'AppData', 'Roaming');
    return {
      configDir: join(appData, 'opstalk'),
      configFile: join(appData, 'opstalk', 'config.json'),
    };
  }

  return {
    configDir: join(home, '.config', 'opstalk'),
    configFile: join(home, '.config', 'opstalk', 'config.json'),
  };
}
