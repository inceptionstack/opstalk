import type { AgentSpace, ChatExecution, UsageInfo, UserType } from "../../agent/types.js";

export interface AppConfig {
  region: string;
  agentSpaceId?: string;
  userId: string;
  userType: UserType;
  ui: {
    thinkingMode: "off" | "on";
  };
}

export type Role = "user" | "assistant" | "system" | "error";
export type MessageKind = "text" | "json" | "status" | "tool";

export interface ChatMessage {
  id: string;
  role: Role;
  kind: MessageKind;
  text: string;
  createdAt: string;
  streaming?: boolean;
  blockId?: string;
  blockIndex?: number;
  usage?: UsageInfo;
  toolName?: string;
  toolInput?: string;
  toolStatus?: string;
  toolResult?: string;
}

export interface ChatState {
  agentSpace?: AgentSpace;
  executionId?: string;
  messages: ChatMessage[];
  chats: ChatExecution[];
  streaming: boolean;
  status: string;
  error?: string;
}

export interface ChatCommandResult {
  handled: boolean;
  exit?: boolean;
  cleared?: boolean;
}
