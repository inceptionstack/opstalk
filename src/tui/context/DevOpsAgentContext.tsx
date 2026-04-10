import React, { createContext, useContext } from "react";

import type { ChatState } from "../lib/types.js";
import type { AgentSpace, ChatExecution } from "../../agent/types.js";

export interface DevOpsAgentContextValue {
  state: ChatState;
  sendMessage: (content: string) => Promise<void>;
  createNewChat: () => Promise<void>;
  loadChats: () => Promise<ChatExecution[]>;
  resumeChat: (executionId: string) => Promise<void>;
  selectAgentSpace: (space: AgentSpace) => Promise<void>;
  clearMessages: () => void;
  appendSystemMessage: (text: string) => void;
}

const DevOpsAgentContext = createContext<DevOpsAgentContextValue>({} as DevOpsAgentContextValue);

export function DevOpsAgentProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value: DevOpsAgentContextValue;
}): React.ReactElement {
  return <DevOpsAgentContext.Provider value={value}>{children}</DevOpsAgentContext.Provider>;
}

export function useDevOpsAgentContext(): DevOpsAgentContextValue {
  const context = useContext(DevOpsAgentContext) as DevOpsAgentContextValue;
  return context;
}
