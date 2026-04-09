import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { applyOverrides, readConfig, writeConfig } from '../../config/storage.js';
import type { CliOverrides, OpsTalkConfig } from '../lib/types.js';

interface ConfigContextValue {
  config: OpsTalkConfig | null;
  warnings: string[];
  loading: boolean;
  saveConfig: (next: OpsTalkConfig) => Promise<void>;
  setConfig: React.Dispatch<React.SetStateAction<OpsTalkConfig | null>>;
}

const ConfigContext = createContext<ConfigContextValue | null>(null);

export function ConfigProvider({
  children,
  overrides,
}: {
  children: React.ReactNode;
  overrides: CliOverrides;
}) {
  const [config, setConfig] = useState<OpsTalkConfig | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const loaded = await readConfig();
      setWarnings(loaded.warnings);
      setConfig(applyOverrides(loaded.config, overrides));
      setLoading(false);
    })();
  }, [overrides.gatewayUrl, overrides.session, overrides.token]);

  const saveConfig = useCallback(async (next: OpsTalkConfig) => {
    setConfig(next);
    await writeConfig(next);
  }, []);

  return (
    <ConfigContext.Provider value={{ config, warnings, loading, saveConfig, setConfig }}>
      {children}
    </ConfigContext.Provider>
  );
}

export function useConfigContext(): ConfigContextValue {
  const value = useContext(ConfigContext);
  if (!value) {
    throw new Error('ConfigContext is not available.');
  }
  return value;
}
