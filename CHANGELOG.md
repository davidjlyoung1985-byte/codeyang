# Changelog

All notable changes to CodeYang will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [1.0.0] - 2026-01-XX

### 🎉 First Stable Release

CodeYang v1.0.0 marks the first production-ready release with comprehensive testing, excellent code coverage, and a robust feature set.

### Added

- **Enhanced Test Coverage** — Added 168+ new test cases across critical modules
  - MCP module: 66% → 82% coverage (+16%)
  - os-isolation: 47% → 49% coverage
  - LLMClient streaming tests
  - Bridge server unit tests
  - Total: 2305 tests, 120 test files
- **Improved Code Quality** — Fixed circular dependencies and enhanced error handling
- **Better Documentation** — Comprehensive improvement logs and contribution guides

### Fixed

- Circular dependency in tools registry
- Tool count test accuracy (now correctly reports 82 core tools)
- Edge cases in network isolation on Windows/Linux/macOS
- Error handling in stream consumption

### Changed

- Updated tool count from "60+ core tools" to "80+ core tools" in description
- Improved MCP manager with better error reporting
- Enhanced WebSocket handling in bridge server

### Technical Details

- **Project Score**: 89/100
- **Test Coverage**: 75.97% statements, 79.19% branches, 86.33% functions
- **Test Suite**: 2305 passing tests, 0 failures
- **Node Version**: >= 18
- **Dependencies**: All up to date

## [0.9.0] - Previous Beta

### Added

- **Streaming File I/O** — Efficient handling of large files (>10MB) with `StreamingFileReader`
  - Line-by-line and chunk-by-chunk reading modes
  - `readLastLines()` for tail-like functionality
  - `searchInLargeFile()` for memory-efficient pattern matching
  - 16 comprehensive unit tests
- **Performance Metrics System** — Track tool execution time, LLM latency, error rates
  - Percentile statistics (P50, P95, P99)
  - System metrics (memory, uptime)
  - Export as JSON or formatted report
  - Identify slow and error-prone tools
- **Benchmark Suite** — `scripts/benchmark.ts` for performance measurement
  - File operations, string ops, JSON, cache benchmarks
  - Warmup + actual measurement for accuracy
  - Operations per second calculation
- **LRU Cache** — Tool result caching with configurable size & TTL
  - Reduces redundant operations
  - Statistics tracking (hit rate, access count)
  - 19 unit tests
- **Debug Utilities** — Category-filtered debug logging
  - `debugLog()`, `debugTime()`, `debugTrace()`, `debugAssert()`
  - Controlled by `CODEYANG_DEBUG` environment variable
- **Docker Support** — Production-ready containerization
  - Multi-stage Dockerfile (builder + production)
  - Docker Compose with security hardening
  - Non-root user, health checks, resource limits
- **Comprehensive Documentation**
  - Architecture docs (554 lines, 6-layer design)
  - API reference (complete tool documentation)
  - Contributing guide (236 lines, tool development tutorial)
  - Deployment guide (Docker, Kubernetes, CI/CD)
  - Security policy (261 lines, vulnerability disclosure)
- **CI/CD Pipeline** — GitHub Actions workflows
  - Matrix testing: 3 Node versions × 3 OS = 9 platforms
  - Codecov integration for code coverage
  - Automatic npm publishing on release
  - Dependency security scanning (Dependabot)
- **Project Templates**
  - Bug report template
  - Feature request template
  - Pull request template with checklist

[1.0.0]: https://github.com/davidjlyoung1985-byte/codeyang/releases/tag/v1.0.0
[0.9.0]: https://github.com/davidjlyoung1985-byte/codeyang/releases/tag/v0.9.0
