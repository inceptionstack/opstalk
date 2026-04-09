import { GatewayClient } from '../../../gateway/GatewayClient.js';
import type { GatewayChatEventPayload, GatewayContentPart } from '../../../gateway/protocol.js';
import { readConfig, applyOverrides } from '../../../config/storage.js';
import type { CliOverrides, ThinkingMode } from '../../../tui/lib/types.js';

function writeOutput(text: string, noColor: boolean): void {
  const value = noColor ? text.replace(/\u001b\[[0-9;]*m/g, '') : text;
  process.stdout.write(value);
}

export async function runSendCommand(
  message: string,
  overrides: CliOverrides,
  options: { noColor?: boolean | undefined; json?: boolean | undefined; session?: string | undefined }
): Promise<number> {
  const loaded = await readConfig();
  const config = applyOverrides(loaded.config, { ...overrides, ...(options.session ? { session: options.session } : {}) });
  const token = config.gateway.token;
  if (!token) {
    process.stderr.write('Missing gateway token. Run opstalk to configure.\n');
    return 1;
  }

  const client = new GatewayClient();
  let finalState = 0;
  let activeRunId: string | undefined;
  let lastText = '';

  client.onChat((payload: GatewayChatEventPayload) => {
    if (activeRunId && payload.runId !== activeRunId) return;

    const partText =
      payload.message?.content
        ?.filter((part: GatewayContentPart) => part.type === 'text')
        .map((part: GatewayContentPart) => (part.type === 'text' ? part.text : ''))
        .join('\n') ??
      payload.message?.text ??
      '';

    if (options.json) {
      writeOutput(`${JSON.stringify(payload)}\n`, Boolean(options.noColor));
      if (payload.state !== 'delta') finalState = payload.state === 'error' ? 1 : 0;
      return;
    }

    if (partText.startsWith(lastText)) {
      writeOutput(partText.slice(lastText.length), Boolean(options.noColor));
      lastText = partText;
    } else if (partText) {
      writeOutput(`\n${partText}`, Boolean(options.noColor));
      lastText = partText;
    }

    if (payload.state !== 'delta') {
      writeOutput('\n', Boolean(options.noColor));
      finalState = payload.state === 'error' ? 1 : 0;
    }
  });

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

    const response = await client.sendChat({
      sessionKey: options.session ?? config.session.lastSessionKey,
      text: message,
      thinkingMode: config.ui.thinkingMode as ThinkingMode,
      clientRequestId: `send:${Date.now()}`,
    });
    activeRunId = response.runId;

    // Wait for run to complete
    await new Promise<void>(resolve => {
      client.onChat((payload: GatewayChatEventPayload) => {
        if (payload.runId === activeRunId && payload.state !== 'delta') resolve();
      });
    });

    await client.disconnect();
    return finalState;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}
