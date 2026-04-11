export type UserType = "IAM" | "IDC" | "IDP";

export interface AgentSpace {
  agentSpaceId: string;
  name?: string;
  description?: string;
  status?: string;
}

export interface ChatExecution {
  executionId: string;
  createdAt: string;
  updatedAt?: string;
  summary?: string;
}

export interface JournalRecord {
  agentSpaceId?: string;
  executionId: string;
  recordId: string;
  content: unknown;
  createdAt: string;
  recordType: string;
}

export interface SendMessageContext {
  currentPage?: string;
  lastMessage?: string;
  userActionResponse?: string;
}

export interface CreateChatInput {
  agentSpaceId: string;
  userId: string;
  userType?: UserType;
}

export interface CreateAgentSpaceInput {
  name: string;
  description?: string;
  kmsKeyArn?: string;
}

export interface SendMessageInput {
  agentSpaceId: string;
  executionId: string;
  content: string;
  userId: string;
  context?: SendMessageContext;
}

export interface UsageInfo {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface ResponseCreatedEvent {
  responseId?: string;
  sequenceNumber?: number;
}

export interface ResponseInProgressEvent {
  responseId?: string;
  sequenceNumber?: number;
}

export interface ResponseCompletedEvent {
  responseId?: string;
  usage?: UsageInfo;
  sequenceNumber?: number;
}

export interface ResponseFailedEvent {
  responseId?: string;
  errorCode?: string;
  errorMessage?: string;
  sequenceNumber?: number;
}

export interface ContentBlockStartEvent {
  index?: number;
  type?: string;
  id?: string;
  parentId?: string;
  sequenceNumber?: number;
}

export interface TextDelta {
  text?: string;
}

export interface JsonDelta {
  partialJson?: string;
}

export interface ContentBlockDelta {
  textDelta?: TextDelta;
  jsonDelta?: JsonDelta;
}

export interface ContentBlockDeltaEvent {
  index?: number;
  delta?: ContentBlockDelta;
  sequenceNumber?: number;
}

export interface ContentBlockStopEvent {
  index?: number;
  type?: string;
  text?: string;
  last?: boolean;
  sequenceNumber?: number;
}

export interface SummaryEvent {
  summary?: string;
  sequenceNumber?: number;
}

export type SendMessageEvent =
  | { type: "responseCreated"; payload: ResponseCreatedEvent }
  | { type: "responseInProgress"; payload: ResponseInProgressEvent }
  | { type: "responseCompleted"; payload: ResponseCompletedEvent }
  | { type: "responseFailed"; payload: ResponseFailedEvent }
  | { type: "summary"; payload: SummaryEvent }
  | { type: "heartbeat"; payload: Record<string, never> }
  | { type: "contentBlockStart"; payload: ContentBlockStartEvent }
  | { type: "contentBlockDelta"; payload: ContentBlockDeltaEvent }
  | { type: "contentBlockStop"; payload: ContentBlockStopEvent };

export interface ListResponse<T> {
  items: T[];
  nextToken?: string;
}

export interface DevOpsAgentClientConfig {
  region: string;
  credentialsProvider?: () => Promise<{
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  }>;
  fetchImpl?: typeof fetch;
}
