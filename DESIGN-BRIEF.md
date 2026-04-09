# OpsTalk — Design Brief (v2: AWS DevOps Agent)

## What Is This?

An interactive terminal chat CLI for **AWS DevOps Agent** — think "Claude Code but for ops." Built with Ink v6 + React 19 (the same stack as `aws/agentcore-cli`).

OpsTalk connects to the AWS DevOps Agent API to create chats, send messages, and stream responses. It provides a rich terminal experience for having operational conversations with your DevOps Agent.

## Target Users

DevOps engineers, SREs, cloud architects who live in the terminal and want to interact with AWS DevOps Agent without opening the console.

## AWS DevOps Agent API

### Authentication
- AWS IAM credentials (same as `aws` CLI — instance profile, env vars, config file, SSO)
- Region-aware: service endpoint is `devops-agent.<region>.amazonaws.com`
- SendMessage uses data plane prefix: `dp.devops-agent.<region>.amazonaws.com`

### API Flow
1. **List agent spaces**: `ListAgentSpaces` → get `agentSpaceId`
2. **Create chat**: `CreateChat(agentSpaceId, userId, userType)` → `executionId`
3. **Send message**: `SendMessage(agentSpaceId, executionId, content, userId)` → event stream
4. **List chats**: `ListChats(agentSpaceId, userId)` → previous chat sessions
5. **Get journal**: `ListJournalRecords(agentSpaceId, executionId)` → conversation history

### SendMessage Event Stream
Responses stream via HTTP event stream (not WebSocket). Events in order:
```
responseCreated → responseInProgress → 
  contentBlockStart(index, type, id) → 
  contentBlockDelta(index, delta: {textDelta: {text}}) → ... → 
  contentBlockStop(index, type, text, last?) → 
responseCompleted(responseId, usage) | responseFailed(errorCode, errorMessage)
```

Content block types: text, structured JSON (tool use)
Delta model: incremental text fragments (APPEND, not replace)
Heartbeat events keep connection alive during idle.

### Key Differences from OpenClaw
- **HTTP event stream, not WebSocket** — each SendMessage is a POST that streams events
- **IAM auth, not token** — uses AWS SDK credential chain
- **Agent spaces** — must select/configure which agent space to talk to
- **Execution = chat session** — executionId is the conversation thread
- **Deltas are incremental** (append), not cumulative (replace)
- **No "thinking" mode toggle** — agent controls its own reasoning
- **No session key** — chat identified by executionId

## Tech Stack (unchanged)

- **TypeScript** (strict mode)
- **Ink v6** + **React 19**
- **Commander** for CLI entry point
- **@aws-sdk/client-devops-agent** or raw AWS SDK HTTP calls
- **tsc** for compilation (no bundler)
- **No ink-spinner, ink-link** — inline implementations

## Config File

`~/.config/opstalk/config.json`:
```json
{
  "region": "us-east-1",
  "agentSpaceId": "my-space",
  "userId": "roy",
  "userType": "IAM",
  "ui": {
    "thinkingMode": "off"
  }
}
```

Override with CLI flags: `--region`, `--agent-space-id`, `--user-id`
Or env vars: `OPSTALK_REGION`, `OPSTALK_AGENT_SPACE_ID`

## Screens / Views

### 1. Setup Screen (first run)
- If no agentSpaceId configured, list available agent spaces
- Let user select one (or enter manually)
- Save to config
- Validate by calling ListChats

### 2. Chat Screen (main view)  
- **Header**: agent space name, execution ID, connection status
- **Messages area**: scrollable conversation
  - User messages: blue `> message`
  - Assistant text: green (rendered markdown)
  - Tool/function calls: cyan `🔧 tool_name` with dim args (from JSON content blocks)
  - Errors: red
  - Streaming: show spinner + incremental text during contentBlockDelta
- **Input area**: multi-line text input at bottom
- **Status bar**: region, agent space, execution ID, streaming state

### 3. Slash Commands
- `/quit` or `/exit` — exit
- `/clear` — clear display
- `/new` — create new chat (new execution)
- `/chats` — list recent chats, select one to resume
- `/space [id]` — switch agent space
- `/abort` — cancel (if supported)
- `/help` — show commands

## CLI Entry Point

```
opstalk                           # Interactive chat (creates new chat or resumes)
opstalk --agent-space-id <id>     # Specify agent space
opstalk --region us-west-2        # Override region
opstalk send "what's happening?"  # One-shot: send, stream response, exit
opstalk chats                     # List recent chats
opstalk spaces                    # List agent spaces
```

## Project Structure

```
src/
  cli/
    cli.ts                    # Commander entry point
    commands/
      chat/command.tsx        # Interactive chat (default)
      send/command.ts         # One-shot send
      chats/command.ts        # List chats
      spaces/command.ts       # List agent spaces
  tui/
    App.tsx
    screens/
      SetupScreen.tsx         # Agent space selection
      ChatScreen.tsx          # Main chat
    components/
      ChatHeader.tsx
      MessageViewport.tsx
      MessageBlock.tsx
      AssistantMessage.tsx
      ChatComposer.tsx
      StatusBar.tsx
      Spinner.tsx
      Panel.tsx, Screen.tsx
    hooks/
      useComposer.ts
      useChatViewport.ts
      useDevOpsAgent.ts       # API integration hook
      useKeymap.ts
    context/
      ConfigContext.tsx
      DevOpsAgentContext.tsx   # Agent session state
      LayoutContext.tsx
    lib/
      types.ts
      markdown.ts
      renderRows.ts
      wrap.ts, width.ts
  agent/
    client.ts                 # AWS DevOps Agent API client (Sigv4 HTTP)
    types.ts                  # API types
    eventParser.ts            # Parse SSE/event stream from SendMessage
  config/
    paths.ts
    storage.ts
package.json
tsconfig.json
```

## Design Principles

1. **Fast startup** — list spaces, create chat < 1s
2. **Streaming first** — contentBlockDelta renders immediately
3. **Terminal-native** — colors, word wrap, scrollback
4. **Keyboard-driven** — input/scroll modes, full readline
5. **AWS-native auth** — uses standard credential chain (no custom tokens)
6. **Minimal deps** — Ink + Commander + React + AWS SDK signer

## Phase 1 Scope

**IN:**
- Setup screen (list spaces, pick one, save)
- Chat screen with input/scroll modes
- SendMessage streaming with content block rendering
- CreateChat for new sessions
- ListChats for resuming
- ListJournalRecords for history
- Row-based message rendering
- Markdown subset (paragraphs, bold, italic, code, bullets)
- /help, /clear, /new, /chats, /quit
- `send` and `chats` CLI subcommands
- XDG config with 0600

**OUT (Phase 2):**
- Tool use rendering (structured JSON blocks)  
- Investigation integration (list-executions, list-goals)
- Backlog task management
- MCP server connection
- Recommendation viewing
