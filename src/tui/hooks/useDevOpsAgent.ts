import { debug } from "../../debug.js";
import { useCallback, useEffect, useMemo, useState } from "react";

import { DevOpsAgentClient } from "../../agent/client.js";
import type { AgentSpace, ChatExecution, JournalRecord, SendMessageEvent } from "../../agent/types.js";
import { saveConfig } from "../../config/storage.js";
import type { AppConfig, ChatMessage, ChatState } from "../lib/types.js";

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

export function useDevOpsAgent(config: AppConfig, setConfig: (next: AppConfig) => void) {
  const client = useMemo(() => new DevOpsAgentClient({ region: config.region }), [config.region]);
  const [state, setState] = useState<ChatState>({
    messages: [],
    chats: [],
    streaming: false,
    status: "idle",
  });

  const appendMessage = useCallback((message: ChatMessage) => {
    debug("STATE", `appendMessage role=${message.role} kind=${message.kind} id=${message.id}`, { textLen: message.text.length, streaming: message.streaming });
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
      setState((current) => ({
        ...current,
        messages: [
          ...current.messages,
          makeMessage({
            id: event.payload.id ?? `assistant-${event.payload.index ?? current.messages.length}`,
            role: "assistant",
            kind,
            text: "",
            streaming: true,
            blockId: event.payload.id,
            blockIndex: event.payload.index,
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
      const textDelta = event.payload.delta?.textDelta?.text ?? "";
      const jsonDelta = event.payload.delta?.jsonDelta?.partialJson ?? "";

      if (!textDelta && !jsonDelta) {
        return;
      }

      setState((current) => ({
        ...current,
        messages: current.messages.map((message) => {
          if (message.blockIndex !== event.payload.index || !message.streaming) {
            return message;
          }
          // For tool messages, parse jsonDelta to extract tool info
          if (message.kind === "tool" && jsonDelta) {
            try {
              const parsed = JSON.parse(jsonDelta) as Record<string, unknown>;
              if (parsed.type === "tool_call") {
                const name = (parsed.name as string) ?? message.toolName;
                const input = (parsed.input ?? {}) as Record<string, unknown>;
                // For create_artifact, extract the content for display
                let artifactContent = message.artifactContent;
                if (name === "create_artifact" && typeof input.content === "string") {
                  // Unescape \n to actual newlines
                  artifactContent = (input.content as string).replace(/\\n/g, "\n");
                }
                return {
                  ...message,
                  toolName: name,
                  toolInput: JSON.stringify(input),
                  artifactContent,
                };
              }
              if (parsed.type === "tool_result") {
                const status = (parsed.status as string) ?? "";
                let resultText = "";
                const contentArr = parsed.content as Array<{text?: string}> | undefined;
                if (contentArr?.[0]?.text) {
                  resultText = contentArr[0].text;
                }
                return {
                  ...message,
                  toolStatus: status,
                  toolResult: resultText,
                };
              }
            } catch {
              // Ignore parse errors on partial JSON
            }
            return message;
          }
          // For tool messages, skip "Done" text
          if (message.kind === "tool" && textDelta) {
            const cleanText = textDelta === "Done" ? "" : textDelta;
            return cleanText ? { ...message, text: `${message.text}${cleanText}` } : message;
          }
          // For regular text messages, only use textDelta
          if (textDelta) {
            // Clean up: strip JSON metadata fragments that leak through,
            // and convert literal \n to actual newlines
            let cleanedDelta = textDelta;
            // Remove JSON content block wrappers like {"type":"text","version":1},{"content":"..."}
            cleanedDelta = cleanedDelta.replace(/\{"type":\s*"text"[^}]*\}/g, "");
            cleanedDelta = cleanedDelta.replace(/\{"content":\s*"/g, "");
            // Convert literal \n to actual newlines
            cleanedDelta = cleanedDelta.replace(/\\n/g, "\n");
            return { ...message, text: `${message.text}${cleanedDelta}` };
          }
          return message;
        }),
      }));
      return;
    }

    if (event.type === "contentBlockStop") {
      debug("EVENT", "contentBlockStop", { index: event.payload.index, textLen: (event.payload.text ?? "").length });
      setState((current) => ({
        ...current,
        messages: current.messages.map((message) =>
          message.blockIndex === event.payload.index && message.streaming
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
        debug("STATE", `final state: ${current.messages.length} messages`, current.messages.map(m => ({ id: m.id, role: m.role, textLen: m.text.length, streaming: m.streaming })));
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
