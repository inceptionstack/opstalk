import React from "react";
import { render } from "ink";

import { loadConfig, mergeConfig } from "../../../config/storage.js";
import { App } from "../../../tui/App.js";
import type { AppConfig } from "../../../tui/lib/types.js";
import { formatHeader, writeLine } from "../../../tui/lib/consoleOutput.js";

export async function runChatCommand(overrides: Partial<AppConfig>): Promise<void> {
  const config = mergeConfig({
    ...(await loadConfig()),
    ...overrides,
  });

  // Print header to stdout before Ink takes over
  for (const line of formatHeader(config.region, config.agentSpaceId)) {
    writeLine(line);
  }
  writeLine();

  render(<App initialConfig={config} />);
}
