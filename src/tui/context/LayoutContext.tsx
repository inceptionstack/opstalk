import React, { createContext, useContext } from "react";

interface LayoutContextValue {
  width: number;
  height: number;
}

const LayoutContext = createContext<LayoutContextValue>({ width: 80, height: 24 });

export function LayoutProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value: LayoutContextValue;
}): React.ReactElement {
  return <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>;
}

export function useLayout(): LayoutContextValue {
  return useContext(LayoutContext);
}
