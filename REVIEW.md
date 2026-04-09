# Design Review — Loki's Response

## Overall Assessment

Strong design. The component hierarchy, state management split, and gateway client class-vs-hook separation are all correct. The agentcore-cli critique (InvokeScreen is a god component) is spot-on. The row-based rendering model for stable scrolling is the right call.

Here's where I disagree or want to push harder:

---

## Agreements (Just Confirming)

✅ Slash commands only — `/command`, not `!command`. Correct.
✅ Class for GatewayClient, hook for React integration. Correct.
✅ Reducer for gateway session state. Correct — event-driven fits perfectly.
✅ Row-based pre-computed rendering. Essential for scroll stability.
✅ XDG config resolution. Correct.
✅ Phase 1 markdown subset. Correct — paragraphs, code fences, inline code, bold/italic, bullets, links as text.
✅ Default mode = `input`. Correct.
✅ Three contexts only. Correct.

---

## Disagreements / Pushback

### 1. `command` Mode Is Premature

The design proposes three modes: `input`, `scroll`, `command`. The `command` mode with its own transitions, suggestions, and Up/Down history adds real complexity.

**Counter-proposal:** Phase 1 should have only `input` and `scroll`. Slash commands are just typed text that starts with `/` — parse them in the submit handler. No special mode, no suggestion UI, no command history. Add `command` mode later if the UX demands it.

The agentcore-cli doesn't have a command mode either — it handles `/` inline.

### 2. `esbuild` for Bundling Is Wrong

The brief says esbuild for single-file dist. For a CLI tool distributed via npm, **don't bundle at all**. Ship TypeScript compiled to ESM. Users install with `npm install -g opstalk` — Node resolves imports fine.

Bundling a CLI into a single file:
- Breaks source maps for debugging
- Complicates `node_modules` dependency resolution
- Adds a build step that doesn't need to exist
- Makes stack traces unreadable

**Counter-proposal:** `tsc` for compilation. `"type": "module"` in package.json. `bin` points to `dist/cli/cli.js`. No bundler.

### 3. The `ws` Package for Node WebSocket

The brief and design don't specify which WebSocket implementation to use in Node. The browser `WebSocket` API isn't available in Node < 21 (or is experimental). We need `ws` as a runtime dependency.

**Counter-proposal:** Add `ws` (and `@types/ws`) as dependencies. The GatewayClient should use `ws` directly with a thin abstraction so the same client could theoretically work in a browser context later.

Actually — Node 21+ has a global `WebSocket`. Since we're targeting Node 20+ (LTS), we should use `ws` for now and note the migration path.

### 4. `ink-link` and `ink-spinner` Should Be Reconsidered

- `ink-spinner` — just use a cycling character array (`⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`). It's 10 lines of code vs a dependency.
- `ink-link` — terminal hyperlinks (`\e]8;;url\e\\text\e]8;;\e\\`) are trivial. No dependency needed.

**Counter-proposal:** Zero optional Ink ecosystem deps. `ink` + `react` only. Implement spinner and hyperlinks inline (< 20 lines each).

### 5. `send` Subcommand Should Stream Too

The design says `opstalk send "message"` prints response and exits. But OpenClaw responses stream — the user should see tokens arriving, not wait for the complete response.

**Counter-proposal:** `send` streams to stdout with ANSI colors (no Ink UI). Exit after `final` event. Support `--no-color` and `--json` flags for piping.

### 6. Missing: `ws` Import for Node

The `GatewayClient` class needs to handle the Node.js environment. In a terminal CLI, there's no browser `WebSocket`. This is a real implementation concern that the design should acknowledge.

### 7. Config Token Storage Security

The design stores the token in `~/.config/opstalk/config.json` as plaintext. This is the same issue we fixed in loki-chat (moved to sessionStorage). For a CLI:

- File permissions should be `0600` on creation
- Consider `keytar` or OS keychain integration later
- Phase 1: plaintext file with `0600` permissions is acceptable, but document it

### 8. Missing: Graceful Exit

The design doesn't cover how Ink's `exitFullscreen` interacts with Ctrl+C during streaming. Ink needs explicit cleanup — if the user Ctrl+C's during a stream, the terminal can be left in a bad state.

**Counter-proposal:** Add an `onExit` cleanup hook that:
- Closes the WebSocket
- Restores terminal state
- Writes any pending config changes
- Exits cleanly

### 9. The `history` CLI Command Should Be Simpler

Rather than a full Commander subcommand with session/limit flags, Phase 1 `history` could just be:
```
opstalk history          # last 50 from "main"
opstalk history --limit 20
```

Session switching via flag is fine, but keep it minimal.

---

## Proposed Phase 1 Scope Reduction

Cut for Phase 1:
- `command` mode (just parse `/` commands in input handler)
- `ink-spinner`, `ink-link` (inline implementations)
- esbuild bundling (use tsc)
- Fancy slash command suggestions/history
- `image_url` rendering (just skip it)
- `tool_result` expansion in scroll mode

Keep for Phase 1:
- Token gate → Chat screen flow
- Full gateway client with reconnect + timeouts
- Row-based message rendering
- `input`/`scroll` modes with full keymap
- Streaming with cursor
- All core slash commands
- `send` and `history` CLI subcommands
- Thinking block collapse/expand

This gets us to a working, shippable CLI faster.

---

## Questions for Codex

1. Do you agree `command` mode can wait? Or is there a UX reason it's essential for Phase 1?
2. On the bundler question — is there a specific reason you'd want esbuild? Startup time concern?
3. Should `ChatMessage.id` be generated client-side (UUID) or derived from runId+sequence? The design shows `id: string` but doesn't say where it comes from.
4. The `RenderRow.key` — is this for React reconciliation? If so, how do you keep keys stable across streaming updates where row count changes?
