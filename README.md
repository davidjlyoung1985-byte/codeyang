# CodeYang — AI Coding Agent

[![CI](https://github.com/davidjlyoung1985-byte/codeyang/actions/workflows/ci.yml/badge.svg)](https://github.com/davidjlyoung1985-byte/codeyang/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/davidjlyoung1985-byte/codeyang/branch/master/graph/badge.svg)](https://codecov.io/gh/davidjlyoung1985-byte/codeyang)
[![npm version](https://badge.fury.io/js/codeyang.svg)](https://www.npmjs.com/package/codeyang)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A terminal-based AI coding agent powered by OpenAI-compatible LLMs (DeepSeek default, with Anthropic fallback). Describe what you want in natural language — CodeYang reads files, writes code, runs shell commands, searches code, manages git, analyzes code structure, and tracks tasks.

Also includes a **VS Code extension** for in-editor AI chat with the same tool-using capabilities.

## Features

- **Natural language coding** — describe what you want and CodeYang figures out how to do it
- **64+ built-in tools** — File ops (Bash, Read, Write, Edit, Copy, Move, Delete, Mkdir, List, Exists), Search (Glob, Grep, Search), Code analysis (AST parsing, dependency analysis, complexity, lint), Git (16 operations), Data (JSON/YAML/CSV/XML parse/write/query/convert), Network (HTTP requests, download, upload, URL tools), Memory (persistent key-value across sessions), Image (info, base64, listing), Math (solver, plotter, concept explainer), Refactoring (rename, extract function, inline, organize imports), Task management (TodoWrite), Delegation (Task sub-agent), Web (WebFetch), Interactive (Question)
- **Streaming responses** — see output in real-time as it generates
- **Multi-provider support** — DeepSeek (default), any OpenAI-compatible API, or Anthropic Claude
- **MCP (Model Context Protocol) support** — connect external tool servers for extended capabilities
- **Sub-agent delegation** — Task tool launches autonomous mini-agents for complex parallel work
- **Session persistence** — saves and resumes coding sessions automatically with indexed metadata
- **Memory system** — persistent key-value memory across sessions (facts, preferences, project context)
- **Retry with backoff** — handles rate limits and transient errors gracefully
- **Qt project specialization** — auto-detects Qt projects and injects tailored tools (QML, UI, build, migration)
- **Parallel tool execution** — multiple independent tool calls run concurrently for speed
- **Tool caching** — read results cached 5s to avoid redundant file reads
- **Anti-repetition** — loop detection prevents agent infinite loops
- **VS Code extension** — chat panel with the same tool-using capabilities inside the editor
- **Electron desktop app** (CodeYangX) — standalone desktop client

## Installation

```bash
git clone <repo-url>
cd codeyang
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

# Pass API key directly (overrides env/config)
codeyang --api-key <your-key>
```

### Interactive commands

| Command | Description |
|---|---|
| `/clear` | Reset the conversation and start fresh |
| `/sessions` | List all saved sessions |
| `/tools` | List all available tools (including MCP-discovered) |
| `/model` | Show current model |
| `/model <name>` | Switch model mid-session |
| `/mcp` | Show MCP server connection status |
| `/exit`, `/quit` | Exit CodeYang |

On first run, you'll be prompted to enter your API key. It can be saved to `~/.codeyang/config.json`.

## Configuration

| Environment Variable | Default | Description |
|---|---|---|
| `CODEYANG_API_KEY` | — | API key for the LLM provider |
| `DEEPSEEK_API_KEY` | — | Alternative API key env var |
| `CODEYANG_MODEL` | `deepseek-chat` | Model name |
| `CODEYANG_BASE_URL` | `https://api.deepseek.com/v1` | Custom API base URL |
| `CODEYANG_MAX_TOKENS` | `8192` | Max tokens per response |
| `CODEX_DEBUG` | — | Set to enable debug output |

API key priority: `--api-key` argument > `CODEYANG_API_KEY` > saved config > interactive prompt.

## Full Tool Reference

### Core Tools

| Tool | Description |
|---|---|
| **Bash** | Execute shell commands with configurable timeout |
| **Read** | Read files (with offset/limit) or list directories |
| **Write** | Create or overwrite files with auto parent directory creation |
| **Edit** | Surgical text replacement with unique-match enforcement |
| **Glob** | Find files by glob pattern with recursive walk |
| **Grep** | Search file contents with regex, include filters, and context lines |
| **TodoWrite** | Track task progress with status and priority |
| **WebFetch** | Fetch web content as readable text (HTML-to-text) |
| **Task** | Launch autonomous sub-agents for complex parallel work |
| **Question** | Ask the user for clarification with optional multiple-choice |

### File System

| Tool | Description |
|---|---|
| **Copy** | Copy files or directories recursively |
| **Move** | Move or rename files and directories |
| **Delete** | Delete files or directories with safety checks |
| **Mkdir** | Create directories with parent creation |
| **List** | List directory contents with optional details (size, date) |
| **Exists** | Check if path exists and get type/size/modified info |

### Search

| Tool | Description |
|---|---|
| **Search** | Combined file name + content search with ranked results |
| **Glob** | Find files by glob pattern |
| **Grep** | Search file contents with regex |

### Data Processing

| Tool | Description |
|---|---|
| **JsonParse** | Parse JSON from file or string with formatted output |
| **JsonWrite** | Write JSON data to file with pretty-printing |
| **JsonQuery** | Query JSON using dot notation (e.g., `users[0].name`) |
| **YamlParse** | Parse YAML from file or string |
| **YamlWrite** | Write data to YAML file |
| **Convert** | Convert between JSON and YAML formats |
| **CsvParse** | Parse CSV to JSON array with configurable delimiter |
| **CsvWrite** | Write JSON array to CSV |
| **XmlParse** | Parse XML to JSON |
| **XmlWrite** | Write JSON data to XML file |

### Git

| Tool | Description |
|---|---|
| **GitStatus** | Show repository status (modified/staged/untracked) |
| **GitDiff** | Show changes (staged/unstaged, per-file) |
| **GitCommit** | Create commits with optional auto-stage |
| **GitBranch** | List branches (local or including remotes) |
| **GitCheckout** | Switch to or create branches |
| **GitLog** | View commit history with configurable count |
| **GitPush** | Push commits to remote |
| **GitPull** | Pull from remote |
| **GitClone** | Clone a repository |
| **GitAdd** | Stage specific files |
| **GitReset** | Unstage or reset changes |
| **GitStash** | Stash changes |
| **GitMerge** | Merge branches |
| **GitRemote** | List remotes |
| **GitCurrentBranch** | Show current branch name |
| **GitBlame** | Show file annotations with commit info |

### Code Analysis

| Tool | Description |
|---|---|
| **ParseAst** | Parse JS/TS to AST and extract statement info |
| **AnalyzeCode** | Extract top-level symbols from code files |
| **Complexity** | Calculate cyclomatic complexity of functions |
| **Lint** | Run ESLint with optional auto-fix |
| **FindDeps** | List project dependencies (runtime, dev, peer) |
| **CountLines** | Count code/comment/blank lines per file or directory |

### Network

| Tool | Description |
|---|---|
| **HttpRequest** | Send HTTP requests (GET/POST/PUT/DELETE) |
| **DownloadFile** | Download files from URLs |
| **UploadFile** | Upload files via multipart/form-data |
| **ApiCall** | Call RESTful APIs with JSON body |
| **CheckUrl** | Check URL accessibility with timing info |
| **ParseUrl** | Parse URL components and query parameters |

### Memory

| Tool | Description |
|---|---|
| **Remember** | Save key-value facts to persistent memory (5 types) |
| **Recall** | Retrieve memories by ID or search query |
| **Forget** | Delete a memory by key or ID |
| **ListMemories** | List all memories, optionally filtered by type |

### Image

| Tool | Description |
|---|---|
| **ImageInfo** | Get image dimensions, format, and file size |
| **ImageToBase64** | Convert image file to base64 string |
| **ListImages** | List image files in a directory |

### Math

| Tool | Description |
|---|---|
| **MathSolve** | Solve math expressions and equations step-by-step |
| **MathPlot** | Generate mathematical function plots as SVG |
| **MathExplain** | Explain math concepts with examples |

### MCP (Dynamic)

Any tools exposed by connected MCP servers, prefixed by server name. Connect external data sources, APIs, or custom automation via the [Model Context Protocol](https://modelcontextprotocol.io).

### Qt (Project-specific)

Activated automatically when a Qt project is detected:
- **QtBuild** — Analyze build system (qmake/CMake)
- **QtUi** — Analyze and preview .ui form files
- **QtQml** — Analyze QML files (versioned imports, type annotations, bindings)
- **QtSignals** — Analyze signal/slot connections
- **QtThread** — Analyze thread safety (QThread usage)
- **QtCharts** — Generate chart code examples
- **QtModelView** — Analyze model/view pattern usage
- **QtProFile** — Analyze and edit .pro files
- **QtMigration** — Qt5→Qt6 migration path scanning
- **QtMath** — Qt-compatible math examples and conversions

## Project Structure

```
src/
├── index.ts              # CLI entry point (arg parsing, key resolution, agent bootstrap)
├── types.ts              # Shared type definitions
├── agent/
│   ├── Agent.ts          # Core agent loop (streaming, retry, anti-repetition, tool execution)
│   ├── config.ts         # Configuration management (env vars, local config, system prompt)
│   └── LLMClient.ts      # Multi-provider LLM client (OpenAI-compatible + Anthropic)
├── ui/
│   └── CliUI.ts          # Terminal UI (markdown rendering, spinner, colored output)
├── tools/
│   ├── registry.ts       # Tool definitions, schema generation, MCP/Qt tool injection
│   ├── BashTool.ts       # Shell command execution (execa)
│   ├── ReadTool.ts       # File/directory reading
│   ├── WriteTool.ts      # File writing
│   ├── EditTool.ts       # Surgical text replacement
│   ├── FileSystemTool.ts # Copy/Move/Delete/Mkdir/List/Exists
│   ├── DataTool.ts       # JSON/YAML/CSV/XML parse/write/convert
│   ├── GitTool.ts        # 16 git operations
│   ├── CodeAnalysisTool.ts # AST parsing, complexity, lint, dependency analysis
│   ├── NetworkTool.ts    # HTTP requests, download, upload, URL tools
│   ├── GlobTool.ts       # Glob pattern matching
│   ├── GrepTool.ts       # Content regex search
│   ├── SearchTool.ts     # Combined name + content search
│   ├── TodoWriteTool.ts  # Task list management
│   ├── WebFetchTool.ts   # HTTP fetch + HTML-to-text conversion
│   ├── TaskTool.ts       # Sub-agent execution engine
│   ├── MemoryTool.ts     # Persistent memory (Remember/Recall/Forget/ListMemories)
│   └── ImageTool.ts      # Image info, base64, listing
├── mcp/
│   ├── McpManager.ts     # Multi-server MCP connection management
│   ├── McpClient.ts      # Single MCP server connection (stdio)
│   └── types.ts          # MCP config types
├── math/
│   ├── MathSolve.ts      # Expression/equation solver
│   ├── MathPlot.ts       # SVG function plotter
│   └── MathExplain.ts    # Concept explanation engine
├── qt/
│   ├── detector.ts       # Qt project auto-detection
│   ├── prompt.ts         # Qt-specific system prompt injection
│   ├── tools.ts          # Qt tool definitions
│   └── tools/            # Individual Qt tool implementations
└── utils/
    ├── sessionStore.ts   # Session persistence with indexed metadata
    ├── memoryStore.ts    # Persistent memory storage
    └── globMatch.ts      # Glob pattern matching utility
```

## Tech Stack

- **Language**: TypeScript (strict mode, ESM)
- **Runtime**: Node.js >= 18
- **LLM SDKs**: `openai` (primary), `@anthropic-ai/sdk` (fallback)
- **Shell**: execa
- **UI**: readline + picocolors
- **MCP**: `@modelcontextprotocol/sdk`
- **Data**: fast-xml-parser, yaml, csv-parse/stringify
- **Build**: tsup (ESM bundle + dts)
- **Test**: vitest
- **Lint/Format**: eslint + prettier
- **License**: MIT

## Development

```bash
# Build (CLI + shared tools)
npm run build

# Watch mode
npm run dev

# Run in development
npm start

# Type check
npm run check

# Run tests (290+ tests)
npm test
npm run test:watch
npm run test:coverage

# Lint
npm run lint
npm run lint:fix

# Format
npm run format
npm run format:check
```

## MCP Integration

CodeYang supports the [Model Context Protocol](https://modelcontextprotocol.io) for connecting external tool servers. Configure MCP servers in `~/.codeyang/config.json`:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/dir"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"]
    }
  }
}
```

Tools from MCP servers automatically appear with the `mcp__serverName__` prefix and are available alongside built-in tools.

## License

MIT
