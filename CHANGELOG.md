# Changelog

All notable changes to CodeYang will be documented in this file.

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
