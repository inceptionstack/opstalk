# OpsTalk Final Design

This document resolves the disagreements raised in `REVIEW.md`. It is not a rubber stamp of either draft. Where the review is right, I adopt it. Where I think the original design was aiming at the right problem but overshot Phase 1, I narrow it instead of defending the whole thing.

## Resolved Points

### 1. `command` mode

I agree with the pushback.

Phase 1 should have only:

- `input`
- `scroll`

Slash commands are parsed from composer input on submit. A separate `command` mode adds state transitions, suggestion state, and keybinding ambiguity without solving a Phase 1 problem. The real UX value is slash commands themselves, not a third mode.

What stays:

- typing `/help`, `/session foo`, `/thinking verbose`, `/quit`
- optional inline validation after submit parsing

What moves out:

- command suggestions
- command history
- dedicated command palette behavior

Updated type:

```ts
export type UiMode = 'input' | 'scroll';
```

### 2. Bundling with esbuild

I agree with the pushback for Phase 1.

For an npm-installed Node CLI, single-file bundling is not buying enough. The original motivation was artifact simplicity, not startup time. That trade is weak here because:

- `npm install -g` already installs dependencies locally
- stack traces and source maps matter during early iteration
- bundling complicates ESM and dependency debugging for no user-facing gain

Phase 1 build:

- `tsc` only
- ESM output
- `bin` -> `dist/cli/cli.js`
- no esbuild

If we later need standalone binaries or faster cold start for very large dependency graphs, we can revisit bundling with actual measurements.

### 3. Node WebSocket implementation

I agree.

The design should explicitly target Node 20+ and use `ws` in Phase 1. Relying on browser-style `WebSocket` in a terminal CLI is underspecified and brittle.

Phase 1 dependency decision:

- runtime: `ws`
- types: `@types/ws`

I do not think we need a fake portability abstraction yet. The client should own a small socket adapter boundary internally, but we should not design for browser reuse before we have a browser use case.

### 4. `ink-link` and `ink-spinner`

I agree.

These are not hard enough problems to justify dependencies.

Phase 1 dependency policy:

- required UI deps: `react`, `ink`
- implement spinner inline
- implement terminal hyperlink rendering inline with ANSI OSC 8 when supported, plain text fallback otherwise

This keeps the dependency surface aligned with the original goal of low architectural complexity.

### 5. `send` should stream

I agree.

`opstalk send "message"` should stream to stdout and exit on the terminal event for that run. Waiting for the full response would make the non-interactive command materially worse than the chat UI.

Phase 1 `send` behavior:

- stream assistant text as it arrives
- print tool/thinking blocks only if requested later; Phase 1 default is text-focused output
- exit on run finalization
- non-zero exit on transport/auth/protocol failure

Flags in scope:

- `--no-color`
- `--json`
- `--session <key>`

### 6. Missing explicit `ws` import concern

I agree. This is the same issue as point 3, but it deserves an implementation note because it affects `GatewayClient` directly.

Phase 1 `GatewayClient` is a Node transport client. It should import `WebSocket` from `ws` explicitly and not pretend the environment is generic.

### 7. Token storage security

I agree with the review, with one addition: the design should state the security posture plainly.

Phase 1:

- token may be stored plaintext in config
- config file must be created with `0600` permissions on Unix
- if a file already exists with broader permissions, warn and offer to continue

Out of Phase 1:

- OS keychain integration
- `keytar`
- encrypted local secret storage

The reason to accept plaintext in Phase 1 is operational simplicity, not because it is ideal.

Updated type:

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
    historyLimit: number;
  };
  ui: {
    thinkingMode: ThinkingMode;
    showTimestamps: boolean;
  };
}
```

### 8. Graceful exit

I agree.

This was missing from the original design. In a TUI, graceful shutdown is not optional.

Phase 1 exit contract:

- abort or detach from active run as appropriate
- close the WebSocket
- flush pending config writes
- restore terminal state
- exit with a deterministic code

Signals/events to handle:

- `Ctrl+C`
- uncaught fatal render/runtime error
- normal quit command

This belongs in the app shell, not scattered across screen components.

### 9. `history` command scope

I mostly agree.

The original command surface was already fairly small, but the review is right that `history` should stay minimal. The important distinction is between:

- the existence of a `history` subcommand, which I still want
- adding too many flags and behaviors, which I do not want

Phase 1 `history`:

```text
opstalk history
opstalk history --limit 20
opstalk history --session ops
```

That is enough. No format matrix, no search filters, no replay behavior.

## Revised Architecture

### CLI surface

```text
opstalk
opstalk --session ops
opstalk --gateway-url ws://127.0.0.1:3001
opstalk --token <token>

opstalk send "message" [--session ops] [--no-color] [--json]
opstalk history [--session ops] [--limit 50]
```

### Build and runtime

- Node target: 20+
- module format: ESM
- compiler: `tsc`
- no bundle in Phase 1
- WebSocket runtime: `ws`

### Screen model

```text
<App>
└── <ConfigProvider>
    └── <LayoutProvider>
        └── <GatewaySessionProvider>
            └── <RootRouter>
                ├── <TokenGateScreen />
                └── <ChatScreen />
```

### UI modes

```ts
export type UiMode = 'input' | 'scroll';
```

Behavior:

- default mode is `input`
- `Esc` on empty composer moves to `scroll`
- `i` or `Enter` in scroll returns to `input`
- slash commands are parsed in submit handler

No command mode in Phase 1.

## Updated Types

These types change from the original design because the debate changed both identity and scope.

```ts
export type ThinkingMode = 'off' | 'concise' | 'verbose';

export type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'authenticating'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'auth_error'
  | 'transport_error';

export type UiMode = 'input' | 'scroll';

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
    historyLimit: number;
  };
  ui: {
    thinkingMode: ThinkingMode;
    showTimestamps: boolean;
  };
}

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
  clientRequestId?: string;
  state?: 'streaming' | 'final' | 'aborted' | 'error';
  parts: MessagePart[];
}

export type MessagePart =
  | { id: string; type: 'text'; text: string }
  | { id: string; type: 'thinking'; text: string; collapsedByDefault: boolean }
  | { id: string; type: 'tool_use'; name: string; argumentsText: string }
  | { id: string; type: 'tool_result'; toolName: string; resultText: string; truncated: boolean };

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

export interface RenderRow {
  key: string;
  messageId: string;
  partId: string;
  sourceLine: number;
  wrapRow: number;
  kind: 'text' | 'meta' | 'code' | 'separator';
  spans: Array<{ text: string; color?: string; dim?: boolean; bold?: boolean }>;
}

export interface GatewayConnectOptions {
  url: string;
  token: string;
  minProtocol: 3;
  maxProtocol: 3;
  sessionKey: string;
  connectTimeoutMs: number;
  requestTimeoutMs: number;
}

export interface GatewayClientApi {
  connect(options: GatewayConnectOptions): Promise<void>;
  disconnect(reason?: string): Promise<void>;
  sendChat(params: {
    sessionKey: string;
    text: string;
    thinkingMode: ThinkingMode;
    clientRequestId: string;
  }): Promise<{ runId: string }>;
  abortRun(params: { runId: string }): Promise<void>;
  fetchHistory(params: { sessionKey: string; limit: number }): Promise<GatewayHistoryMessage[]>;
}
```

## Message Identity and Streaming Rules

This needed to be tighter than the original draft.

### Message IDs

I do not want assistant `ChatMessage.id` to be a random UUID if we can avoid it. For streaming and reconnect reconciliation, deterministic identity is better.

Phase 1 identity rules:

- assistant message id: `assistant:${runId}`
- user message id: `user:${clientRequestId}`
- system/error messages: locally generated ids are acceptable because they do not reconcile across history

This is why `clientRequestId` is part of the normalized model. It gives the local echo of the user message a stable identity before the assistant run completes.

### Streaming update rule

Assistant text deltas are cumulative. Therefore:

- update the existing assistant message for `runId`
- replace the current cumulative text part
- do not append a new text part for every delta

### Render row key rule

`RenderRow.key` is for React reconciliation, but it should be derived from logical position, not array index alone.

Phase 1 row key:

```ts
const key = `${messageId}:${partId}:${sourceLine}:${wrapRow}`;
```

Why this is stable enough:

- unchanged wrapped prefix rows keep the same key across incremental streaming
- newly appended wrapped rows get new keys
- if an earlier portion of the same part reflows because width changes or content changed before that line, remounting those rows is acceptable

We do not need stronger guarantees than that in Phase 1.

## Questions Answered

### 1. Can `command` mode wait?

Yes. It should wait.

The UX problem worth solving in Phase 1 is not command discoverability; it is reliable chat input, scroll behavior, and streaming stability. Inline slash command parsing gets us the useful behavior with materially less state.

### 2. Why would esbuild be worth it?

Not for startup time in this design.

My original instinct for esbuild was artifact simplicity. After the review, I do not think that benefit survives contact with the actual distribution model. For an npm CLI, plain compiled ESM is the better default until we have a measured reason to bundle.

### 3. Should `ChatMessage.id` be UUID or run-derived?

Run-derived for assistant messages, request-derived for user messages.

Specifically:

- assistant: `assistant:${runId}`
- user: `user:${clientRequestId}`

That is better than random UUIDs because reconnect, history reload, and streaming upserts all need deterministic identity.

### 4. How should `RenderRow.key` stay stable during streaming?

Use logical row identity, not plain list index.

The key should be composed from:

- `messageId`
- `partId`
- `sourceLine`
- `wrapRow`

That preserves keys for the unchanged prefix of a streaming message while allowing appended rows to appear naturally. Width changes will still cause some remounting, which is acceptable.

## Agreed Phase 1 Scope

### In

- token gate flow for missing token
- chat TUI with `input` and `scroll` modes only
- slash commands parsed from composer submit
- commands: `/help`, `/clear`, `/session`, `/thinking`, `/abort`, `/token`, `/new`, `/quit`
- `GatewayClient` class with explicit `ws` transport
- connect timeout, request timeout, reconnect on non-auth transport failures only
- row-based normalized rendering for stable scrolling
- markdown subset only: paragraphs, inline code, fenced code, bullets, emphasis, links rendered as text
- streaming assistant output with cursor
- thinking block collapse/expand
- tool use rendering
- truncated tool result rendering
- `send` subcommand with streaming stdout output
- `history` subcommand with `--session` and `--limit`
- XDG-aware config resolution
- plaintext token storage with documented `0600` file-permission requirement on Unix
- explicit graceful-exit cleanup
- inline spinner and hyperlink rendering without extra Ink ecosystem deps

### Out

- `command` mode
- slash command suggestion UI
- slash command history UI
- esbuild or single-file bundling
- browser-generic WebSocket transport abstraction
- `ink-spinner`
- `ink-link`
- full markdown support
- inline image rendering or `image_url` block support
- tool result expansion behavior specialized for scroll mode
- keychain or encrypted token storage
- advanced `history` filtering/search/output modes
- standalone binary packaging

