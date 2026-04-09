import React from 'react';
import { Box, Text } from 'ink';
import type { RenderRow } from '../lib/types.js';

export function MessageViewport({ rows }: { rows: RenderRow[] }) {
  return (
    <Box flexDirection="column">
      {rows.map(row => (
        <Text key={row.key}>
          {row.spans.map((span, index) => (
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            <Text key={`${row.key}:${index}`} {...(span.color ? { color: span.color } : {})} {...(span.dim ? { dimColor: true } : {})} {...(span.bold ? { bold: true } : {})} {...(span.italic ? { italic: true } : {})}>
              {span.text}
            </Text>
          ))}
        </Text>
      ))}
    </Box>
  );
}
