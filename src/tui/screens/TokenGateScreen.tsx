import React, { useState } from 'react';
import { Box, Text } from 'ink';
import { useConfigContext } from '../context/ConfigContext.js';
import { useGatewaySession } from '../hooks/useGatewaySession.js';
import { Panel } from '../components/Panel.js';
import { Screen } from '../components/Screen.js';
import { Spinner } from '../components/Spinner.js';
import { useComposer } from '../hooks/useComposer.js';
import type { OpsTalkConfig } from '../lib/types.js';

export function TokenGateScreen({ onComplete }: { onComplete: () => void }) {
  const { config, saveConfig } = useConfigContext();
  const { validateToken } = useGatewaySession();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const composer = useComposer({
    active: !loading,
    onEscape: () => undefined,
    onSubmit: value => {
      void (async () => {
        setLoading(true);
        setError(undefined);
        try {
          await validateToken(value);
          const nextConfig: OpsTalkConfig = {
            ...config!,
            gateway: { ...config!.gateway, token: value },
          };
          await saveConfig(nextConfig);
          onComplete();
        } catch (submitError) {
          setError(submitError instanceof Error ? submitError.message : String(submitError));
        } finally {
          setLoading(false);
        }
      })();
    },
  });

  return (
    <Screen title="OpsTalk Token Setup">
      <Panel title="Gateway Token" borderColor="cyan">
        <Text>Enter the OpenClaw gateway token. It will be saved to the config file as plaintext.</Text>
        <Box marginTop={1}>
          <Text color="cyan">&gt; </Text>
          <Text>{'*'.repeat(composer.value.length)}</Text>
        </Box>
        {loading ? <Spinner label="Validating token" /> : null}
        {error ? <Text color="red">{error}</Text> : null}
      </Panel>
    </Screen>
  );
}
