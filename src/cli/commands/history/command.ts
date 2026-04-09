import { GatewayClient } from '../../../gateway/GatewayClient.js';
import { applyOverrides, readConfig } from '../../../config/storage.js';
import { normalizeHistoryMessages } from '../../../gateway/normalize.js';
import type { CliOverrides } from '../../../tui/lib/types.js';

export async function runHistoryCommand(
  overrides: CliOverrides,
  options: { limit?: number; session?: string }
): Promise<number> {
  const loaded = await readConfig();
  const config = applyOverrides(loaded.config, { ...overrides, session: options.session });
  const token = config.gateway.token;
  if (!token) {
    process.stderr.write('Missing gateway token.\n');
    return 1;
  }

  const client = new GatewayClient();
  try {
    await client.connect({
      url: config.gateway.url,
      token,
      sessionKey: options.session ?? config.session.lastSessionKey,
      minProtocol: 3,
      maxProtocol: 3,
      connectTimeoutMs: config.gateway.connectTimeoutMs,
      requestTimeoutMs: config.gateway.requestTimeoutMs,
    });
    const history = await client.fetchHistory({
      sessionKey: options.session ?? config.session.lastSessionKey,
      limit: options.limit ?? config.session.historyLimit,
    });
    const messages = normalizeHistoryMessages(history as Parameters<typeof normalizeHistoryMessages>[0], config.ui.thinkingMode);
    for (const message of messages) {
      const parts = message.parts
        .map(part => {
          if (part.type === 'text') return part.text;
          if (part.type === 'thinking') return `[thinking] ${part.text}`;
          if (part.type === 'tool_use') return `[tool ${part.name}] ${part.argumentsText}`;
          return `[result ${part.toolName}] ${part.resultText}`;
        })
        .join('\n');
      process.stdout.write(`${message.role}: ${parts}\n\n`);
    }
    await client.disconnect();
    return 0;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}
