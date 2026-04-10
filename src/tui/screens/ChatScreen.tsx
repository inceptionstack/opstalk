import React, { useEffect, useMemo, useRef, useState } from "react";
import { debug } from "../../debug.js";
import { Box, Static, Text, useApp, useInput, useStdout } from "ink";

import type { ChatCommandResult, ChatMessage } from "../lib/types.js";
import { safeWidth } from "../lib/width.js";
import { wrapText } from "../lib/wrap.js";
import { parseMarkdownLine, type StyledLine } from "../lib/terminalMarkdown.js";
import { HELP_TEXT } from "../hooks/useKeymap.js";
import { useComposer } from "../hooks/useComposer.js";
import { ChatComposer } from "../components/ChatComposer.js";
import { Spinner } from "../components/Spinner.js";
import { Panel } from "../components/Panel.js";
import type { DevOpsAgentContextValue } from "../context/DevOpsAgentContext.js";
import { useConfig } from "../context/ConfigContext.js";

function formatToolLine(msg: ChatMessage): string {
  if (msg.toolName) {
    let inputSummary = "";
    if (msg.toolInput) {
      try {
        const input = JSON.parse(msg.toolInput) as Record<string, unknown>;
        // For create_artifact, just show the type (content is displayed separately)
        if (msg.toolName === "create_artifact" && input.artifact_type) {
          inputSummary = String(input.artifact_type);
        } else {
          inputSummary = Object.entries(input)
            .filter(([k]) => k !== "content") // skip large content fields
            .map(([k, v]) => {
              const val = JSON.stringify(v);
              return val.length > 50 ? `${k}=...` : `${k}=${val}`;
            })
            .join(", ");
        }
      } catch {
        inputSummary = msg.toolInput;
      }
    }
    const icon = msg.toolStatus === "success" ? "✓" : msg.toolStatus === "error" ? "✗" : "…";
    return `  → ${msg.toolName}(${inputSummary}) ${icon}`;
  }
  return (msg.text || "").replace(/\s*Done\s*$/g, "").trim();
}

function messageColor(msg: ChatMessage): string | undefined {
  if (msg.role === "user") return "blue";
  if (msg.kind === "tool") return "gray";
  if (msg.role === "assistant") return "green";
  if (msg.role === "error") return "red";
  return "gray";
}

function StyledSegments({ line, baseColor }: { line: StyledLine; baseColor: string | undefined }): React.ReactElement {
  return (
    <Text color={baseColor}>
      {line.segments.map((seg, i) => (
        <Text
          key={i}
          bold={seg.bold}
          italic={seg.italic}
          dimColor={seg.dim}
          color={seg.color ?? baseColor}
        >
          {seg.text}
        </Text>
      ))}
    </Text>
  );
}

function RenderedMessage({ msg, width }: { msg: ChatMessage; width: number }): React.ReactElement {
  const color = messageColor(msg);

  if (msg.kind === "tool") {
    const raw = formatToolLine(msg);
    const lines = wrapText(raw, Math.max(10, width));
    // If there's artifact content (e.g. from create_artifact), show it
    const artifactLines: string[] = [];
    if (msg.artifactContent) {
      const artLines = msg.artifactContent.split("\n");
      for (const al of artLines) {
        // Don't word-wrap artifact lines — they may be ASCII art / diagrams
        artifactLines.push(al);
      }
    }
    return (
      <Box flexDirection="column">
        {lines.map((line, i) => (
          <Text key={`t-${i}`} dimColor>{line}</Text>
        ))}
        {artifactLines.length > 0 ? (
          <>
            <Text>{""}</Text>
            {artifactLines.map((line, i) => (
              <Text key={`a-${i}`} color="green">{line}</Text>
            ))}
          </>
        ) : null}
      </Box>
    );
  }

  const prefix = msg.role === "user" ? "> " : "";
  const fullText = `${prefix}${msg.text}`;
  const textLines = fullText.split("\n");

  return (
    <Box flexDirection="column">
      {textLines.flatMap((textLine, li) => {
        const wrapped = wrapText(textLine, Math.max(10, width));
        return wrapped.map((wl, wi) => {
          const styled = parseMarkdownLine(wl);
          return <StyledSegments key={`${li}-${wi}`} line={styled} baseColor={color} />;
        });
      })}
    </Box>
  );
}

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
  const { stdout } = useStdout();
  const [chatPickerOpen, setChatPickerOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [selectedChatIndex, setSelectedChatIndex] = useState(0);

  const width = safeWidth(stdout?.columns, 80) - 4;

  // Split messages: committed (done) go to Static, active (streaming) stay dynamic
  const committedRef = useRef<ChatMessage[]>([]);

  const { committed, active } = useMemo(() => {
    const all = agent.state.messages;
    const streamingIdx = all.findIndex((m) => m.streaming);

    let newCommitted: ChatMessage[];
    let newActive: ChatMessage[];

    if (streamingIdx === -1) {
      newCommitted = all;
      newActive = [];
    } else {
      newCommitted = all.slice(0, streamingIdx);
      newActive = all.slice(streamingIdx);
    }

    // Only grow committed — Static items can't be removed
    if (newCommitted.length > committedRef.current.length) {
      committedRef.current = newCommitted;
    }

    return { committed: committedRef.current, active: newActive };
  }, [agent.state.messages]);

  const composer = useComposer({
    disabled: agent.state.streaming,
    onSubmit: async (value) => {
      const result = await handleSlashCommand(
        value, agent, exit,
        () => { setSelectedChatIndex(0); setChatPickerOpen(true); setHelpOpen(false); },
        () => { setHelpOpen((c) => !c); setChatPickerOpen(false); },
      );
      if (!result.handled) {
        setHelpOpen(false);
        await agent.sendMessage(value);
      }
    },
  });

  useInput(async (_input, key) => {
    if (chatPickerOpen) {
      if (key.escape) { setChatPickerOpen(false); return; }
      if (key.upArrow) { setSelectedChatIndex((c) => Math.max(0, c - 1)); return; }
      if (key.downArrow) {
        setSelectedChatIndex((c) => Math.min(Math.max(0, agent.state.chats.length - 1), c + 1));
        return;
      }
      if (key.return) {
        const chat = agent.state.chats[selectedChatIndex];
        if (chat) { await agent.resumeChat(chat.executionId); setChatPickerOpen(false); }
      }
    }
  });

  useEffect(() => {
    if (chatPickerOpen) { void agent.loadChats(); }
  }, [agent, chatPickerOpen]);

  debug("CHATSCREEN", `render: committed=${committed.length} active=${active.length} streaming=${agent.state.streaming}`);

  const cols = safeWidth(stdout?.columns, 80);

  return (
    <>
      {/* Committed messages — written to stdout once, terminal-scrollable */}
      <Static items={committed}>
        {(msg: ChatMessage) => (
          <Box key={msg.id} flexDirection="column">
            <RenderedMessage msg={msg} width={width} />
          </Box>
        )}
      </Static>

      {/* Dynamic area — only this re-renders */}
      <Box flexDirection="column">
        {active.map((msg) => (
          <Box key={msg.id} flexDirection="column">
            <RenderedMessage msg={msg} width={width} />
          </Box>
        ))}

        {agent.state.streaming ? <Spinner label="Streaming response" /> : null}

        {chatPickerOpen ? (
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
        ) : null}

        {helpOpen ? (
          <Panel title="Commands">
            <Box flexDirection="column">
              {HELP_TEXT.map((line) => (<Text key={line}>{line}</Text>))}
            </Box>
          </Panel>
        ) : null}

        <Text dimColor>{"─".repeat(cols)}</Text>
        <ChatComposer value={composer.value} cursor={composer.cursor} disabled={agent.state.streaming} />
        <Text dimColor>
          {config.region} · {config.agentSpaceId ?? "-"} · {agent.state.status}
          {"  enter to send · /help commands"}
        </Text>
      </Box>
    </>
  );
}
