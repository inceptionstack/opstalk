import React from "react";
import { render } from "ink";

import { loadConfig, mergeConfig } from "../../../config/storage.js";
import { App } from "../../../tui/App.js";
import type { AppConfig } from "../../../tui/lib/types.js";

export async function runChatCommand(overrides: Partial<AppConfig>): Promise<void> {
  const config = mergeConfig({
    ...(await loadConfig()),
    ...overrides,
  });

  render(<App initialConfig={config} />);
}
