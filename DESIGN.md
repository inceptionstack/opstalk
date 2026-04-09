# OpsTalk Design

## Goals

OpsTalk should feel like a terminal-first chat client, not a web chat squeezed into Ink. The design should optimize for:

- fast startup and immediate input focus
- stable streaming updates under narrow terminal widths
- explicit keyboard modes so scrolling never fights text editing
- a small dependency surface and low architectural complexity

This design uses the good parts of `agentcore-cli`:

- shallow screen composition (`Screen`, `Panel`, layout context)
- local UI mode state at the screen boundary
- narrow context usage for cross-cutting concerns only

It rejects the main weakness of `InvokeScreen.tsx`: too much state and behavior in one component.

## Opinionated Decisions

- Keep `Commander` for the entrypoint, but use it narrowly.
  Rationale: subcommands like `send` and `history` are clearer with Commander, but the app should avoid deep command trees and custom Commander abstractions.

- Use XDG config resolution, not a hard-coded `~/.config/opstalk/config.json`.
  Rationale: Linux users expect XDG; macOS and Windows need sensible fallbacks.

- Use slash commands only. Do not support `!command`.
  Rationale: the brief is inconsistent (`!command` vs `/quit`). Slash commands are standard in chat UIs. `!` should remain plain text.

- Default mode should be `input`, not `scroll`.
  Rationale: this is a chat tool. Typing is the primary action. Scroll mode is secondary.

- Do not render full markdown in Phase 1.
  Rationale: terminal markdown is easy to overbuild badly. Support a strict subset first: paragraphs, inline code, fenced code, bullets, emphasis, links as plain text.

- Thinking blocks should be collapsed by default only when `thinkingMode=concise`.
  Rationale: if the user explicitly chooses `verbose`, hiding content defeats the setting.

- Reconnect automatically only for transport failures, never after auth rejection.
  Rationale: retrying bad credentials is noise.

- The slash command set should be smaller:
  - keep `/help`, `/clear`, `/session`, `/thinking`, `/abort`, `/token`, `/quit`
  - drop `/history` as an in-chat command if a dedicated `history` CLI command exists
  - replace `n` with `/new` for discoverability; optionally keep `n` as a shortcut

## Config Location

Resolution order:

1. `OPSTALK_CONFIG`
2. `$XDG_CONFIG_HOME/opstalk/config.json`
3. `~/.config/opstalk/config.json` on Unix
4. platform fallback:
   - macOS: `~/Library/Application Support/opstalk/config.json`
   - Windows: `%AppData%/opstalk/config.json`

Suggested persisted shape:

```ts
export interface OpsTalkConfig {
  gateway: {
    url: string;
    token?: string;
    connectTimeoutMs: number;
    requestTimeoutMs: number;
  };
  session: {
    lastSessionKey: string;
    autoReconnect: boolean;
  };
  ui: {
    thinkingMode: ThinkingMode;
    theme?: 'default';
    showTimestamps: boolean;
  };
}

export type ThinkingMode = 'off' | 'concise' | 'verbose';
```

## CLI Surface

Keep the CLI small:

```text
opstalk
opstalk --session ops
opstalk --gateway-url ws://127.0.0.1:3001
opstalk --token <token>
opstalk send "message"
opstalk history [--session ops] [--limit 50]
```

Avoid adding more subcommands until the chat UX settles.

## Architecture

### Component Hierarchy

```text
<App>
└── <ConfigProvider>
    └── <LayoutProvider>
        └── <GatewaySessionProvider>
            └── <RootRouter>
                ├── <TokenGateScreen />
                │   └── <Screen>
                │       └── <Panel>
                │           ├── <ConnectionStatus />
                │           └── <TokenInput />
                └── <ChatScreen>
                    └── <Screen>
                        ├── <ChatHeader />
                        ├── <ChatViewportPanel>
                        │   └── <MessageViewport>
                        │       ├── <MessageBlock role="system" />
                        │       ├── <MessageBlock role="user" />
                        │       ├── <AssistantMessage>
                        │       │   ├── <ContentPartText />
                        │       │   ├── <ThinkingBlock />
                        │       │   ├── <ToolUseBlock />
                        │       │   ├── <ToolResultBlock />
                        │       │   └── <ImageUrlBlock />
                        │       └── <StreamingCursor />
                        ├── <ComposerPanel>
                        │   └── <ChatComposer />
                        └── <StatusBar />
```

### File/Module Shape

```text
src/
  cli/
    cli.ts
    commands/
      chat/command.tsx
      send/command.ts
      history/command.ts
  tui/
    App.tsx
    screens/
      TokenGateScreen.tsx
      ChatScreen.tsx
    components/
      Screen.tsx
      Panel.tsx
      ChatHeader.tsx
      MessageViewport.tsx
      MessageBlock.tsx
      AssistantMessage.tsx
      ThinkingBlock.tsx
      ToolUseBlock.tsx
      ToolResultBlock.tsx
      ImageUrlBlock.tsx
      ChatComposer.tsx
      StatusBar.tsx
    context/
      ConfigContext.tsx
      GatewaySessionContext.tsx
      LayoutContext.tsx
    hooks/
      useComposer.ts
      useChatViewport.ts
      useGatewaySession.ts
      useKeymap.ts
  gateway/
    GatewayClient.ts
    protocol.ts
    normalize.ts
  config/
    paths.ts
    storage.ts
```

## State Management

### Rule

Use props for rendering state, context for app-wide services, and local reducer state for screen interaction. Do not put everything into context.

### State Ownership

`ConfigProvider`

- persisted config
- config load/save status

`GatewaySessionProvider`

- live connection state
- session key
- message store
- in-flight request registry
- reconnect metadata
- imperative actions: `connect`, `disconnect`, `sendMessage`, `abortRun`, `switchSession`, `reloadHistory`

`ChatScreen`

- UI mode
- viewport scroll state
- composer state
- ephemeral command palette/help visibility
- local collapsed/expanded thinking block state

`MessageViewport`

- no business state
- receives normalized message rows and viewport params

### Context Boundaries

Use exactly three contexts:

- `ConfigContext`
- `LayoutContext`
- `GatewaySessionContext`

Do not create a separate context for keyboard mode or message rendering. Those should stay screen-local.

### Key Interfaces

```ts
export type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'authenticating'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'auth_error'
  | 'transport_error';

export type UiMode = 'input' | 'scroll' | 'command';

export interface GatewaySessionState {
  connection: {
    state: ConnectionState;
    attempts: number;
    lastError?: string;
    connectedAt?: number;
  };
  sessionKey: string;
  messages: ChatMessage[];
  activeRun?: ActiveRun;
  historyLoaded: boolean;
  thinkingMode: ThinkingMode;
}

export interface ActiveRun {
  runId: string;
  startedAt: number;
  state: 'streaming' | 'aborting';
}

export interface ChatMessage {
  id: string;
  role: 'system' | 'user' | 'assistant' | 'error';
  createdAt: number;
  runId?: string;
  state?: 'streaming' | 'final' | 'aborted' | 'error';
  parts: MessagePart[];
}

export type MessagePart =
  | { type: 'text'; text: string }
  | { type: 'thinking'; text: string; collapsedByDefault: boolean }
  | { type: 'tool_use'; name: string; argumentsText: string }
  | { type: 'tool_result'; toolName: string; resultText: string; truncated: boolean }
  | { type: 'image_url'; url: string; alt?: string };

export interface ChatScreenState {
  mode: UiMode;
  composer: ComposerState;
  viewport: ViewportState;
  collapsedThinking: Record<string, boolean>;
}

export interface ComposerState {
  value: string;
  cursorOffset: number;
  height: number;
}

export interface ViewportState {
  topRow: number;
  pinnedToBottom: boolean;
}
```

### Reducer Shape

`GatewaySessionProvider` should use a reducer, not scattered `useState`, because transport events are naturally event-driven:

```ts
type GatewayAction =
  | { type: 'CONNECT_START' }
  | { type: 'CONNECT_OK' }
  | { type: 'CONNECT_AUTH_ERROR'; error: string }
  | { type: 'CONNECT_TRANSPORT_ERROR'; error: string }
  | { type: 'HISTORY_LOADED'; messages: ChatMessage[] }
  | { type: 'MESSAGE_UPSERT'; message: ChatMessage }
  | { type: 'RUN_STARTED'; runId: string }
  | { type: 'RUN_FINISHED'; runId: string; finalState: ActiveRun['state'] | 'done' }
  | { type: 'SESSION_SWITCHED'; sessionKey: string; messages: ChatMessage[] }
  | { type: 'THINKING_MODE_SET'; mode: ThinkingMode };
```

`ChatScreen` can use a smaller local reducer:

```ts
type ChatUiAction =
  | { type: 'MODE_SET'; mode: UiMode }
  | { type: 'COMPOSER_SET'; value: string; cursorOffset: number; height: number }
  | { type: 'VIEWPORT_SCROLL'; deltaRows: number }
  | { type: 'VIEWPORT_PIN_BOTTOM' }
  | { type: 'THINKING_TOGGLE'; messageId: string };
```

## Gateway Client Design

### Class vs Hook

Use a class for protocol transport and a hook/provider for React integration.

- `GatewayClient` class:
  - owns WebSocket instance
  - owns request/response correlation IDs
  - performs handshake
  - parses and validates protocol frames
  - emits normalized events
  - implements reconnect backoff

- `useGatewaySession` hook:
  - instantiates the client once
  - subscribes to client events
  - dispatches reducer actions
  - exposes React-friendly commands

This split is cleaner than putting socket lifecycle into a hook alone. Hooks are a poor fit for imperative reconnect and request registries.

### Transport Interfaces

```ts
export interface GatewayConnectOptions {
  url: string;
  token: string;
  minProtocol: 3;
  maxProtocol: 3;
  sessionKey: string;
  connectTimeoutMs: number;
  requestTimeoutMs: number;
}

export interface GatewayClientEvents {
  onConnectionState: (state: ConnectionState, error?: string) => void;
  onChatEvent: (event: GatewayChatEvent) => void;
  onHistory: (messages: GatewayHistoryMessage[]) => void;
}

export interface GatewayClientApi {
  connect(options: GatewayConnectOptions): Promise<void>;
  disconnect(reason?: string): Promise<void>;
  sendChat(params: { sessionKey: string; text: string; thinkingMode: ThinkingMode }): Promise<{ runId: string }>;
  abortRun(params: { runId: string }): Promise<void>;
  fetchHistory(params: { sessionKey: string; limit: number }): Promise<GatewayHistoryMessage[]>;
}
```

### Handshake Strategy

```text
socket open
-> wait for connect.challenge
-> send connect req
-> wait for connect res
-> mark connected
-> fetch history for current session
```

Reject the connection if challenge or response is not received before timeout.

### Reconnect Strategy

Reconnect only when:

- socket closes unexpectedly
- previous state was `connected` or `connecting`
- error was not auth-related
- user did not explicitly quit

Backoff:

```text
attempt 1: 250ms
attempt 2: 500ms
attempt 3: 1000ms
attempt 4: 2000ms
attempt 5+: 5000ms cap
```

Behavior:

- preserve current session key
- preserve message list
- refetch recent history after reconnect to reconcile missed frames
- if an active streaming run existed, mark it `aborted` unless history proves it finalized

### Timeout Handling

Three distinct timeouts:

- connect timeout
  covers waiting for socket open, challenge, and connect response
- request timeout
  covers `chat.send`, `chat.abort`, `chat.history`
- idle stream watchdog
  if a run is marked streaming but no chat event arrives for N seconds, show a warning, not an error

Recommended defaults:

```ts
const DEFAULT_CONNECT_TIMEOUT_MS = 8_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const STREAM_IDLE_WARN_MS = 20_000;
```

Do not auto-fail a run on idle alone. Terminal networks and model latency can be bursty.

## Message Model and Rendering

### Normalization

Normalize gateway payloads immediately so the UI never deals with raw protocol frames.

Important rule from the brief:

- assistant delta text is cumulative
- therefore streaming updates must replace the previous assistant text part for that run/message, not append

Suggested normalizer behavior:

```ts
function applyChatEvent(state: GatewaySessionState, event: GatewayChatEvent): GatewaySessionState
```

Rules:

- `state="delta"`:
  - upsert assistant message by `runId`
  - replace matching cumulative parts
- `state="final"`:
  - finalize message and clear `activeRun`
- `state="aborted"`:
  - mark message aborted
- `state="error"`:
  - emit error message block and clear `activeRun`

### Render Strategy by Part Type

- `text`
  - green for assistant, blue-prefixed for user, dim yellow for system, red for errors
  - render markdown subset only

- `thinking`
  - dim magenta
  - show summary row when collapsed: `[thinking: 12 lines hidden]`
  - expansion state local to `ChatScreen`

- `tool_use`
  - cyan label with tool name
  - arguments rendered as dim pretty-printed JSON block if multiline, single line otherwise

- `tool_result`
  - dim block with truncation after row budget
  - allow expand in scroll mode only

- `image_url`
  - terminal cannot display images reliably
  - show `image: <url>` in cyan with optional alt text

### Word Wrapping

Do not rely on Ink alone for wrapping rich messages. Precompute rows.

Reason:

- scroll math must work in rows, not message count
- color and markdown styles need deterministic continuation rows
- cumulative streaming updates should not cause viewport jitter

Recommended pipeline:

```text
normalized message
-> render segments (text + style spans)
-> wrap segments to terminal width
-> flatten to terminal rows
-> viewport slices rows
```

Key interface:

```ts
export interface RenderRow {
  key: string;
  messageId: string;
  kind: 'text' | 'meta' | 'code' | 'separator';
  spans: Array<{ text: string; color?: string; dim?: boolean; bold?: boolean }>;
}
```

Wrapping rules:

- wrap on whitespace for prose
- hard-wrap long tokens
- preserve indentation for bullets and code fences
- never reflow fenced code blocks; hard-wrap them line by line
- reserve 2 columns for scroll indicators/padding math

### Viewport Strategy

Follow the `agentcore-cli` pattern of auto-pinning to bottom until the user scrolls up.

Behavior:

- new rows while pinned -> keep bottom aligned
- new rows while scrolled up -> preserve current top row
- `End` or `G` can re-pin to bottom
- after sending a message, switch to pinned bottom automatically

## Keyboard Interaction Model

Use explicit modes:

- `input`
  typing/editing/send
- `scroll`
  navigate transcript
- `command`
  slash command selection/execution help

Avoid mixing composer keybindings with transcript navigation in one mode.

### Mode Transition Diagram

```text
             Esc              /
  +--------------------+  +--------+
  |                    v  v        |
 [input] ----------> [scroll] --> [command]
    ^  \               |   ^         |
    |   \ Enter send   |   | Esc     |
    |    \ success     |   +---------+
    |                  |
    +------ i, Enter --+
```

More precise transitions:

```text
[input]
- Enter on non-empty composer -> send, remain in input
- Esc on empty composer -> scroll
- Ctrl+C with active run -> abort
- Ctrl+C with no active run -> exit confirmation or quit
- leading "/" + Tab -> command suggestions inline, still input mode

[scroll]
- i or Enter -> input
- / -> command
- j/k or Up/Down -> row scroll
- PgUp/PgDn -> page scroll
- g/G -> top/bottom
- Esc -> input if no scroll offset, otherwise keep scroll

[command]
- Enter -> execute command
- Esc -> return to previous mode
- Up/Down -> command history or suggestions
```

### Keymap

`input` mode:

- `Enter`: send if composer is non-empty and not in multiline insert modifier mode
- `Shift+Enter` or `Alt+Enter`: newline, if terminal reliably exposes it; otherwise `/multiline` toggle is safer
- `Esc`: if composer empty, switch to scroll; otherwise clear command suggestions first
- standard text editing shortcuts from `useTextInput` pattern:
  - arrows
  - `Ctrl+A`, `Ctrl+E`
  - `Alt+B`, `Alt+F`
  - `Ctrl+W`, `Ctrl+U`, `Ctrl+K`

`scroll` mode:

- `Up`, `Down`, `PgUp`, `PgDn`, `g`, `G`
- `i`, `Enter`
- `/`
- `Ctrl+C`

`global`:

- `Ctrl+C`: abort active run first, otherwise quit
- `Ctrl+L`: force redraw if Ink screen gets dirty

## Pseudo-JSX

```tsx
export function App() {
  return (
    <ConfigProvider>
      <LayoutProvider>
        <GatewaySessionProvider>
          <RootRouter />
        </GatewaySessionProvider>
      </LayoutProvider>
    </ConfigProvider>
  );
}

function RootRouter() {
  const { hasToken } = useConfig();
  return hasToken ? <ChatScreen /> : <TokenGateScreen />;
}

function ChatScreen() {
  const session = useGatewaySession();
  const [ui, dispatch] = useChatScreenReducer();
  const rows = useRenderedRows(session.messages, ui.collapsedThinking);
  const viewport = useChatViewport(rows, ui.viewport, ui.mode);

  return (
    <Screen
      title="OpsTalk"
      headerContent={<ChatHeader session={session} mode={ui.mode} />}
      footerContent={<StatusBar session={session} mode={ui.mode} />}
      exitEnabled={ui.mode !== 'input'}
      onExit={session.quit}
    >
      <Panel fullWidth flexGrow={1} title="Conversation">
        <MessageViewport rows={viewport.visibleRows} viewport={viewport} />
      </Panel>

      <Panel fullWidth title={ui.mode === 'command' ? 'Command' : 'Compose'}>
        <ChatComposer
          mode={ui.mode}
          value={ui.composer.value}
          onChange={next => dispatch({ type: 'COMPOSER_SET', ...next })}
          onSubmit={text => session.sendMessage(text)}
          onCommand={cmd => session.executeCommand(cmd)}
        />
      </Panel>
    </Screen>
  );
}
```

## Deviations From The Brief

### 1. Slash Commands, Not `!command`

The brief says both `!command` and `/quit`. That is unnecessary ambiguity. Use slash commands only.

### 2. Config Path Should Be XDG-Aware

Hard-coding `~/.config/opstalk/config.json` is acceptable on Linux, but weak as a cross-platform design.

### 3. History Should Be a Transport Concern, Not a Screen Concern

The brief suggests a `/history` UI action and a dedicated CLI command. The screen should ask the session layer to reload history; it should not own protocol calls directly.

### 4. Message Rendering Needs a Row Model

The brief says “rendered markdown” but does not specify how to make scrolling stable. Stable row computation is mandatory in a TUI chat app.

### 5. Component Tree in the Brief Is Slightly Too Flat

`MessageBubble.tsx` is too web-chat-oriented. Assistant output needs part-level composition because thinking, tool use, and tool result blocks have different behaviors.

### 6. `useGatewayClient.ts` Alone Is Not Enough

The transport should not live entirely inside a hook. A dedicated `GatewayClient` class is more testable and easier to reason about under reconnect and timeout pressure.

### 7. Full Markdown Support Is the Wrong Phase-1 Tradeoff

Phase 1 should support a strict markdown subset and stable wrapping. Fancy markdown can come later.

### 8. `StatusBar` Should Carry Mode and Run State, Not Just Connection

The brief underspecifies this. In practice, the user needs to see:

- connection status
- session key
- mode
- active run state
- thinking mode

That is higher-value than decorative chrome.

## Suggested Slash Commands

Keep:

- `/help`
- `/quit`
- `/clear`
- `/session <key>`
- `/thinking <off|concise|verbose>`
- `/abort`
- `/token`
- `/new`

Optional later:

- `/reconnect`
- `/copy-run <id>`
- `/save <path>`

Avoid for now:

- `/history [n]`
  too much overlap with scrollback and `opstalk history`

## Risks

- terminals differ in how they emit modified Enter keys; multiline composer behavior needs fallback design
- markdown rendering can become a maintenance trap if the subset is not enforced
- reconnect plus cumulative deltas can duplicate or regress messages unless run reconciliation is keyed by `runId`
- Ink redraw frequency under rapid streaming must be watched; row precomputation should be incremental where possible

## Recommended Next Step

Before implementation, lock three small contracts:

1. final gateway protocol type definitions
2. normalized `ChatMessage` shape
3. keymap behavior for multiline input vs send

Those three decisions will determine whether the implementation stays simple or sprawls.
