# OpsTalk — Design Brief

## What Is This?

An interactive terminal chat CLI for OpenClaw — think "Claude Code but for ops." Built with Ink v6 + React 19 (the same stack as `aws/agentcore-cli`).

OpsTalk connects to the OpenClaw Gateway via WebSocket (same JSON frame protocol as loki-chat web UI) and provides a rich terminal experience for chatting with the agent.

## Target Users

DevOps engineers, SREs, cloud architects who live in the terminal and want to interact with their OpenClaw agent without leaving it.

## Reference Architecture

Study `aws/agentcore-cli` (cloned at `/mnt/ebs-data/builds/agentcore-cli/`) for patterns:
- `src/cli/tui/` — screens, components, hooks, context
- `src/cli/tui/screens/invoke/InvokeScreen.tsx` — the chat screen (closest to what we need)
- `src/cli/tui/components/` — Panel, Screen, TextInput, Header, ScrollableList, etc.
- Uses Commander for CLI routing, Ink for rendering, React for state

## Tech Stack

- **TypeScript** (strict mode)
- **Ink v6** (`ink`, `ink-spinner`, `ink-link`)
- **React 19**
- **Commander** for CLI entry point
- **esbuild** for bundling (single-file dist)
- **No other runtime deps** — keep it minimal

## OpenClaw Gateway Protocol (JSON over WebSocket)

Connection flow:
1. Connect to `ws://host:port/` 
2. Gateway sends `{ type: "event", event: "connect.challenge", payload: { nonce } }`
3. Client sends `{ type: "req", id, method: "connect", params: { minProtocol: 3, maxProtocol: 3, client: { id: "opstalk", version, platform: "cli", mode: "webchat" }, role: "operator", scopes: [...], caps: ["tool-events"], auth: { token } } }`
4. Gateway responds `{ type: "res", id, ok: true, payload }`
5. Now connected — can send `chat.history`, `chat.send`, `chat.abort`

Chat events arrive as:
```json
{ "type": "event", "event": "chat", "payload": { "runId": "...", "state": "delta|final|aborted|error", "message": { "role": "assistant", "content": [...], "text": "..." } } }
```

Content parts: `text`, `thinking`, `tool_use`, `tool_result`, `image_url`

Delta text is **cumulative** — replace previous message, don't append.

## Screens / Views

### 1. Token Gate (first run)
- If no token saved, prompt for gateway token
- Validate by attempting connection
- Save to `~/.config/opstalk/config.json` on success
- Show connection status with spinner

### 2. Chat Screen (main view)
- **Header**: agent name, session key, connection status (dot indicator)
- **Messages area**: scrollable conversation with colored output
  - User messages: blue `> message`
  - Assistant text: green (rendered markdown — bold, italic, code blocks, lists)
  - Thinking blocks: magenta/dim, collapsible with `[thinking...]` summary
  - Tool calls: cyan `🔧 tool_name` with dim args
  - Tool results: dim, truncated
  - System messages: dim yellow
  - Errors: red
  - Streaming: show cursor/spinner on last line during delta
- **Input area**: multi-line text input at bottom
  - Enter to send
  - Esc to cancel input / go to scroll mode
  - `!command` for slash commands
- **Status bar**: connection state, session key, thinking mode indicator

### 3. Slash Commands
- `/quit` or `/exit` — disconnect and exit
- `/clear` — clear message history display
- `/session [key]` — switch session (default: "main")
- `/thinking [off|concise|verbose]` — toggle thinking mode
- `/abort` — cancel current run
- `/history [n]` — reload last n messages
- `/token` — change gateway token
- `/help` — show commands

## Keyboard Shortcuts (when in scroll/chat mode, not input)
- `i` or `Enter` — start typing
- `↑↓` — scroll conversation
- `PgUp/PgDn` — scroll page
- `Ctrl+C` — abort current run or exit
- `n` — new session / clear

## Config File

`~/.config/opstalk/config.json`:
```json
{
  "gateway": {
    "url": "ws://127.0.0.1:3001",
    "token": "..."
  },
  "session": "main",
  "thinkingMode": "off"
}
```

Override with CLI flags: `--gateway-url`, `--token`, `--session`

## CLI Entry Point

```
opstalk                    # Interactive chat (default session "main")
opstalk --session ops      # Different session
opstalk --token <token>    # Override token
opstalk --url ws://...     # Override gateway URL  
opstalk send "message"     # One-shot: send message, print response, exit
opstalk history            # Print recent history and exit
```

## Project Structure

```
src/
  cli/
    cli.ts                 # Commander entry point
    commands/
      chat/
        command.tsx         # Chat command (default)
      send/
        command.tsx         # One-shot send
      history/
        command.tsx         # Print history
  tui/
    screens/
      ChatScreen.tsx        # Main chat screen
      TokenScreen.tsx       # Token entry
    components/
      Header.tsx
      MessageList.tsx       # Scrollable message display
      MessageBubble.tsx     # Single message rendering  
      TextInput.tsx         # Multi-line input
      StatusBar.tsx
      ThinkingBlock.tsx     # Collapsible thinking
      ToolCall.tsx          # Tool use display
      Spinner.tsx           # Streaming indicator
    hooks/
      useGatewayClient.ts   # WebSocket connection hook
      useScrollable.ts      # Scroll management
      useConfig.ts          # Config file management
    context/
      GatewayContext.tsx     # Gateway client context provider
  gateway/
    client.ts              # WebSocket client (protocol implementation)
    types.ts               # Protocol types
    config.ts              # Config file read/write
  utils/
    markdown.ts            # Terminal markdown (bold, italic, code)
package.json
tsconfig.json
esbuild.config.ts          # Bundle config
```

## Design Principles

1. **Fast startup** — connect and show UI < 500ms
2. **Streaming first** — deltas render immediately, no buffering
3. **Terminal-native** — respect terminal width, colors, scrollback
4. **Keyboard-driven** — full-featured without mouse
5. **Minimal deps** — Ink + Commander + React, nothing else
6. **Robust reconnect** — auto-reconnect on disconnect, show status

## Phase 1 Deliverable

Write a `DESIGN.md` that proposes:
1. Component hierarchy diagram (text-based)
2. State management approach
3. Gateway client design
4. Message rendering strategy
5. Keyboard interaction model
6. Any deviations from the brief above with rationale

Then commit it. Do NOT write implementation code yet — design doc only.
