---
name: codeyang-dev
description: CodeYang project conventions, TDD workflow, TypeScript patterns, and build/verify pipeline. Use when developing features, fixing bugs, or running tests in this project.
---

# CodeYang Development

## Project: Terminal AI Coding Agent (v0.2.0)

Tech stack: TypeScript, ESM, Node >=18, tsup build, Vitest, ESLint flat config, Prettier.

## Verify Before Every Commit

```
npm run check          # tsc --noEmit (type check)
npm test               # vitest run (52 tests across 4 files)
npm run lint           # eslint check
npm run format:check   # prettier check
npm run build          # tsup bundle
```

## Architecture

| Path | Purpose |
|------|---------|
| `src/index.ts` | CLI entry point |
| `src/agent/Agent.ts` | Agent orchestration (core logic) |
| `src/agent/config.ts` | Agent configuration |
| `src/mcp/McpClient.ts` | MCP client (external tool servers) |
| `src/mcp/McpManager.ts` | MCP server connection manager |
| `src/mcp/types.ts` | MCP type definitions |
| `src/tools/registry.ts` | Tool registry (Bash, Read, Write, Edit, Glob, Grep, Task, WebFetch, TodoWrite) |
| `src/ui/CliUI.ts` | CLI UI (box-drawing, markdown, spinner) |
| `src/utils/sessionStore.ts` | Session persistence |
| `src/types.ts` | Shared types |

## Conventions

- ESM imports only (`import` / `export`), no `require`
- Async/await for async code
- TypeScript strict mode
- Vitest `describe`/`it`/`expect` for tests
- Never commit secrets or `.env` files

## TDD Workflow

1. Write failing test in `src/tools/`, `src/agent/`, or `src/utils/`
2. Run `npm test` to confirm failure
3. Implement minimal code to pass
4. Run `npm test` to confirm pass
5. Run `npm run check` for type safety
6. Run `npm run lint` for style
7. Refactor and repeat
