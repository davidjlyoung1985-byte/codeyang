# Changelog

All notable changes to CodeYang will be documented in this file.

## [0.6.0] - 2026-07-10

### Changed

- **README fully rewritten** — corrected provider from Claude to DeepSeek/OpenAI-compatible, added missing tools (Memory, Image, Math, Search, MCP, Qt), fixed environment variable docs and interactive command reference
- **Version unified** — package.json, CLI, MCP client, and UI now all report 0.6.0 consistently
- **Anti-repetition threshold raised** — from 1 repeat to 2, preventing false positives on legitimate repeated patterns

### Removed

- **Unused `jiti` dependency** — was never imported anywhere in the codebase
- **Redundant `form-data` dependency** — axios handles multipart natively

### Fixed

- **MCP client hardcoded version** — was `0.3.0`, now `0.6.0` in sync with the rest of the project

## [0.5.0] - 2026-06-15

### Added

- **Math module** — expression solver (MathSolve), SVG plotter (MathPlot), concept explainer (MathExplain)
- **MCP manager dynamic refresh** — `refreshTools()` allows discovering newly added MCP tools without restart
- **Multi-provider LLM client** — OpenAI-compatible (DeepSeek default) and Anthropic fallback

### Changed

- **CLI entry point refactored** — modular arg parsing, API key resolution flow
- **Agent callbacks** — streaming deltas for real-time token display
- **Tool context injection** — per-session cwd, model, and maxTokens context

## [0.4.0] - 2026-06-08

### Added

- **Full Git version control** — 16 Git tools (status, diff, commit, branch, checkout, log, push, pull, clone, add, reset, stash, merge, remote, current-branch, blame)
- **Code analysis tools** — AST parsing, code structure analysis, cyclomatic complexity, ESLint runner, dependency finder, line counter
- **Network tools** — HTTP requests, file download/upload, API calls, URL check/parse
- **Data format tools** — JSON Parse/Write/Query, YAML Parse/Write, CSV Parse/Write, XML Parse/Write, JSON-YAML Convert
- **File system tools** — Copy, Move, Delete, Mkdir, List, Exists
- **Search tool** — combined file name + content search with ranked results
- **Image tools** — ImageInfo, ImageToBase64, ListImages
- **Memory system** — persistent key-value memory with Remember/Recall/Forget/ListMemories and 5 types (fact, preference, project, instruction, context)
- **API key config save** — first-run key prompt now offers to save to `~/.codeyang/config.json`
- **`--api-key` CLI argument** to pass API key directly
- **Environment variables** documentation in `--help` output
- **CLAUDE.md** project documentation
- **Electron desktop app** (CodeYangX) — via `codeyangx` entry point

### Changed

- **Prime provider switched** from Anthropic SDK to OpenAI-compatible (DeepSeek default) with Anthropic fallback
- **CLI UI redesign** — modern terminal style with OpenCode-inspired markdown rendering
- **Streaming output** — real-time token display with parallel tool execution
- **Session persistence** — now uses indexed metadata for fast listing
- **Tool registry** — supports MCP-discovered tools and Qt project injection
- **System prompt** — optimized for brevity, speed, and accuracy

### Fixed

- **Test isolation** — all 290 tests pass offline without network (axios mocked)
- **Anti-repetition** — loop detection prevents agent infinite loops
- **Tool caching** — Read/Glob results cached 5s to avoid redundant file reads
- **SIGINT handling** — double Ctrl+C guard prevents accidental data loss

## [0.2.0] - 2026-05-31

### Added

- **CLI-based AI coding agent** with streaming Anthropic API integration
- **Bash tool** — execute shell commands (`execa`-based, cross-platform)
- **Read tool** — read files with line offset/limit, directory listing
- **Write tool** — create/overwrite files with auto parent directory creation
- **Edit tool** — surgical text replacement with unique-match enforcement
- **Glob tool** — full glob-to-regex file matching with recursive directory walk
- **Grep tool** — regex content search with include filtering
- **TodoWrite tool** — task list management with status tracking and priority
- **WebFetch tool** — HTTP/HTTPS fetch with HTML-to-text conversion
- **Task tool** — autonomous sub-agent execution engine
- **Question tool** — interactive user clarification prompts
- **Session persistence** — save, load, list, and delete coding sessions
- **Retry with exponential backoff** — handles rate limits and transient errors
- **Configurable API keys** via environment variables and local config file
- **Terminal UI** with colored output, animated spinner, and formatted messaging
- **VS Code Extension** with dark-themed chat webview and tool-using agent loop
- *Double Ctrl+C guard* to prevent accidental data loss

### Changed

- N/A (initial release)

### Fixed

- N/A (initial release)
