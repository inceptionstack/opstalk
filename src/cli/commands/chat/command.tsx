import React from "react";
import { render } from "ink";
import { createRequire } from "node:module";

import { loadConfig, mergeConfig } from "../../../config/storage.js";
import { App } from "../../../tui/App.js";
import type { AppConfig } from "../../../tui/lib/types.js";
import { getBanner } from "../../../tui/lib/banner.js";

const require = createRequire(import.meta.url);

export async function runChatCommand(overrides: Partial<AppConfig>): Promise<void> {
  const config = mergeConfig({
    ...(await loadConfig()),
    ...overrides,
  });

  // Show banner
  try {
    const pkg = require("../../../../package.json") as { version: string };
    console.log(getBanner(pkg.version));
  } catch {
    console.log(getBanner("?"));
  }
  console.log();

  render(<App initialConfig={config} />);
}
