import React, { useEffect, useMemo, useRef, useState } from "react";

import { ConfigProvider } from "./context/ConfigContext.js";
import { DevOpsAgentProvider } from "./context/DevOpsAgentContext.js";
import { useDevOpsAgent } from "./hooks/useDevOpsAgent.js";
import { ChatScreen } from "./screens/ChatScreen.js";
import { SetupScreen } from "./screens/SetupScreen.js";
import type { AppConfig } from "./lib/types.js";
import { getBanner } from "./lib/banner.js";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function getVersion(): string {
  try {
    const pkg = require("../../package.json") as { version: string };
    return pkg.version;
  } catch {
    return "?";
  }
}

export function App({ initialConfig }: { initialConfig: AppConfig }): React.ReactElement {
  const [config, setConfig] = useState(initialConfig);
  const agent = useDevOpsAgent(config, setConfig);

  const configValue = useMemo(
    () => ({
      config,
      setConfig,
    }),
    [config],
  );

  const loadSpaces = async () => {
    const response = await agent.client.listAgentSpaces();
    return response.agentSpaces;
  };

  const prevSpaceId = useRef(config.agentSpaceId);
  useEffect(() => {
    // When transitioning from no space (setup) to a space (chat), print banner
    if (config.agentSpaceId && !prevSpaceId.current) {
      // Clear terminal and reprint banner
      process.stdout.write("\x1b[2J\x1b[H");
      console.log(getBanner(getVersion()));
      console.log(`  \x1b[2m${config.agentSpaceId}\x1b[0m`);
      console.log();
    }
    prevSpaceId.current = config.agentSpaceId;
  }, [config.agentSpaceId]);

  return (
    <ConfigProvider value={configValue}>
      <DevOpsAgentProvider value={agent}>
        {config.agentSpaceId ? (
          <ChatScreen agent={agent} />
        ) : (
          <SetupScreen loadSpaces={loadSpaces} onSelect={agent.selectAgentSpace} />
        )}
      </DevOpsAgentProvider>
    </ConfigProvider>
  );
}
