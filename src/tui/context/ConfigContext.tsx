import React, { createContext, useContext } from "react";

import type { AppConfig } from "../lib/types.js";

interface ConfigContextValue {
  config: AppConfig;
  setConfig: (next: AppConfig) => void;
}

const ConfigContext = createContext<ConfigContextValue>({} as ConfigContextValue);

export function ConfigProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value: ConfigContextValue;
}): React.ReactElement {
  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}

export function useConfig(): ConfigContextValue {
  const context = useContext(ConfigContext) as ConfigContextValue;
  return context;
}
