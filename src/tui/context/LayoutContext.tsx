import React, { createContext, useContext } from 'react';
import { useStdout } from 'ink';

interface LayoutContextValue {
  terminalWidth: number;
  terminalHeight: number;
  contentWidth: number;
}

const LayoutContext = createContext<LayoutContextValue>({
  terminalWidth: 80,
  terminalHeight: 24,
  contentWidth: 76,
});

export function LayoutProvider({ children }: { children: React.ReactNode }) {
  const { stdout } = useStdout();
  const terminalWidth = stdout?.columns ?? 80;
  const terminalHeight = stdout?.rows ?? 24;
  const contentWidth = Math.max(40, terminalWidth - 4);
  return (
    <LayoutContext.Provider value={{ terminalWidth, terminalHeight, contentWidth }}>
      {children}
    </LayoutContext.Provider>
  );
}

export function useLayout(): LayoutContextValue {
  return useContext(LayoutContext);
}
