#!/usr/bin/env node
import { Command } from "commander";

import { runChatCommand } from "./commands/chat/command.js";
import { runChatsCommand } from "./commands/chats/command.js";
import { runSendCommand } from "./commands/send/command.js";
import { runSpacesCommand } from "./commands/spaces/command.js";
import type { AppConfig } from "../tui/lib/types.js";

function collectOverrides(options: {
  region?: string;
  agentSpaceId?: string;
  userId?: string;
}): Partial<AppConfig> {
  return {
    region: options.region ?? process.env.OPSTALK_REGION,
    agentSpaceId: options.agentSpaceId ?? process.env.OPSTALK_AGENT_SPACE_ID,
    userId: options.userId ?? process.env.OPSTALK_USER_ID,
  };
}

const program = new Command();

program
  .name("opstalk")
  .description("Interactive terminal chat CLI for AWS DevOps Agent")
  .option("--region <region>", "AWS region")
  .option("--agent-space-id <id>", "Agent space ID")
  .option("--user-id <id>", "User identifier")
  .action(async (options) => {
    await runChatCommand(collectOverrides(options));
  });

program
  .command("send")
  .argument("<content>", "Message to send")
  .option("--region <region>", "AWS region")
  .option("--agent-space-id <id>", "Agent space ID")
  .option("--user-id <id>", "User identifier")
  .action(async (content: string, options) => {
    await runSendCommand(content, collectOverrides(options));
  });

program
  .command("chats")
  .option("--region <region>", "AWS region")
  .option("--agent-space-id <id>", "Agent space ID")
  .option("--user-id <id>", "User identifier")
  .action(async (options) => {
    await runChatsCommand(collectOverrides(options));
  });

program
  .command("spaces")
  .option("--region <region>", "AWS region")
  .action(async (options) => {
    await runSpacesCommand(collectOverrides(options));
  });

await program.parseAsync(process.argv);
