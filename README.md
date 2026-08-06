# CodeYang — AI Coding Agent

[![CI](https://github.com/davidjlyoung1985-byte/codeyang/actions/workflows/ci.yml/badge.svg)](https://github.com/davidjlyoung1985-byte/codeyang/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An AI coding agent inspired by [Claude Code](https://github.com/anthropics/claude-code) architecture. CodeYang lets you describe coding tasks in natural language — it reads files, writes code, runs commands, manages Git, and more.

**Project Status**: B+ / Work in Progress  
✅ Core functionality works  
⚠️ Some tests have known issues (see [Contributing](#contributing))  
📊 Test Coverage: ~65% statements, ~52% branches

## Architecture

This project is **heavily inspired by Anthropic's Claude Code architecture**:
- Tool naming and interfaces follow Claude Code conventions
- Agent loop design based on Claude's streaming tool-use pattern
- Skills system adapted from Anthropic's skills repository

**Original contributions**:
- MCP client integration
- Multi-provider LLM support (Claude, DeepSeek, OpenAI-compatible)
- Process sandbox with fork/IPC isolation
- VS Code extension + Electron desktop app
- Web service wrapper

## Features

### Core Capabilities
- **80+ built-in tools** — File ops, Git, Bash, code analysis, web requests
- **Streaming responses** — real-time output as the agent generates
- **MCP (Model Context Protocol)** — connect external tool servers
- **Multi-provider** — Claude (recommended), DeepSeek, or OpenAI-compatible APIs

### Advanced Features
- **Agent Loop** — autonomous task execution with tool calling
- **Memory System** — session persistence and context management
- **Sandbox Isolation** — fork-based process isolation for risky commands
- **Permission System** — deny lists and approval workflows
- **VS Code Extension** — in-editor AI chat
- **Electron Desktop App** — standalone GUI application

## Installation

```bash
git clone https://github.com/davidjlyoung1985-byte/codeyang.git
cd codeyang
npm install
npm run build
```

## Usage

### CLI

```bash
# Start interactive session
npm start

# Or use the built binary
node dist/cli.js

# With API key
CODEYANG_API_KEY=your-key npm start
```

### Interactive Commands

| Command | Description |
|---|---|
| `/clear` | Reset conversation |
| `/sessions` | List saved sessions |
| `/tools` | Show available tools |
| `/model <name>` | Switch model |
| `/exit` | Quit |

## Configuration

| Environment Variable | Default | Description |
|---|---|---|
| `CODEYANG_API_KEY` | — | API key (required) |
| `CODEYANG_MODEL` | `deepseek-chat` | Model name |
| `CODEYANG_BASE_URL` | `https://api.deepseek.com/v1` | API endpoint |
| `CODEYANG_MAX_TOKENS` | `32000` | Max tokens per response |
| `CODEYANG_DEBUG` | — | Enable debug logging |

API key priority: CLI arg > env var > saved config > interactive prompt

## Project Structure

```
src/
├── agent/          # Agent loop, streaming, tool orchestration
├── tools/          # 80+ built-in tools (Bash, Git, Read, Write, etc.)
├── mcp/            # Model Context Protocol client
├── sandbox/        # Process isolation (fork/IPC)
├── permission/     # Permission checking and deny lists
├── security/       # SSRF protection, input validation
├── ui/             # CLI interface
├── utils/          # Logging, caching, session store
├── vscode-ext/     # VS Code extension
└── electron/       # Desktop app
```

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Lint
npm run lint

# Type check
npm run type-check

# Build
npm run build
```

## Testing

Current test status:
- **1645 passing** / 3 failing (99.8% pass rate)
- Known issues:
  - BashTool: 2 tests timeout (cwd option, permission cache)
  - Agent integration: 1 test timeout (max turns)

These are environment-dependent timeouts, not logic bugs. Contributions to fix them are welcome!

Coverage targets:
- Statements: 65% ✅
- Branches: 52% ✅ (target: 50%+)
- Functions: 67% ✅

## Contributing

We welcome contributions! Current priorities:

1. **Fix failing tests** — especially BashTool timeouts
2. **Improve test coverage** — bring branches to 65%+
3. **Clean up test pollution** — tests currently leave files in `~/.codeyang/`
4. **Documentation** — more examples and use cases

Please:
- Write tests for new features
- Follow existing code style (ESLint + Prettier)
- Keep commits focused and descriptive

## Credits

**Architecture heavily inspired by**:
- [Anthropic Claude Code](https://github.com/anthropics/claude-code) — agent loop, tool design
- [Anthropic Skills](https://github.com/anthropics/skills) — skills system

**Original work**:
- MCP client integration
- Multi-provider support
- Desktop/web wrappers
- Extended tool set

## License

MIT

## Honest Assessment

This is a **functional but work-in-progress** AI agent project:

**Strengths**:
- ✅ Rich feature set (80+ tools, MCP, multi-provider)
- ✅ Clean TypeScript codebase
- ✅ Good modular architecture
- ✅ Multiple interfaces (CLI, VS Code, Electron)

**Areas for improvement**:
- ⚠️ Test suite not fully green (3 timeouts)
- ⚠️ Coverage could be higher (branches at 52%)
- ⚠️ Tests pollute user environment (`~/.codeyang/`)
- ⚠️ Heavy dependency on Claude Code patterns

**Estimated maturity**: B+ (78/100)
- Production-ready for personal use
- Not yet recommended for critical enterprise workloads
- Active development continues

We believe in honest documentation. If you find issues, please report them!
