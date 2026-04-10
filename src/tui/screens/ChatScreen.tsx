import type { DevOpsAgentController } from "../../agent/controller.js";
import { HELP_TEXT } from "../hooks/useKeymap.js";
import { formatErrorMessage, formatSystemMessage, writeLine } from "../lib/consoleOutput.js";

export async function handleChatSlashCommand(
  value: string,
  agent: DevOpsAgentController,
  exit: () => void,
): Promise<boolean> {
  const [command, ...args] = value.trim().split(/\s+/);

  switch (command) {
    case "/quit":
    case "/exit":
      exit();
      return true;
    case "/clear":
      agent.clearMessages();
      writeLine(formatSystemMessage("Transcript state cleared. Terminal scrollback is unchanged."));
      return true;
    case "/new":
      await agent.createNewChat();
      return true;
    case "/help":
      for (const line of HELP_TEXT) {
        writeLine(formatSystemMessage(line));
      }
      writeLine();
      return true;
    case "/chats": {
      const chats = await agent.loadChats();
      if (chats.length === 0) {
        writeLine(formatSystemMessage("No chats yet."));
        return true;
      }

      writeLine(formatSystemMessage("Recent chats"));
      chats.forEach((chat, index) => {
        writeLine(formatSystemMessage(`  ${index + 1}. ${chat.summary ?? chat.executionId} (${chat.executionId})`));
      });
      writeLine(formatSystemMessage("Use /resume <number|execution-id> to reopen a chat."));
      writeLine();
      return true;
    }
    case "/resume": {
      const target = args.join(" ").trim();
      if (!target) {
        writeLine(formatErrorMessage("Usage: /resume <number|execution-id>"));
        return true;
      }

      const chats = agent.state.chats.length > 0 ? agent.state.chats : await agent.loadChats();
      const byIndex = Number(target);
      const chat =
        Number.isInteger(byIndex) && byIndex > 0 && byIndex <= chats.length
          ? chats[byIndex - 1]
          : chats.find((item) => item.executionId === target);

      if (!chat) {
        writeLine(formatErrorMessage(`Chat not found: ${target}`));
        return true;
      }

      await agent.resumeChat(chat.executionId);
      return true;
    }
    default:
      return false;
  }
}
