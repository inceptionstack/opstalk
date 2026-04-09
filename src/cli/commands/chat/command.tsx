import React from 'react';
import { render } from 'ink';
import { App } from '../../../tui/App.js';
import type { CliOverrides } from '../../../tui/lib/types.js';

export async function runChatCommand(overrides: CliOverrides): Promise<number> {
  return await new Promise<number>(resolve => {
    let app: ReturnType<typeof render>;
    app = render(
      <App
        overrides={overrides}
        onExit={() => {
          app.unmount();
          resolve(0);
        }}
      />
    );
    const stop = (): void => {
      app.unmount();
      resolve(0);
    };

    process.once('SIGINT', stop);
    process.once('uncaughtException', error => {
      app.unmount();
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      resolve(1);
    });
  });
}
