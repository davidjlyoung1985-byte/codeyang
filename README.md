# CodeYang — AI Coding Agent

A terminal-based AI coding agent powered by Claude. Interact with your codebase through natural language — CodeYang reads files, writes code, runs shell commands, searches code, and tracks tasks.

Also includes a **VS Code extension** for in-editor AI chat with tool-using capabilities.

## Features

- **Natural language coding** — describe what you want and CodeYang figures out how to do it
- **10 built-in tools** — Bash, Read, Write, Edit, Glob, Grep, TodoWrite, WebFetch, Task (sub-agent), Question
- **Streaming responses** — see Claude's output in real-time as it generates
- **Sub-agent delegation** — Task tool launches autonomous mini-agents for complex work
- **Session persistence** — saves and resumes coding sessions automatically
- **Retry with backoff** — handles rate limits and transient errors gracefully
- **VS Code extension** — chat panel with the same tool-using capabilities inside the editor

## Installation

```bash
git clone <repo-url>
cd ai-code-agent
npm install
npm run build
```

## Usage

### CLI

```bash
# Show version
codeyang --version

# Start interactive session
codeyang

# List saved sessions
codeyang --list

# Resume a session
codeyang --resume <session-id>

# Delete a session
codeyang --delete <session-id>
```

### Interactive commands

| Command | Description |
|---|---|
| `/clear` | Reset the conversation and start fresh |
| `/exit`, `/quit` | Exit CodeYang |

On first run, you'll be prompted to enter your Anthropic API key. It's saved to `~/.codeyang/config.json`.

### Features

- **Streaming responses** — see Claude's output in real-time as it generates
- **Spinner indicator** — animated spinner while waiting for the API response
- **Question tool** — the agent can ask you clarifying questions with options
- **Session resumption** — sessions preserve tool call results for accurate resumption
- **Sub-agent delegation** — Task tool launches autonomous mini-agents for complex work
- **Retry with backoff** — handles rate limits and transient errors gracefully
- **Double Ctrl+C guard** — prevents data loss from accidental double-trigger

### VS Code Extension

Navigate to the `vscode-extension/` directory and follow the VS Code extension installation steps. Run `CodeYang: Start Chat` from the command palette.

## Configuration

| Environment Variable | Default | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | API key (highest priority) |
| `CODEYANG_API_KEY` | — | Alternative API key env var |
| `CODEYANG_MODEL` | `claude-sonnet-4-20250514` | Claude model to use |
| `CODEYANG_MAX_TOKENS` | `8192` | Max tokens per API call |
| `CODEX_DEBUG` | — | Set to enable debug output |

## Tools

| Tool | Description |
|---|---|
| **Bash** | Execute shell commands |
| **Read** | Read files or list directories |
| **Write** | Create or overwrite files |
| **Edit** | Surgical text replacement in files |
| **Glob** | Find files by pattern |
| **Grep** | Search file contents with regex |
| **TodoWrite** | Track task progress |
| **WebFetch** | Fetch web content as text |
| **Task** | Launch autonomous sub-agents |
| **Question** | Ask the user for clarification |

## Project Structure

```
src/
├── index.ts              # CLI entry point
├── types.ts              # Shared type definitions
├── agent/
│   ├── Agent.ts          # Core agent loop with streaming & retry
│   └── config.ts         # Configuration management
├── ui/
│   └── CliUI.ts          # Terminal UI with colors
├── tools/
│   ├── registry.ts       # Tool registry & schemas
│   ├── BashTool.ts       # Shell command execution
│   ├── ReadTool.ts       # File/directory reading
│   ├── WriteTool.ts      # File writing
│   ├── EditTool.ts       # Surgical text replacement
│   ├── GlobTool.ts       # File glob pattern matching
│   ├── GrepTool.ts       # Content regex search
│   ├── TodoWriteTool.ts  # Task list management
│   ├── WebFetchTool.ts   # HTTP fetch + HTML-to-text
│   └── TaskTool.ts       # Sub-agent execution engine
└── utils/
    └── sessionStore.ts   # Session persistence
```

## Tech Stack

- **Language**: TypeScript
- **Runtime**: Node.js >= 18
- **AI SDK**: @anthropic-ai/sdk
- **Shell**: execa (CLI), child_process (VS Code)
- **UI**: readline + picocolors (CLI), Webview (VS Code)

## Development

```bash
# Build
npm run build

# Watch mode
npm run dev

# Type check
npx tsc --noEmit
```

## License

MIT
