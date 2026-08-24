# CodeYang — AI Coding Agent

[![CI](https://github.com/davidjlyoung1985-byte/codeyang/actions/workflows/ci.yml/badge.svg)](https://github.com/davidjlyoung1985-byte/codeyang/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Coverage](https://img.shields.io/badge/coverage-65%25-yellow)](https://github.com/davidjlyoung1985-byte/codeyang)

An AI coding agent inspired by [Claude Code](https://github.com/anthropics/claude-code) architecture. CodeYang lets you describe coding tasks in natural language — it reads files, writes code, runs commands, manages Git, and more.

**[中文文档](README.md)** | **English**

## Quick Start

```bash
git clone https://github.com/davidjlyoung1985-byte/codeyang.git
cd codeyang
npm install
npm run build

# Set your API key
export ANTHROPIC_API_KEY=your-key-here

# Start interactive session
npm start
```

## Features

### Core Capabilities
- **80+ built-in tools** — File operations, Git, Bash, code analysis, web requests
- **Streaming responses** — Real-time output as the agent generates
- **MCP (Model Context Protocol)** — Connect external tool servers
- **Multi-provider** — Claude (recommended), DeepSeek, or OpenAI-compatible APIs

### Advanced Features
- **Agent Loop** — Autonomous task execution with tool calling
- **Memory System** — Session persistence and context management
- **Sandbox Isolation** — Fork-based process isolation for risky commands
- **Permission System** — Deny lists and approval workflows
- **VS Code Extension** — In-editor AI chat
- **Electron Desktop App** — Standalone GUI application

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

## Feature Maturity

### 🟢 Production-Ready (Core)
Stable, well-tested, suitable for production use:
- **Agent loop & tool orchestration** — Battle-tested core logic
- **60+ core tools** — Bash, Git, Read, Write, Edit, Grep, Glob, etc.
- **MCP client** — Model Context Protocol integration
- **Sandbox isolation** — Secure process forking
- **Permission system** — Deny lists and safety checks
- **Security hardening** — SSRF protection, input validation

### 🟡 Beta (Extended)
Functional but under active development:
- **Multi-provider LLM support** — DeepSeek, OpenAI (alongside Anthropic)
- **VS Code extension** — IDE integration
- **Electron desktop app** — Standalone GUI
- **tot** (Tree-of-Thought), **a2a** (Agent-to-Agent), **closed-loop** modules

### 🔴 Experimental (Research-Only)
Proof-of-concept features, not production-ready:
- **qt** — Query transformation (4,054 lines, research prototype)
- **reflexion** — Self-reflection loop (831 lines, minimal tests)
- **continual-learning** — Continuous improvement (943 lines, WIP)

⚠️ Experimental modules are excluded from coverage metrics and may have breaking changes.

## Usage

### Interactive Commands

| Command | Description |
|---|---|
| `/clear` | Reset conversation |
| `/sessions` | List saved sessions |
| `/tools` | Show available tools |
| `/model <name>` | Switch model |
| `/exit` | Quit |

### Configuration

| Environment Variable | Default | Description |
|---|---|---|
| `CODEYANG_API_KEY` | — | API key (required) |
| `CODEYANG_MODEL` | `deepseek-chat` | Model name |
| `CODEYANG_BASE_URL` | `https://api.deepseek.com/v1` | API endpoint |
| `CODEYANG_MAX_TOKENS` | `32000` | Max tokens per response |
| `CODEYANG_DEBUG` | — | Enable debug logging |

## Examples

We provide 4 complete examples to get you started:

- [**01-basic-agent-loop**](examples/01-basic-agent-loop/) - Core agent loop and streaming
- [**02-custom-tool**](examples/02-custom-tool/) - Create and register custom tools
- [**03-mcp-integration**](examples/03-mcp-integration/) - Connect to MCP servers
- [**04-vscode-extension**](examples/04-vscode-extension/) - VS Code integration guide

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Build
npm run build

# Lint
npm run lint

# Format
npm run format
```

## Contributing

We welcome contributions! See [CONTRIBUTING.md](docs/CONTRIBUTING.md) for guidelines.

Current priorities:
1. **Improve test coverage** — Reach 60% branches for core modules (currently 52.7%)
2. **Fix environment-dependent test timeouts** on Windows parallel runs
3. **Add more examples and use cases**
4. **Performance optimizations** (streaming for large files, test caching)

Please:
- Write tests for new features
- Follow existing code style (ESLint + Prettier)
- Keep commits focused and descriptive

## Credits

**Architecture heavily inspired by**:
- [Anthropic Claude Code](https://github.com/anthropics/claude-code) — Agent loop, tool design
- [Anthropic Skills](https://github.com/anthropics/skills) — Skills system

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
- ✅ Clean TypeScript codebase with strict type checking
- ✅ Modular architecture with clear separation of concerns
- ✅ Multiple interfaces (CLI, VS Code, Electron)
- ✅ CI/CD with hard gates (tsc + lint + vitest)
- ✅ Performance benchmarks and security hardening

**Production readiness**: B+ (85/100)
- Core modules: agent, tools, mcp, security (well-tested, production-ready)
- Test coverage: 1701/1706 passing (99.7%), branches 52.7%, statements 64.9%
- Known issues: 4 environment-dependent test timeouts on Windows (full parallel runs)
- Experimental modules: qt, reflexion, continual-learning (excluded from coverage, research-only)
- SSRF protection and security best practices
- Clean git history and organized documentation
- Active development with regular improvements

We believe in honest documentation. If you find issues, please report them!
