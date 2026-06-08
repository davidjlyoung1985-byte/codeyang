# Changelog

All notable changes to CodeYang will be documented in this file.

## [0.6.0] - 2026-06-13

### Added

- **Search tool** — combined file name + content search with ranked results
- **Image tools** — ImageInfo, ImageToBase64, ListImages
- **Code analysis tools** — ParseAst, AnalyzeCode, Complexity, Lint, FindDeps, CountLines
- **Network tools** — HttpRequest, DownloadFile, UploadFile, ApiCall, CheckUrl, ParseUrl
- **Unix-style math tools** — MathSolve (step-by-step), MathPlot (SVG diagrams), MathExplain (concept reference)
- **Qt project detection** — auto-injects Qt-specific tools for Qt projects
- **Configuration file** — `~/.codeyang/config.json` for API key, provider, base URL, MCP servers
- **Provider-agnostic LLM client** — DeepSeek (default), Anthropic Claude, OpenAI-compatible
- **`/tools` command** — list all available tools in-session
- **`/model` command** — switch models at runtime
- **`/mcp` command** — view MCP server status
- **Token usage tracking** — `/stats` command shows input/output/total tokens
- **Session search** — `/sessions --search <keyword>` to find past sessions by content
- **`.env` / `.env.local` support** — lightweight dotenv loader
- **Smart startup** — skips API key prompt if env var is already set
- **`--quiet` / `--non-interactive` flag** — for scripted/CI usage
- **StreamEvent helpers** — provider-agnostic test utilities (`textDelta`, `toolCallStart`, `makeStream`, etc.)

### Changed

- **Default model** changed from `claude-sonnet-4-20250514` to `deepseek-chat`
- **TaskTool now supports all providers** — no longer requires Anthropic Claude for sub-agents
- **Version unified** — single source in `src/version.ts`
- **Math tools moved to on-demand registration** — no longer in default toolset (saves context window)
- **Agent parameters configurable** via `CODEYANG_RETRIES`, `CODEYANG_MAX_TURNS`, `CODEYANG_TEMPERATURE`
- **CLI UI redesigned** — OpenCode-inspired modern terminal style
- **System prompt enhanced** — Command Handling section prevents vague responses like "什么模型"
- **CLAUDE.md updated** — reflects DeepSeek default and provider-agnostic architecture
- **README fully rewritten** — accurate tagline, env vars, commands, and tool tables

### Fixed

- **TaskTool incompatible with DeepSeek** — now works with all providers
- **Repeated "什么模型" responses** — system prompt now handles unknown commands
- **All 16 test files passing** — 347 tests across 20 test files
- **Agent tests refactored** — mock LLMClient interface directly (provider-agnostic)
- **SearchTool performance** — name search now uses glob pattern matching instead of `glob('**/*')` + JS filter
- **codeyangx version** — now reads from `package.json` instead of hardcoded `0.3.0`
- **tsup config** — removed unused `noExternal: []`

## [0.5.0] - 2026-06-04

### Fixed

- **NetworkTool tests** — replaced all httpbin.org live calls with `vi.mock('axios')`, all 272 tests now pass offline in ~25s (was 14 failing / 42s with network timeouts)

## [0.4.0] - 2026-06-03

### Added

- **Git tools** — GitStatus, GitDiff, GitCommit, GitBranch, GitCheckout, GitLog, GitPush, GitPull, GitClone, GitAdd, GitReset, GitStash, GitMerge, GitRemote, GitCurrentBranch, GitBlame
- **Data tools** — JsonParse, JsonWrite, JsonQuery, YamlParse, YamlWrite, Convert, CsvParse, CsvWrite, XmlParse, XmlWrite
- **File system tools** — Copy, Move, Delete, Mkdir, List, Exists
- **MCP server integration** — configure and connect external MCP servers
- **Session index** — metadata-only index for fast session listing
- **OpenAI-compatible client** — first DeepSeek support via OpenAI SDK
- **Configuration file** — `~/.codeyang/config.json` for API key and base URL

### Changed

- **Provider system** refactored to support multiple backends (Anthropic / OpenAI-compatible)

## [0.3.0] - 2026-06-01

### Added

- **Tool result caching** — avoids re-reading unchanged files within a session (5s TTL)
- **Anti-repetition detection** — stops if the same assistant text repeats
- **Retry with exponential backoff** — handles rate limits and transient errors
- **Session persistence** — save, load, list, and delete coding sessions
- **`--resume` CLI flag** — resume a previous session
- **`--list` and `--delete` CLI flags**
- **Double Ctrl+C guard** — prevents data loss from accidental double-trigger

### Fixed

- **Tool result mapping** — handles duplicate tool names correctly by position

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
- **Terminal UI** with colored output, animated spinner, and formatted messaging
- **VS Code Extension** with dark-themed chat webview and tool-using agent loop
