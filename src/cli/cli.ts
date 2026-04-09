#!/usr/bin/env node
import { Command } from 'commander';
import { runChatCommand } from './commands/chat/command.js';
import { runSendCommand } from './commands/send/command.js';
import { runHistoryCommand } from './commands/history/command.js';
import type { CliOverrides } from '../tui/lib/types.js';

function collectOverrides(options: { gatewayUrl?: string; token?: string; session?: string }): CliOverrides {
  return {
    gatewayUrl: options.gatewayUrl,
    token: options.token,
    session: options.session,
  };
}

const program = new Command();
program
  .name('opstalk')
  .option('--gateway-url <url>')
  .option('--token <token>')
  .option('--session <session>');

program
  .command('chat', { isDefault: true })
  .action(async (_, command) => {
    const parent = command.parent?.opts() as { gatewayUrl?: string; token?: string; session?: string };
    process.exitCode = await runChatCommand(collectOverrides(parent));
  });

program
  .command('send')
  .argument('<message>')
  .option('--no-color')
  .option('--json')
  .option('--session <session>')
  .action(async (message, options, command) => {
    const parent = command.parent?.opts() as { gatewayUrl?: string; token?: string; session?: string };
    process.exitCode = await runSendCommand(message, collectOverrides(parent), options);
  });

program
  .command('history')
  .option('--session <session>')
  .option('--limit <limit>', 'Number of messages to fetch', (v: string) => Number.parseInt(v, 10))
  .action(async (options, command) => {
    const parent = command.parent?.opts() as { gatewayUrl?: string; token?: string; session?: string };
    process.exitCode = await runHistoryCommand(collectOverrides(parent), options);
  });

await program.parseAsync(process.argv);
