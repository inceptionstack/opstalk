import { debug } from "../debug.js";
import { saveConfig } from "../config/storage.js";
import type { AppConfig, ChatMessage, ChatState } from "../tui/lib/types.js";
import {
  createAssistantFormatState,
  finishAssistantFormatting,
  formatErrorMessage,
  formatSystemMessage,
  formatToolMessage,
  formatUserMessage,
  writeAssistantDelta,
  writeLine,
} from "../tui/lib/consoleOutput.js";
import { DevOpsAgentClient } from "./client.js";
import type { AgentSpace, ChatExecution, JournalRecord, SendMessageEvent } from "./types.js";

function makeMessage(partial: Partial<ChatMessage> & Pick<ChatMessage, "id" | "role" | "kind" | "text">): ChatMessage {
  return {
    createdAt: new Date().toISOString(),
    ...partial,
  };
}

function parseJournalRecord(record: JournalRecord): ChatMessage | null {
  const text =
    typeof record.content === "string"
      ? record.content
      : record.content && typeof record.content === "object"
        ? JSON.stringify(record.content, null, 2)
        : String(record.content);

  const normalizedType = record.recordType.toLowerCase();
  const role =
    normalizedType.includes("user")
      ? "user"
      : normalizedType.includes("error")
        ? "error"
        : normalizedType.includes("assistant")
          ? "assistant"
          : "system";

  if (!text || text === "undefined") {
    return null;
  }

  return {
    id: record.recordId,
    role,
    kind: "text",
    text,
    createdAt: record.createdAt,
  };
}

interface ToolOutputState {
  jsonBuffer: string;
  textBuffer: string;
  toolName: string;
  toolInput: string;
  toolStatus: string;
  toolResult: string;
}

type StateListener = (state: ChatState) => void;

function cleanTextDelta(text: string): string {
  let cleaned = text;
  cleaned = cleaned.replace(/\{"type":\s*"text"[^}]*\}/g, "");
  cleaned = cleaned.replace(/\{"content":\s*"/g, "");
  cleaned = cleaned.replace(/\\n/g, "\n");
  return cleaned;
}

function stringifyToolValue(value: unknown): string {
  if (value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function syncToolStateFromJson(toolState: ToolOutputState): void {
  try {
    const parsed = JSON.parse(toolState.jsonBuffer) as Record<string, unknown>;
    if (parsed.type === "tool_call") {
      toolState.toolName = typeof parsed.name === "string" ? parsed.name : toolState.toolName;
      toolState.toolInput = stringifyToolValue(parsed.input ?? {});
    }
    if (parsed.type === "tool_result") {
      toolState.toolStatus = typeof parsed.status === "string" ? parsed.status : toolState.toolStatus;
      const content = parsed.content;
      if (Array.isArray(content)) {
        const first = content[0];
        if (first && typeof first === "object" && "text" in first && typeof first.text === "string") {
          toolState.toolResult = first.text;
        }
      }
    }
  } catch {
    // Ignore partial JSON until the content block is complete.
  }
}

function printMessage(message: ChatMessage): void {
  if (message.role === "user") {
    writeLine(formatUserMessage(message.text));
    return;
  }

  if (message.role === "assistant") {
    const formatter = createAssistantFormatState();
    writeAssistantDelta(message.text, formatter);
    finishAssistantFormatting(formatter);
    writeLine();
    return;
  }

  if (message.role === "error") {
    writeLine(formatErrorMessage(message.text));
    return;
  }

  writeLine(formatSystemMessage(message.text));
}

export class DevOpsAgentController {
  public readonly client: DevOpsAgentClient;

  private configValue: AppConfig;
  private readonly onConfigChange?: (next: AppConfig) => void;
  private stateValue: ChatState;
  private readonly listeners = new Set<StateListener>();
  private readonly assistantFormats = new Map<number, ReturnType<typeof createAssistantFormatState>>();
  private readonly toolOutputs = new Map<number, ToolOutputState>();
  private nextBlockIndex = 0;
  private messages: ChatMessage[] = [];

  public constructor(config: AppConfig, onConfigChange?: (next: AppConfig) => void) {
    this.configValue = config;
    this.onConfigChange = onConfigChange;
    this.client = new DevOpsAgentClient({ region: config.region });
    this.stateValue = {
      messages: [],
      chats: [],
      streaming: false,
      status: config.agentSpaceId ? "ready" : "setup",
    };
  }

  public get config(): AppConfig {
    return this.configValue;
  }

  public get state(): ChatState {
    return this.stateValue;
  }

  public subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.stateValue);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public sendMessage = async (content: string): Promise<void> => {
    if (!this.configValue.agentSpaceId) {
      throw new Error("No agent space selected");
    }

    let executionId = this.stateValue.executionId;
    if (!executionId) {
      const created = await this.client.createChat({
        agentSpaceId: this.configValue.agentSpaceId,
        userId: this.configValue.userId,
        userType: this.configValue.userType,
      });
      executionId = created.executionId;
      this.setState((current) => ({
        ...current,
        executionId,
      }));
    }

    this.appendMessage(
      makeMessage({
        id: `user-${Date.now()}`,
        role: "user",
        kind: "text",
        text: content,
      }),
    );

    debug("SEND", `sendMessage start, executionId=${executionId}`);
    this.setState((current) => ({
      ...current,
      streaming: true,
      status: "streaming",
      error: undefined,
    }));

    for await (const event of this.client.sendMessage({
      agentSpaceId: this.configValue.agentSpaceId,
      executionId,
      content,
      userId: this.configValue.userId,
    })) {
      debug("STREAM", `event type=${event.type}`, event.payload);
      this.updateStreamingBlock(event);

      if (event.type === "responseFailed") {
        this.messages = [
          ...this.messages,
          makeMessage({
            id: `error-${Date.now()}`,
            role: "error",
            kind: "status",
            text: event.payload.errorMessage ?? event.payload.errorCode ?? "Request failed",
          }),
        ];
        this.flushBufferedMessages();
        printMessage(this.messages[this.messages.length - 1]!);
      }

      if (event.type === "responseCompleted") {
        debug("STREAM", "responseCompleted — finalizing messages", event.payload);
        writeLine();
        this.messages = this.messages.map((message) =>
          message.streaming ? { ...message, streaming: false, usage: event.payload.usage } : message,
        );
        this.flushBufferedMessages();
      }
    }

    this.setState((current) => ({
      ...current,
      streaming: false,
      status: "ready",
    }));

    void this.loadChats();
  };

  public createNewChat = async (): Promise<void> => {
    if (!this.configValue.agentSpaceId) {
      return;
    }

    this.setState((current) => ({
      ...current,
      status: "creating chat",
      error: undefined,
    }));

    const response = await this.client.createChat({
      agentSpaceId: this.configValue.agentSpaceId,
      userId: this.configValue.userId,
      userType: this.configValue.userType,
    });

    this.replaceMessages([]);
    this.setState((current) => ({
      ...current,
      executionId: response.executionId,
      status: "ready",
    }));
    writeLine(formatSystemMessage(`Started new chat ${response.executionId}`));
    writeLine();
  };

  public loadChats = async (): Promise<ChatExecution[]> => {
    if (!this.configValue.agentSpaceId) {
      return [];
    }

    const response = await this.client.listChats({
      agentSpaceId: this.configValue.agentSpaceId,
      userId: this.configValue.userId,
      maxResults: 20,
    });

    this.setState((current) => ({
      ...current,
      chats: response.executions,
    }));

    return response.executions;
  };

  public resumeChat = async (executionId: string): Promise<void> => {
    if (!this.configValue.agentSpaceId) {
      return;
    }

    this.setState((current) => ({
      ...current,
      status: "loading history",
    }));

    await this.loadHistory(this.configValue.agentSpaceId, executionId);

    this.setState((current) => ({
      ...current,
      status: "ready",
    }));
  };

  public selectAgentSpace = async (space: AgentSpace): Promise<void> => {
    const nextConfig: AppConfig = {
      ...this.configValue,
      agentSpaceId: space.agentSpaceId,
    };

    this.configValue = nextConfig;
    this.onConfigChange?.(nextConfig);
    await saveConfig(nextConfig);

    const created = await this.client.createChat({
      agentSpaceId: space.agentSpaceId,
      userId: nextConfig.userId,
      userType: nextConfig.userType,
    });

    this.replaceMessages([]);
    this.setState((current) => ({
      ...current,
      agentSpace: space,
      executionId: created.executionId,
      status: "ready",
    }));
    writeLine(formatSystemMessage(`Selected space ${space.agentSpaceId}`));
    writeLine(formatSystemMessage(`Started new chat ${created.executionId}`));
    writeLine();
  };

  public clearMessages = (): void => {
    this.replaceMessages([]);
  };

  public appendSystemMessage = (text: string): void => {
    this.appendMessage(
      makeMessage({
        id: `system-${Date.now()}`,
        role: "system",
        kind: "status",
        text,
      }),
    );
  };

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.stateValue);
    }
  }

  private setState(next: ChatState | ((current: ChatState) => ChatState)): void {
    this.stateValue = typeof next === "function" ? next(this.stateValue) : next;
    this.notify();
  }

  private replaceMessages(messages: ChatMessage[]): void {
    this.messages = messages;
    this.setState((current) => ({
      ...current,
      messages,
    }));
  }

  private flushBufferedMessages(): void {
    const nextMessages = [...this.messages];
    this.setState((current) => ({
      ...current,
      messages: nextMessages,
    }));
  }

  private appendMessage(message: ChatMessage): void {
    debug("STATE", `appendMessage role=${message.role} kind=${message.kind} id=${message.id}`, {
      textLen: message.text.length,
      streaming: message.streaming,
    });
    if (!message.streaming && message.text) {
      printMessage(message);
    }
    const nextMessages = [...this.messages, message];
    this.messages = nextMessages;
    this.setState((current) => ({
      ...current,
      messages: nextMessages,
    }));
  }

  private updateStreamingBlock(event: SendMessageEvent): void {
    if (event.type === "contentBlockStart") {
      const blockType = event.payload.type ?? "text";
      if (blockType === "final_response" || blockType === "chat_title") {
        return;
      }

      const kind = (blockType === "tool_summary" || blockType === "load_skill") ? "tool" : blockType === "json" ? "json" : "text";
      const blockIndex = event.payload.index ?? this.nextBlockIndex++;

      if (kind === "tool") {
        this.toolOutputs.set(blockIndex, {
          jsonBuffer: "",
          textBuffer: "",
          toolName: "tool",
          toolInput: "{}",
          toolStatus: "",
          toolResult: "",
        });
      } else {
        this.assistantFormats.set(blockIndex, createAssistantFormatState());
      }

      this.messages = [
        ...this.messages,
        makeMessage({
          id: event.payload.id ?? `assistant-${blockIndex}`,
          role: "assistant",
          kind,
          text: "",
          streaming: true,
          blockId: event.payload.id,
          blockIndex,
          toolName: "",
          toolInput: "",
          toolStatus: "",
          toolResult: "",
        }),
      ];
      this.flushBufferedMessages();
      return;
    }

    if (event.type === "contentBlockDelta") {
      const textDelta = cleanTextDelta(event.payload.delta?.textDelta?.text ?? "");
      const jsonDelta = event.payload.delta?.jsonDelta?.partialJson ?? "";
      const blockIndex = event.payload.index ?? -1;

      if (!textDelta && !jsonDelta) {
        return;
      }

      const currentTool = this.toolOutputs.get(blockIndex);
      if (currentTool) {
        if (jsonDelta) {
          currentTool.jsonBuffer += jsonDelta;
          syncToolStateFromJson(currentTool);
        }
        if (textDelta && textDelta !== "Done") {
          currentTool.textBuffer += textDelta;
        }
      } else if (textDelta) {
        const formatter = this.assistantFormats.get(blockIndex) ?? createAssistantFormatState();
        this.assistantFormats.set(blockIndex, formatter);
        writeAssistantDelta(textDelta, formatter);
      }

      this.messages = this.messages.map((message) => {
        if (message.blockIndex !== blockIndex || !message.streaming) {
          return message;
        }

        if (message.kind === "tool") {
          const toolState = this.toolOutputs.get(blockIndex);
          if (!toolState) {
            return message;
          }

          return {
            ...message,
            text: toolState.textBuffer,
            toolName: toolState.toolName,
            toolInput: toolState.toolInput,
            toolStatus: toolState.toolStatus,
            toolResult: toolState.toolResult,
          };
        }

        if (textDelta) {
          return { ...message, text: `${message.text}${textDelta}` };
        }

        return message;
      });
      this.flushBufferedMessages();
      return;
    }

    if (event.type === "contentBlockStop") {
      const blockIndex = event.payload.index ?? -1;
      const toolState = this.toolOutputs.get(blockIndex);

      if (toolState) {
        const toolName = toolState.toolName || "tool";
        const argsText = toolState.toolInput || "{}";
        writeLine(formatToolMessage(toolName, argsText, toolState.toolStatus !== "failed"));
        this.toolOutputs.delete(blockIndex);
      } else {
        const formatter = this.assistantFormats.get(blockIndex);
        if (formatter) {
          finishAssistantFormatting(formatter);
          this.assistantFormats.delete(blockIndex);
        }
        writeLine();
      }

      this.messages = this.messages.map((message) =>
        message.blockIndex === blockIndex && message.streaming
          ? {
              ...message,
              text: event.payload.text && event.payload.text.length > 0 ? event.payload.text : message.text,
              streaming: false,
            }
          : message,
      );
      this.flushBufferedMessages();
    }
  }

  private async loadHistory(agentSpaceId: string, executionId: string): Promise<void> {
    const response = await this.client.listJournalRecords({
      agentSpaceId,
      executionId,
      limit: 100,
    });

    const messages = response.records
      .map(parseJournalRecord)
      .filter((value): value is ChatMessage => value !== null);

    writeLine(formatSystemMessage(`Resumed chat ${executionId}`));
    for (const message of messages) {
      printMessage(message);
    }
    if (messages.length > 0) {
      writeLine();
    }

    this.replaceMessages(messages);
    this.setState((current) => ({
      ...current,
      executionId,
    }));
  }
}
