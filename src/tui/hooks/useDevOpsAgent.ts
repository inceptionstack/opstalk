import { debug } from "../../debug.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DevOpsAgentClient } from "../../agent/client.js";
import type { AgentSpace, ChatExecution, JournalRecord, SendMessageEvent } from "../../agent/types.js";
import { saveConfig } from "../../config/storage.js";
import type { AppConfig, ChatMessage, ChatState } from "../lib/types.js";
import {
  createAssistantFormatState,
  finishAssistantFormatting,
  formatErrorMessage,
  formatSystemMessage,
  formatToolMessage,
  formatUserMessage,
  writeAssistantDelta,
  writeLine,
} from "../lib/consoleOutput.js";

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

export function useDevOpsAgent(config: AppConfig, setConfig: (next: AppConfig) => void) {
  const client = useMemo(() => new DevOpsAgentClient({ region: config.region }), [config.region]);
  const [state, setState] = useState<ChatState>({
    messages: [],
    chats: [],
    streaming: false,
    status: "idle",
  });
  const assistantFormatsRef = useRef(new Map<number, ReturnType<typeof createAssistantFormatState>>());
  const toolOutputRef = useRef(new Map<number, ToolOutputState>());
  const nextBlockIndexRef = useRef(0);

  const appendMessage = useCallback((message: ChatMessage) => {
    debug("STATE", `appendMessage role=${message.role} kind=${message.kind} id=${message.id}`, { textLen: message.text.length, streaming: message.streaming });
    if (!message.streaming && message.text) {
      printMessage(message);
    }
    setState((current) => ({
      ...current,
      messages: [...current.messages, message],
    }));
  }, []);

  const updateStreamingBlock = useCallback((event: SendMessageEvent) => {
    if (event.type === "contentBlockStart") {
      debug("EVENT", "contentBlockStart", { index: event.payload.index, type: event.payload.type, id: event.payload.id });
      // Skip duplicate/metadata blocks
      const blockType = event.payload.type ?? "text";
      if (blockType === "final_response" || blockType === "chat_title") {
        debug("EVENT", `skipping block type=${blockType}`);
        return;
      }
      const kind = (blockType === "tool_summary" || blockType === "load_skill") ? "tool" : blockType === "json" ? "json" : "text";
      const blockIndex = event.payload.index ?? nextBlockIndexRef.current++;
      if (kind === "tool") {
        toolOutputRef.current.set(blockIndex, {
          jsonBuffer: "",
          textBuffer: "",
          toolName: "tool",
          toolInput: "{}",
          toolStatus: "",
          toolResult: "",
        });
      } else {
        assistantFormatsRef.current.set(blockIndex, createAssistantFormatState());
      }
      setState((current) => ({
        ...current,
        messages: [
          ...current.messages,
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
        ],
      }));
      return;
    }

    if (event.type === "contentBlockDelta") {
      debug("EVENT", "contentBlockDelta", { index: event.payload.index, deltaLen: (event.payload.delta?.textDelta?.text ?? "").length });
      const textDelta = cleanTextDelta(event.payload.delta?.textDelta?.text ?? "");
      const jsonDelta = event.payload.delta?.jsonDelta?.partialJson ?? "";
      const blockIndex = event.payload.index ?? -1;

      if (!textDelta && !jsonDelta) {
        return;
      }

      const currentTool = toolOutputRef.current.get(blockIndex);
      if (currentTool) {
        if (jsonDelta) {
          currentTool.jsonBuffer += jsonDelta;
          syncToolStateFromJson(currentTool);
        }
        if (textDelta && textDelta !== "Done") {
          currentTool.textBuffer += textDelta;
        }
      } else if (textDelta) {
        const formatter = assistantFormatsRef.current.get(blockIndex) ?? createAssistantFormatState();
        assistantFormatsRef.current.set(blockIndex, formatter);
        writeAssistantDelta(textDelta, formatter);
      }

      setState((current) => ({
        ...current,
        messages: current.messages.map((message) => {
          if (message.blockIndex !== blockIndex || !message.streaming) {
            return message;
          }
          if (message.kind === "tool") {
            const toolState = toolOutputRef.current.get(blockIndex);
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
        }),
      }));
      return;
    }

    if (event.type === "contentBlockStop") {
      debug("EVENT", "contentBlockStop", { index: event.payload.index, textLen: (event.payload.text ?? "").length });
      const blockIndex = event.payload.index ?? -1;
      const toolState = toolOutputRef.current.get(blockIndex);
      if (toolState) {
        const toolName = toolState.toolName || "tool";
        const argsText = toolState.toolInput || "{}";
        writeLine(formatToolMessage(toolName, argsText, toolState.toolStatus !== "failed"));
        toolOutputRef.current.delete(blockIndex);
      } else {
        const formatter = assistantFormatsRef.current.get(blockIndex);
        if (formatter) {
          finishAssistantFormatting(formatter);
          assistantFormatsRef.current.delete(blockIndex);
        }
        writeLine();
      }

      setState((current) => ({
        ...current,
        messages: current.messages.map((message) =>
          message.blockIndex === blockIndex && message.streaming
            ? {
                ...message,
                text: (event.payload.text && event.payload.text.length > 0) ? event.payload.text : message.text,
                streaming: false,
              }
            : message,
        ),
      }));
    }
  }, []);

  const loadChats = useCallback(async (): Promise<ChatExecution[]> => {
    if (!config.agentSpaceId) {
      return [];
    }

    const response = await client.listChats({
      agentSpaceId: config.agentSpaceId,
      userId: config.userId,
      maxResults: 20,
    });

    setState((current) => ({
      ...current,
      chats: response.executions,
    }));

    return response.executions;
  }, [client, config.agentSpaceId, config.userId]);

  const loadHistory = useCallback(
    async (agentSpaceId: string, executionId: string) => {
      const response = await client.listJournalRecords({
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

      setState((current) => ({
        ...current,
        executionId,
        messages,
      }));
    },
    [client],
  );

  const createNewChat = useCallback(async () => {
    if (!config.agentSpaceId) {
      return;
    }

    setState((current) => ({
      ...current,
      status: "creating chat",
      error: undefined,
    }));

    const response = await client.createChat({
      agentSpaceId: config.agentSpaceId,
      userId: config.userId,
      userType: config.userType,
    });

    setState((current) => ({
      ...current,
      executionId: response.executionId,
      messages: [],
      status: "ready",
    }));
    writeLine(formatSystemMessage(`Started new chat ${response.executionId}`));
    writeLine();
  }, [client, config.agentSpaceId, config.userId, config.userType]);

  const resumeChat = useCallback(
    async (executionId: string) => {
      if (!config.agentSpaceId) {
        return;
      }

      setState((current) => ({
        ...current,
        status: "loading history",
      }));

      await loadHistory(config.agentSpaceId, executionId);

      setState((current) => ({
        ...current,
        status: "ready",
      }));
    },
    [config.agentSpaceId, loadHistory],
  );

  const sendMessage = useCallback(
    async (content: string) => {
      if (!config.agentSpaceId) {
        throw new Error("No agent space selected");
      }

      let executionId = state.executionId;

      if (!executionId) {
        const created = await client.createChat({
          agentSpaceId: config.agentSpaceId,
          userId: config.userId,
          userType: config.userType,
        });
        executionId = created.executionId;
        setState((current) => ({
          ...current,
          executionId,
        }));
      }

      appendMessage(
        makeMessage({
          id: `user-${Date.now()}`,
          role: "user",
          kind: "text",
          text: content,
        }),
      );

      debug("SEND", `sendMessage start, executionId=${executionId}`);
      setState((current) => ({
        ...current,
        streaming: true,
        status: "streaming",
        error: undefined,
      }));

      for await (const event of client.sendMessage({
        agentSpaceId: config.agentSpaceId,
        executionId,
        content,
        userId: config.userId,
      })) {
        debug("STREAM", `event type=${event.type}`, event.payload);
        updateStreamingBlock(event);

        if (event.type === "responseFailed") {
          appendMessage(
            makeMessage({
              id: `error-${Date.now()}`,
              role: "error",
              kind: "status",
              text: event.payload.errorMessage ?? event.payload.errorCode ?? "Request failed",
            }),
          );
        }

        if (event.type === "responseCompleted") {
          debug("STREAM", "responseCompleted — finalizing messages", event.payload);
          writeLine();
          setState((current) => ({
            ...current,
            messages: current.messages.map((message) =>
              message.streaming ? { ...message, streaming: false, usage: event.payload.usage } : message,
            ),
          }));
        }
      }

      debug("SEND", "streaming done, setting status=ready");
      setState((current) => {
        debug("STATE", `final state: ${current.messages.length} messages`, current.messages.map((message) => ({ id: message.id, role: message.role, textLen: message.text.length, streaming: message.streaming })));
        return {
          ...current,
          streaming: false,
          status: "ready",
        };
      });

      void loadChats();
    },
    [
      appendMessage,
      client,
      config.agentSpaceId,
      config.userId,
      config.userType,
      loadChats,
      state.executionId,
      updateStreamingBlock,
    ],
  );

  const selectAgentSpace = useCallback(
    async (space: AgentSpace) => {
      const nextConfig: AppConfig = {
        ...config,
        agentSpaceId: space.agentSpaceId,
      };

      setConfig(nextConfig);
      await saveConfig(nextConfig);
      const created = await client.createChat({
        agentSpaceId: space.agentSpaceId,
        userId: nextConfig.userId,
        userType: nextConfig.userType,
      });

      setState((current) => ({
        ...current,
        agentSpace: space,
        executionId: created.executionId,
        messages: [],
        status: "ready",
      }));
      writeLine(formatSystemMessage(`Selected space ${space.agentSpaceId}`));
      writeLine(formatSystemMessage(`Started new chat ${created.executionId}`));
      writeLine();
    },
    [client, config, setConfig],
  );

  const clearMessages = useCallback(() => {
    setState((current) => ({
      ...current,
      messages: [],
    }));
  }, []);

  const appendSystemMessage = useCallback((text: string) => {
    appendMessage(
      makeMessage({
        id: `system-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        role: "system",
        kind: "status",
        text,
      }),
    );
  }, [appendMessage]);

  useEffect(() => {
    setState((current) => ({
      ...current,
      agentSpace: config.agentSpaceId ? { agentSpaceId: config.agentSpaceId } : undefined,
    }));
  }, [config.agentSpaceId]);

  return {
    state,
    sendMessage,
    createNewChat,
    loadChats,
    resumeChat,
    selectAgentSpace,
    clearMessages,
    appendSystemMessage,
    client,
  };
}
