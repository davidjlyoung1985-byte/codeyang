# CodeYang — AI Coding Agent

**Provider-agnostic terminal AI coding agent** — defaults to DeepSeek, also supports Anthropic Claude and any OpenAI-compatible API. Interact with your codebase through natural language: read files, write code, run shell commands, search code, manage Git, and delegate tasks.

Also includes a **VS Code extension** (Anthropic-only) and an **Electron desktop app**.

## Features

- **Natural language coding** — describe what you want, CodeYang figures out how
- **58+ built-in tools** — file operations, search, data processing, Git, code analysis, network, task management, sub-agent delegation
- **Provider-agnostic** — DeepSeek / Anthropic / any OpenAI-compatible API
- **Streaming responses** — see output in real-time as it generates
- **Sub-agent delegation** — Task tool launches autonomous mini-agents for complex work (works with all providers)
- **Session persistence** — saves and resumes coding sessions automatically
- **Token usage tracking** — see how many tokens each session consumed (`/stats`)
- **Session search** — find past sessions by keyword (`/sessions --search <keyword>`)
- **MCP server integration** — connect custom MCP tools
- **Qt project detection** — auto-injects Qt-specific tools for Qt projects
- **Math tools (on-demand)** — solve math problems, generate SVG diagrams (register via code)
- **Retry with backoff** — handles rate limits and transient errors gracefully
- **`.env` / `.env.local` support** — load configuration from files
- **VS Code extension** — chat panel with tool-using capabilities inside the editor

## Quick Start

```bash
# Clone and install
git clone https://github.com/davidjlyoung1985-byte/codeyang.git
cd codeyang
npm install
npm run build

# Set API key (pick one)
export DEEPSEEK_API_KEY=sk-xxx        # DeepSeek (default)
# export ANTHROPIC_API_KEY=sk-ant-xxx  # Anthropic Claude
# export CODEYANG_API_KEY=sk-xxx       # fallback

# Run
node dist/index.js
```

On first run, you'll be prompted to enter your API key. It's saved to `~/.codeyang/config.json`. If the `CODEYANG_API_KEY` or `DEEPSEEK_API_KEY` environment variable is already set, the prompt is skipped automatically.

## Usage

### CLI Options

```bash
# Show help
codeyang --help

# Show version
codeyang --version

# Start interactive session
codeyang

# Non-interactive mode (fails if API key not configured)
codeyang --non-interactive

# List saved sessions
codeyang --list

# Resume a session
codeyang --resume <session-id>

# Delete a session
codeyang --delete <session-id>
```

### Interactive Commands

| Command | Description |
|---|---|
| `/clear` | Reset conversation |
| `/sessions` | List saved sessions |
| `/sessions --search <keyword>` | Search saved sessions by content |
| `/tools` | List all available tools |
| `/model` | Show current model |
| `/model <name>` | Switch model (e.g. `/model deepseek-reasoner`) |
| `/mcp` | Show MCP server status |
| `/stats` | Show token usage for this session |
| `/exit`, `/quit` | Exit CodeYang |

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `CODEYANG_API_KEY` | — | API key (checked first) |
| `DEEPSEEK_API_KEY` | — | DeepSeek API key (fallback) |
| `CODEYANG_BASE_URL` | `https://api.deepseek.com/v1` | API base URL |
| `CODEYANG_MODEL` | `deepseek-chat` | LLM model name |
| `CODEYANG_MAX_TOKENS` | `8192` | Max tokens per API call |
| `CODEYANG_MAX_TURNS` | `20` | Max conversation turns per prompt |
| `CODEYANG_RETRIES` | `3` | Max retries on rate limits / transient errors |
| `CODEYANG_TEMPERATURE` | `0.5` | LLM temperature (creativity) |
| `CODEX_DEBUG` | — | Set to enable debug output |

### Provider Configuration

CodeYang automatically selects the provider based on the `CODEYANG_BASE_URL` and API key:

| Provider | API Key | Base URL | Model Example |
|---|---|---|---|
| **DeepSeek** (default) | `DEEPSEEK_API_KEY` or `CODEYANG_API_KEY` | `https://api.deepseek.com/v1` | `deepseek-chat` |
| **Anthropic Claude** | `ANTHROPIC_API_KEY` (via config file) | `https://api.anthropic.com` | `claude-sonnet-4-20250514` |
| **OpenAI-compatible** | `CODEYANG_API_KEY` | Custom (set via `CODEYANG_BASE_URL` or config) | Any |

To use Anthropic Claude, set `apiProvider` to `"anthropic"` in `~/.codeyang/config.json`:
```json
{
  "apiKey": "sk-ant-...",
  "apiProvider": "anthropic",
  "apiBaseURL": "https://api.anthropic.com"
}
```

## Tools

### File Operations

| Tool | Description |
|---|---|
| **Bash** | Execute shell commands |
| **Read** | Read files or list directories |
| **Write** | Create or overwrite files |
| **Edit** | Exact-text replacement in files |
| **Copy** | Copy files/directories recursively |
| **Move** | Move or rename files/directories |
| **Delete** | Delete files/directories with safety checks |
| **Mkdir** | Create directories (with parents) |
| **List** | List directory contents with details |
| **Exists** | Check if path exists and get info |

### Search

| Tool | Description |
|---|---|
| **Glob** | Find files by glob pattern |
| **Grep** | Search file contents with regex |
| **Search** | Combined name + content search (ranked) |

### Data Processing

| Tool | Description |
|---|---|
| **JsonParse** / **JsonWrite** / **JsonQuery** | JSON handling |
| **YamlParse** / **YamlWrite** / **Convert** | YAML handling |
| **CsvParse** / **CsvWrite** | CSV handling |
| **XmlParse** / **XmlWrite** | XML handling |

### Git

| Tool | Description |
|---|---|
| **GitStatus** / **GitDiff** / **GitCommit** | Daily operations |
| **GitBranch** / **GitCheckout** | Branch management |
| **GitLog** / **GitBlame** | History & annotations |
| **GitPush** / **GitPull** / **GitClone** | Remote operations |
| **GitAdd** / **GitReset** / **GitStash** / **GitMerge** | Advanced operations |
| **GitRemote** / **GitCurrentBranch** | Info commands |

### Code Analysis

| Tool | Description |
|---|---|
| **ParseAst** | Parse code to AST (JS/TS) |
| **AnalyzeCode** | Extract symbols from code |
| **Complexity** | Calculate code complexity |
| **Lint** | Run ESLint with auto-fix |
| **FindDeps** | List project dependencies |
| **CountLines** | Count code/comment/blank lines |

### Network

| Tool | Description |
|---|---|
| **HttpRequest** | Send HTTP requests (GET/POST/PUT/DELETE) |
| **DownloadFile** | Download files from URLs |
| **UploadFile** | Upload files via multipart/form-data |
| **ApiCall** | Call RESTful APIs with JSON |
| **CheckUrl** | Check URL accessibility and info |
| **ParseUrl** | Parse URL components and query params |

### Delegation & UI

| Tool | Description |
|---|---|
| **Task** | Launch autonomous sub-agents (works with all providers) |
| **Question** | Ask the user for clarification |
| **TodoWrite** | Track task progress |
| **WebFetch** | Fetch web content as readable text |

### Image Processing

| Tool | Description |
|---|---|
| **ImageInfo** | Read image metadata (format, dimensions, size) |
| **ImageToBase64** | Encode image to base64 data URI |
| **ListImages** | List image files in a directory |

### Optional (register on demand)

| Tool | Description |
|---|---|
| **MathSolve** | Step-by-step math problem solving |
| **MathPlot** | Generate SVG mathematical diagrams |
| **MathExplain** | Math concept reference |
| QtBuild / QtSignals / QtProFile / etc. | Qt project tools (auto-detected) |

## Project Structure

```
src/
├── index.ts              # CLI entry point
├── version.ts            # Single source of truth for version
├── types.ts              # Shared type definitions
├── agent/
│   ├── Agent.ts          # Core agent loop with streaming & retry
│   ├── config.ts         # Configuration management
│   └── LLMClient.ts      # Provider-agnostic LLM client abstraction
├── ui/
│   └── CliUI.ts          # Terminal UI with markdown rendering
├── tools/
│   ├── registry.ts       # Tool registry & schemas
│   ├── TaskTool.ts       # Sub-agent execution engine
│   └── ...               # Individual tool implementations
├── mcp/
│   ├── McpManager.ts     # MCP server connection manager
│   └── McpClient.ts      # MCP client (stdio transport)
├── qt/
│   ├── detector.ts       # Qt project auto-detection
│   ├── tools.ts          # Qt tool factory
│   └── tools/            # Individual Qt tool implementations
├── math/
│   ├── tools.ts          # Math tool factory (on-demand registration)
│   ├── MathSolve.ts      # Math problem solver
│   ├── MathPlot.ts       # SVG diagram generator
│   └── MathExplain.ts    # Math concept reference
└── utils/
    ├── sessionStore.ts   # Session persistence with search
    └── dotenv.ts         # Lightweight .env/.env.local loader
```

## Development

```bash
# Build
npm run build

# Watch mode
npm run dev

# Test
npm test                  # Run all tests
npm run test:watch       # Watch mode
npm run test:coverage    # With coverage

# Lint & Format
npm run lint
npm run format

# Type check
npm run check
```

### Testing

322+ tests across 18 test files covering:
- Agent (streaming, tool calls, token tracking, session management)
- TaskTool (subtask execution, tool blocking, error recovery, turn limits)
- CliUI (markdown rendering, spinner, question/error display)
- All file/data/git/network/image/search tools
- MCP server integration
- Qt project detection and tools
- Math tools
- Session persistence
- Configuration

## VS Code Extension

Navigate to the `vscode-extension/` directory. **Note**: the VS Code extension currently supports Anthropic Claude only. Run `CodeYang: Start Chat` from the command palette.

## License

MIT
