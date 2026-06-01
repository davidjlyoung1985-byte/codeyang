# CodeYang v0.2.0 — Terminal AI Coding Agent

## Purpose
Terminal-based AI coding agent powered by Claude, with optional VS Code extension.

## Tech Stack
- **Runtime**: Node >=18, ESM (`"type": "module"`)
- **Language**: TypeScript
- **Key deps**: `@anthropic-ai/sdk` ^0.32.0, `@modelcontextprotocol/sdk` ^1.29.0, `execa` ^9.3.0, `picocolors` ^1.1.0
- **Build**: tsup (`src/index.ts` → `dist/index.js`, ESM, sourcemap, dts)
- **Test**: vitest v4.1.7
- **Lint**: eslint v10.4.1 (flat config) + typescript-eslint
- **Format**: prettier v3.8.3
- **License**: MIT

## Scripts
| Command | Task |
|---------|------|
| `npm run build` | tsup bundle |
| `npm run dev` | tsup watch mode |
| `npm test` | vitest run |
| `npm run test:watch` | vitest watch |
| `npm run test:coverage` | vitest with coverage |
| `npm run lint` | eslint check |
| `npm run lint:fix` | eslint fix |
| `npm run format` | prettier write |
| `npm run format:check` | prettier check |
| `npm run check` | tsc --noEmit |

## Source Layout
| Path | Purpose |
|------|---------|
| `src/index.ts` | CLI entry point |
| `src/agent/` | Agent orchestration |
| `src/mcp/` | MCP server logic / sub-agent delegation |
| `src/tools/` | MCP tool handlers |
| `src/ui/` | CLI UI / chat loop |
| `src/utils/` | Shared utilities |
| `src/types.ts` | Shared type definitions |
| `vscode-extension/` | VS Code extension (separate `package.json`) |
| `.github/workflows/ci.yml` | CI: test + lint + build on Node 18/20/22 |

## Coding Conventions
- TypeScript strict mode
- ESM imports (no `require`)
- Async/await for async code
- Flat ESLint config
- Prettier for formatting
- Vitest for testing (describe/it/expect)
