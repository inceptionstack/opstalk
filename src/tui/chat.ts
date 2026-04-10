import readline from "node:readline";
import { stdin, stdout } from "node:process";

import type { DevOpsAgentController } from "../agent/controller.js";
import { handleChatSlashCommand } from "./screens/ChatScreen.js";
import { formatErrorMessage, formatSystemMessage, writeLine } from "./lib/consoleOutput.js";
import type { AppConfig } from "./lib/types.js";

function buildPrompt(config: AppConfig, agent: DevOpsAgentController): string {
  const parts = [config.region, config.agentSpaceId ?? "no-space", agent.state.executionId ?? "new"];
  return `\u001B[36m${parts.join(" · ")} › \u001B[0m`;
}

function showPrompt(rl: readline.Interface, config: AppConfig, agent: DevOpsAgentController): void {
  const cols = stdout.columns ?? 80;
  rl.setPrompt(buildPrompt(config, agent));
  stdout.write(`${formatSystemMessage("─".repeat(Math.max(1, cols)))}\n`);
  rl.prompt();
}

export async function startChat(config: AppConfig, agent: DevOpsAgentController): Promise<void> {
  const rl = readline.createInterface({
    input: stdin,
    output: stdout,
    terminal: true,
    historySize: 1000,
  });

  let closed = false;
  let queue = Promise.resolve();

  const close = () => {
    if (closed) {
      return;
    }

    closed = true;
    rl.close();
  };

  rl.on("SIGINT", close);
  rl.on("line", (input) => {
    queue = queue
      .then(async () => {
        const trimmed = input.trim();
        if (!trimmed) {
          showPrompt(rl, agent.config, agent);
          return;
        }

        const handled = await handleChatSlashCommand(trimmed, agent, close);
        if (handled) {
          if (!closed) {
            showPrompt(rl, agent.config, agent);
          }
          return;
        }

        try {
          await agent.sendMessage(trimmed);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          writeLine(formatErrorMessage(message));
        }

        if (!closed) {
          showPrompt(rl, agent.config, agent);
        }
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        writeLine(formatErrorMessage(message));
        if (!closed) {
          showPrompt(rl, agent.config, agent);
        }
      });
  });

  await new Promise<void>((resolve) => {
    rl.on("close", () => {
      closed = true;
      resolve();
    });

    writeLine(formatSystemMessage("Type /help for commands."));
    showPrompt(rl, config, agent);
  });
}
