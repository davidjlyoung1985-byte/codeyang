# Changelog

All notable changes to CodeYang will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added

- **Streaming File I/O** 鈥?Efficient handling of large files (>10MB) with `StreamingFileReader`
  - Line-by-line and chunk-by-chunk reading modes
  - `readLastLines()` for tail-like functionality
  - `searchInLargeFile()` for memory-efficient pattern matching
  - 16 comprehensive unit tests
- **Performance Metrics System** 鈥?Track tool execution time, LLM latency, error rates
  - Percentile statistics (P50, P95, P99)
  - System metrics (memory, uptime)
  - Export as JSON or formatted report
  - Identify slow and error-prone tools
- **Benchmark Suite** 鈥?`scripts/benchmark.ts` for performance measurement
  - File operations, string ops, JSON, cache benchmarks
  - Warmup + actual measurement for accuracy
  - Operations per second calculation
- **LRU Cache** 鈥?Tool result caching with configurable size & TTL
  - Reduces redundant operations
  - Statistics tracking (hit rate, access count)
  - 19 unit tests
- **Debug Utilities** 鈥?Category-filtered debug logging
  - `debugLog()`, `debugTime()`, `debugTrace()`, `debugAssert()`
  - Controlled by `CODEYANG_DEBUG` environment variable
- **Docker Support** 鈥?Production-ready containerization
  - Multi-stage Dockerfile (builder + production)
  - Docker Compose with security hardening
  - Non-root user, health checks, resource limits
- **Comprehensive Documentation**
  - Architecture docs (554 lines, 6-layer design)
  - API reference (complete tool documentation)
  - Contributing guide (236 lines, tool development tutorial)
  - Deployment guide (Docker, Kubernetes, CI/CD)
  - Security policy (261 lines, vulnerability disclosure)
- **CI/CD Pipeline** 鈥?GitHub Actions workflows
  - Matrix testing: 3 Node versions 脳 3 OS = 9 platforms
  - Codecov integration for code coverage
  - Automatic npm publishing on release
  - Dependency security scanning (Dependabot)
- **Project Templates**
  - Bug report template
  - Feature request template
  - Pull request template with checklist

### Changed

- **README restructured** 鈥?Added badges, reorganized features (Core/Advanced/Enterprise)
- **ESLint configuration** 鈥?Migrated to flat config, added ignore patterns
- **Test count** 鈥?Increased from 703 to 719 tests (+16)

### Fixed

- **All lint warnings** 鈥?Reduced from 19 to 0
- **All test failures** 鈥?Reduced from 9 to 0
- Permission cache isolation in tests
- Git commit test assertions
- Qt build tool test timeouts
- NetworkTool axios.defaults handling
- **`/commit` (and `/diff`, `/branch`, `/gen-commit`) ignored the session directory** - the git commands used `process.cwd()` instead of the caller's directory. The test suite passed a temp `cwd` that was silently dropped, so `git add -A && git commit` ran against the *developer's real repo*; this is what produced the stray `Test User <test@example.com>` commits in the history. `CommandContext` now carries an optional `cwd`, resolved via `resolveCwd(ctx)`.
- **Stale `rateLimiter` tests** - asserted a hardcoded bash limit of 30 while the code had moved to 200 (12 failures); tests now derive limits from `getRateLimitStats().max` so they cannot drift again
- **Flaky `closed-loop` `VerificationPipeline` test** - shelled out to real `npx eslint`/`npx tsc` from an empty temp dir, which made `npx` fetch packages from the network and time out under load; the process boundary is now mocked and the assertion verifies TS-file filtering (15s+ down to ~1.4s)
- **Brittle `sandbox-runner` duration assertion** - upper bound raised from 500ms to 10s so a loaded host does not fail a timer-plumbing check

### Changed

- **Test parallelism capped** at `maxWorkers: 4` - several suites shell out to real `git`/`npx` or do heavy fs I/O; unbounded parallelism starved them on Windows. The full suite is both faster and deterministic under the cap.
- **Timeout budgets** raised to 60s for filesystem- and git-heavy tests

### Removed

- **Accidental `mattpocock-skills` gitlink** - a nested clone was committed as a submodule pointer with no `.gitmodules`, so a fresh clone would get an empty directory; now untracked and ignored
- **Scratch scripts** `run-chunks.ps1` / `run-one-chunk.ps1` and the `chunk-results/` log directory they produced

## [0.8.0] - 2026-09-11

### Added

- **Ponytail methodology** - lazy-senior-dev prompt mode with three intensities (`lite` / `full` / `ultra`), enabled via `PONYTAIL_MODE` or the `/ponytail` command
- **Ponytail skills** - `/ponytail-debt` (track deliberate shortcuts) and `/ponytail-review` (detect over-engineering)

### Changed

- **Windows command execution ~80x faster** - `BashTool` switched from PowerShell to `cmd.exe` (~1.3s to ~16ms per command)
- **Removed all `process.chdir` dependencies** - full compatibility with CI thread-pool test mode
- **Version single-sourced** - `src/version.ts` now derives from `package.json`, so A2A, MCP client, web server, and CLI all report the same value

## [0.7.0] - 2026-06-10

### Added

- **Refactoring Tools** 鈥?4 new intelligent code refactoring tools powered by TypeScript Compiler API
  - **RefactorRename** 鈥?Rename symbols (variables, functions, classes) across files with automatic reference tracking
  - **RefactorExtract** 鈥?Extract code blocks into new functions with automatic parameter and return value detection
  - **RefactorInline** 鈥?Inline variables by replacing all uses with their values
  - **RefactorOrganizeImports** 鈥?Sort and group imports (Node.js / External / Local) with alphabetical ordering
- **Test Coverage** 鈥?17 new tests for refactoring tools (100% pass rate)
- **Validation Helper** 鈥?Added `requiredNumber()` utility for parameter validation

### Changed

- **Tool Count** 鈥?Increased from 60+ to 64+ tools
- **Test Count** 鈥?Increased from 477 to 494 tests

## [0.6.1] - 2026-06-10

### Fixed

- **QtBuildTool timeout** 鈥?reduced timeout from 60s to 10s for faster test failure when qmake/cmake not installed
- **Test cleanup on Windows** 鈥?added retry logic and delay to handle file locks during temp directory cleanup
- **GlobTool benchmark timeouts** 鈥?increased performance thresholds and test timeouts to accommodate large projects with node_modules
- **ESLint configuration conflict** 鈥?added `overrideConfigFile: true` to prevent test files from loading project tsconfig-dependent ESLint config

### Changed

- **Test pass rate** 鈥?improved from 99.2% (473/477) to 100% (477/477)
- **Test execution time** 鈥?reduced from ~30s to ~18s (-40%)

## [0.6.0] - 2026-07-10

### Changed

- **README fully rewritten** 鈥?corrected provider from Claude to DeepSeek/OpenAI-compatible, added missing tools (Memory, Image, Math, Search, MCP, Qt), fixed environment variable docs and interactive command reference
- **Version unified** 鈥?package.json, CLI, MCP client, and UI now all report 0.6.0 consistently
- **Anti-repetition threshold raised** 鈥?from 1 repeat to 2, preventing false positives on legitimate repeated patterns

### Removed

- **Unused `jiti` dependency** 鈥?was never imported anywhere in the codebase
- **Redundant `form-data` dependency** 鈥?axios handles multipart natively

### Fixed

- **MCP client hardcoded version** 鈥?was `0.3.0`, now `0.6.0` in sync with the rest of the project

## [0.5.0] - 2026-06-15

### Added

- **Math module** 鈥?expression solver (MathSolve), SVG plotter (MathPlot), concept explainer (MathExplain)
- **MCP manager dynamic refresh** 鈥?`refreshTools()` allows discovering newly added MCP tools without restart
- **Multi-provider LLM client** 鈥?OpenAI-compatible (DeepSeek default) and Anthropic fallback

### Changed

- **CLI entry point refactored** 鈥?modular arg parsing, API key resolution flow
- **Agent callbacks** 鈥?streaming deltas for real-time token display
- **Tool context injection** 鈥?per-session cwd, model, and maxTokens context

## [0.4.0] - 2026-06-08

### Added

- **Full Git version control** 鈥?16 Git tools (status, diff, commit, branch, checkout, log, push, pull, clone, add, reset, stash, merge, remote, current-branch, blame)
- **Code analysis tools** 鈥?AST parsing, code structure analysis, cyclomatic complexity, ESLint runner, dependency finder, line counter
- **Network tools** 鈥?HTTP requests, file download/upload, API calls, URL check/parse
- **Data format tools** 鈥?JSON Parse/Write/Query, YAML Parse/Write, CSV Parse/Write, XML Parse/Write, JSON-YAML Convert
- **File system tools** 鈥?Copy, Move, Delete, Mkdir, List, Exists
- **Search tool** 鈥?combined file name + content search with ranked results
- **Image tools** 鈥?ImageInfo, ImageToBase64, ListImages
- **Memory system** 鈥?persistent key-value memory with Remember/Recall/Forget/ListMemories and 5 types (fact, preference, project, instruction, context)
- **API key config save** 鈥?first-run key prompt now offers to save to `~/.codeyang/config.json`
- **`--api-key` CLI argument** to pass API key directly
- **Environment variables** documentation in `--help` output
- **CLAUDE.md** project documentation
- **Electron desktop app** (CodeYangX) 鈥?via `codeyangx` entry point

### Changed

- **Prime provider switched** from Anthropic SDK to OpenAI-compatible (DeepSeek default) with Anthropic fallback
- **CLI UI redesign** 鈥?modern terminal style with OpenCode-inspired markdown rendering
- **Streaming output** 鈥?real-time token display with parallel tool execution
- **Session persistence** 鈥?now uses indexed metadata for fast listing
- **Tool registry** 鈥?supports MCP-discovered tools and Qt project injection
- **System prompt** 鈥?optimized for brevity, speed, and accuracy

### Fixed

- **Test isolation** 鈥?all 290 tests pass offline without network (axios mocked)
- **Anti-repetition** 鈥?loop detection prevents agent infinite loops
- **Tool caching** 鈥?Read/Glob results cached 5s to avoid redundant file reads
- **SIGINT handling** 鈥?double Ctrl+C guard prevents accidental data loss

## [0.2.0] - 2026-05-31

### Added

- **CLI-based AI coding agent** with streaming Anthropic API integration
- **Bash tool** 鈥?execute shell commands (`execa`-based, cross-platform)
- **Read tool** 鈥?read files with line offset/limit, directory listing
- **Write tool** 鈥?create/overwrite files with auto parent directory creation
- **Edit tool** 鈥?surgical text replacement with unique-match enforcement
- **Glob tool** 鈥?full glob-to-regex file matching with recursive directory walk
- **Grep tool** 鈥?regex content search with include filtering
- **TodoWrite tool** 鈥?task list management with status tracking and priority
- **WebFetch tool** 鈥?HTTP/HTTPS fetch with HTML-to-text conversion
- **Task tool** 鈥?autonomous sub-agent execution engine
- **Question tool** 鈥?interactive user clarification prompts
- **Session persistence** 鈥?save, load, list, and delete coding sessions
- **Retry with exponential backoff** 鈥?handles rate limits and transient errors
- **Configurable API keys** via environment variables and local config file
- **Terminal UI** with colored output, animated spinner, and formatted messaging
- **VS Code Extension** with dark-themed chat webview and tool-using agent loop
- *Double Ctrl+C guard* to prevent accidental data loss

### Changed

- N/A (initial release)

### Fixed

- N/A (initial release)
