import React, { useMemo, useState } from 'react';
import { Box, Text } from 'ink';
import { ConfigProvider, useConfigContext } from './context/ConfigContext.js';
import { GatewaySessionProvider } from './context/GatewaySessionContext.js';
import { LayoutProvider } from './context/LayoutContext.js';
import { ChatScreen } from './screens/ChatScreen.js';
import { TokenGateScreen } from './screens/TokenGateScreen.js';
import type { CliOverrides } from './lib/types.js';

function RootRouter({ onExit }: { onExit: () => void }) {
  const { config, warnings, loading } = useConfigContext();
  const [forceTokenGate, setForceTokenGate] = useState(false);

  const showTokenGate = forceTokenGate || !config?.gateway.token;

  if (loading || !config) {
    return <Text>Loading configuration...</Text>;
  }

  return (
    <GatewaySessionProvider config={config}>
      <Box flexDirection="column">
        {warnings.map((warning, index) => (
          <Text key={`warning:${index}`} color="yellow">
            {warning}
          </Text>
        ))}
        {showTokenGate ? (
          <TokenGateScreen onComplete={() => setForceTokenGate(false)} />
        ) : (
          <ChatScreen onQuit={onExit} onChangeToken={() => setForceTokenGate(true)} />
        )}
      </Box>
    </GatewaySessionProvider>
  );
}

export function App({
  overrides,
  onExit,
}: {
  overrides: CliOverrides;
  onExit: () => void;
}) {
  const stableOverrides = useMemo(() => overrides, [overrides]);
  return (
    <ConfigProvider overrides={stableOverrides}>
      <LayoutProvider>
        <RootRouter onExit={onExit} />
      </LayoutProvider>
    </ConfigProvider>
  );
}
