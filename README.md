# OpsTalk

Interactive terminal chat CLI for AWS DevOps Agent.

[![CI](https://github.com/inceptionstack/opstalk/actions/workflows/ci.yml/badge.svg)](https://github.com/inceptionstack/opstalk/actions/workflows/ci.yml)

## What is OpsTalk?

OpsTalk is an interactive terminal chat CLI for AWS DevOps Agent. Think "Claude Code but for AWS ops": a full-screen terminal interface for chatting with an AWS-backed agent, plus scriptable commands for one-shot prompts and operational workflows. It is built with Ink v6, React 19, and Commander.

## Features

- Interactive full-screen TUI chat with streaming responses
- Slash commands for chat control, help, clearing the transcript, starting a new chat, and resuming previous chats
- Setup wizard for agent space selection on first launch
- One-shot `send` command for scripting and automation
- List previous chat sessions and resume them from the interactive picker
- List available AWS DevOps Agent spaces
- AWS IAM SigV4 authentication using the standard AWS credential chain
- Markdown rendering in the terminal for bold, italic, code, and lists
- XDG-compliant config storage with restrictive `0600` permissions

## Prerequisites

- Node.js `>= 20`
- AWS credentials configured through one of the standard mechanisms:
  - instance profile
  - environment variables
  - AWS IAM Identity Center / SSO
  - shared AWS config and credentials files
- Access to the AWS DevOps Agent service and at least one agent space

## Installation

### Quick Install (one-liner)

```bash
npm install -g https://github.com/inceptionstack/opstalk/releases/latest/download/opstalk-0.1.0.tgz
```

Or using curl to always grab the latest version:

```bash
curl -sL $(curl -s https://api.github.com/repos/inceptionstack/opstalk/releases/latest | grep browser_download_url | grep .tgz | cut -d '"' -f 4) -o /tmp/opstalk.tgz && npm install -g /tmp/opstalk.tgz
```

### Install from source

```bash
git clone https://github.com/inceptionstack/opstalk.git
cd opstalk
npm install
npm run build
npm link
```

`npm link` is optional. It makes the `opstalk` command available globally on your machine.

## Configuration

OpsTalk stores its config at:

```text
~/.config/opstalk/config.json
```

If `XDG_CONFIG_HOME` is set, OpsTalk uses `$XDG_CONFIG_HOME/opstalk/config.json` instead.

Example config:

```json
{
  "region": "us-east-1",
  "agentSpaceId": "as-1234567890abcdef",
  "userId": "alice@example.com",
  "userType": "IAM",
  "ui": {
    "thinkingMode": "off"
  }
}
```

Environment variable overrides:

- `OPSTALK_REGION`
- `OPSTALK_AGENT_SPACE_ID`
- `OPSTALK_USER_ID`

CLI flag overrides:

- `--region`
- `--agent-space-id`
- `--user-id`

In practice, command-line flags override environment variables, and environment variables override the persisted config file.

## Usage

Launch the interactive chat UI:

```bash
opstalk
```

Send a one-shot message, stream the response, and exit:

```bash
opstalk send "what is happening?"
```

List recent chat sessions for the current agent space and user:

```bash
opstalk chats
```

List available agent spaces:

```bash
opstalk spaces
```

You can also pass overrides per command:

```bash
opstalk --region us-west-2 --agent-space-id as-123 --user-id alice
opstalk send "summarize current incidents" --region us-west-2
```

### Interactive Slash Commands

| Command | Description |
| --- | --- |
| `/help` | Show available slash commands |
| `/clear` | Clear the current transcript view |
| `/new` | Create a new chat |
| `/chats` | Open the recent chat picker and resume a previous chat |
| `/quit` | Exit OpsTalk |
| `/exit` | Exit OpsTalk |

When the chat picker is open, use the arrow keys to move through chats, `Enter` to resume one, and `Esc` to close the picker.

## Project Structure

```text
src/
├── agent/      AWS DevOps Agent client, SigV4 signing, stream parsing, shared API types
├── cli/        Commander entrypoint and subcommands (`chat`, `send`, `chats`, `spaces`)
├── config/     XDG config paths, load/save helpers, config merging
└── tui/        Ink/React application, screens, hooks, components, markdown rendering
```

## Development

Build the project:

```bash
npm run build
```

Run typechecking:

```bash
npm run typecheck
```

Run tests:

```bash
npm test
```

Run directly from source without building:

```bash
npx tsx src/cli/cli.ts
```

## Tech Stack

- TypeScript
- Ink v6
- React 19
- Commander
- AWS SDK SigV4 signing via Smithy and AWS credential providers
- `@smithy/eventstream-serde-node` for streaming response parsing

## For AI Agents

If you are an AI agent working on this repo:

1. Install dependencies with `npm install`.
2. Run the CLI with `npx tsx src/cli/cli.ts` during development or `npm run build` followed by `node dist/cli/cli.js`.
3. Start by reading these files to understand the shape of the codebase:
   - `DESIGN-BRIEF.md`
   - `src/agent/client.ts`
   - `src/tui/lib/types.ts`

To extend OpsTalk:

- Add new CLI commands in `src/cli/commands/`
- Add or revise Ink screens in `src/tui/screens/`
- Modify the AWS DevOps Agent client and streaming logic in `src/agent/`

## Contributing

Fork the repo, create a branch, make your change, and open a pull request against `main`. Keep changes focused, follow the existing ESM + strict TypeScript setup, and make sure build, typecheck, and test steps pass before submitting.

## License

See `LICENSE`.
