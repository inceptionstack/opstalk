import React, { useEffect, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";

import type { ChatCommandResult } from "../lib/types.js";
import { HELP_TEXT } from "../hooks/useKeymap.js";
import { useComposer } from "../hooks/useComposer.js";
import { ChatComposer } from "../components/ChatComposer.js";
import { ChatHeader } from "../components/ChatHeader.js";
import { MessageViewport } from "../components/MessageViewport.js";
import { Screen } from "../components/Screen.js";
import { Spinner } from "../components/Spinner.js";
import { StatusBar } from "../components/StatusBar.js";
import { Panel } from "../components/Panel.js";
import type { DevOpsAgentContextValue } from "../context/DevOpsAgentContext.js";
import { useConfig } from "../context/ConfigContext.js";

async function handleSlashCommand(
  value: string,
  agent: DevOpsAgentContextValue,
  exit: () => void,
  showChats: () => void,
  showHelp: () => void,
): Promise<ChatCommandResult> {
  const [command] = value.trim().split(/\s+/);

  switch (command) {
    case "/quit":
    case "/exit":
      exit();
      return { handled: true, exit: true };
    case "/clear":
      agent.clearMessages();
      return { handled: true, cleared: true };
    case "/new":
      await agent.createNewChat();
      return { handled: true };
    case "/help":
      showHelp();
      return { handled: true };
    case "/chats":
      showChats();
      return { handled: true };
    default:
      return { handled: false };
  }
}

export function ChatScreen({
  agent,
}: {
  agent: DevOpsAgentContextValue;
}): React.ReactElement {
  const { exit } = useApp();
  const { config } = useConfig();
  const [chatPickerOpen, setChatPickerOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [selectedChatIndex, setSelectedChatIndex] = useState(0);
  const composer = useComposer({
    disabled: agent.state.streaming,
    onSubmit: async (value) => {
      const result = await handleSlashCommand(
        value,
        agent,
        exit,
        () => {
          setSelectedChatIndex(0);
          setChatPickerOpen(true);
          setHelpOpen(false);
        },
        () => {
          setHelpOpen((current) => !current);
          setChatPickerOpen(false);
        },
      );
      if (!result.handled) {
        setHelpOpen(false);
        await agent.sendMessage(value);
      }
    },
  });

  useInput(async (_input, key) => {
    if (!chatPickerOpen) {
      return;
    }

    if (key.escape) {
      setChatPickerOpen(false);
      return;
    }

    if (key.upArrow) {
      setSelectedChatIndex((current) => Math.max(0, current - 1));
      return;
    }

    if (key.downArrow) {
      setSelectedChatIndex((current) => Math.min(Math.max(0, agent.state.chats.length - 1), current + 1));
      return;
    }

    if (key.return) {
      const chat = agent.state.chats[selectedChatIndex];
      if (chat) {
        await agent.resumeChat(chat.executionId);
        setChatPickerOpen(false);
      }
    }
  });

  useEffect(() => {
    if (chatPickerOpen) {
      void agent.loadChats();
    }
  }, [agent, chatPickerOpen]);

  return (
    <Screen>
      <ChatHeader
        region={config.region}
        agentSpaceId={config.agentSpaceId}
        executionId={agent.state.executionId}
        status={agent.state.status}
      />
      <Box flexDirection="column" marginTop={1}>
        <MessageViewport messages={agent.state.messages} title="Conversation" />
      </Box>
      {chatPickerOpen ? (
        <Box marginTop={1}>
          <Panel title="Recent Chats">
            <Box flexDirection="column">
              {agent.state.chats.map((chat, index) => (
                <Text key={chat.executionId} color={selectedChatIndex === index ? "cyan" : undefined}>
                  {selectedChatIndex === index ? "›" : " "} {chat.summary ?? chat.executionId}
                </Text>
              ))}
              {agent.state.chats.length === 0 ? <Text dimColor>No chats yet.</Text> : null}
            </Box>
          </Panel>
        </Box>
      ) : null}
      {helpOpen ? (
        <Box marginTop={1}>
          <Panel title="Commands">
            <Box flexDirection="column">
              {HELP_TEXT.map((line) => (
                <Text key={line}>{line}</Text>
              ))}
            </Box>
          </Panel>
        </Box>
      ) : null}
      <Box marginTop={1} flexDirection="column">
        {agent.state.streaming ? <Spinner label="Streaming response" /> : null}
        <ChatComposer value={composer.value} cursor={composer.cursor} disabled={agent.state.streaming} />
      </Box>
      <Box marginTop={1}>
        <StatusBar
          region={config.region}
          agentSpaceId={config.agentSpaceId}
          executionId={agent.state.executionId}
          status={agent.state.status}
        />
      </Box>
    </Screen>
  );
}
