# CodeYang v0.6.0 — Terminal AI Coding Agent

## Purpose
Provider-agnostic terminal AI coding agent. Defaults to DeepSeek, also supports Anthropic Claude and any OpenAI-compatible API.

## Tech Stack
- **Runtime**: Node >=18, ESM (`"type": "module"`)
- **Language**: TypeScript
- **Key deps**: `@anthropic-ai/sdk` ^0.32.0, `openai` ^6.42.0, `@modelcontextprotocol/sdk` ^1.29.0, `execa` ^9.3.0, `picocolors` ^1.1.0
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
| `src/version.ts` | Single version source |
| `src/agent/` | Agent orchestration + provider-agnostic LLM client |
| `src/mcp/` | MCP server logic |
| `src/tools/` | Tool implementations (~25 built-in tools) |
| `src/ui/` | CLI UI with markdown rendering |
| `src/utils/` | Session store + dotenv loader |
| `src/math/` | Math tools (on-demand registration) |
| `src/qt/` | Qt project detection and tools |
| `src/types.ts` | Shared type definitions |
| `vscode-extension/` | VS Code extension (Anthropic-only legacy) |
| `.github/workflows/ci.yml` | CI: test + lint + build on Node 18/20/22 |

## Key Features
- Provider-agnostic: DeepSeek (default), Anthropic Claude, OpenAI-compatible
- Task sub-agent works with all providers (not just Anthropic)
- Session persistence with search (`/sessions --search <keyword>`)
- Token usage tracking (`/stats`)
- Smart startup: skips API key prompt if env var is set
- `.env` / `.env.local` support
- Configurable: `CODEYANG_RETRIES`, `CODEYANG_MAX_TURNS`, `CODEYANG_TEMPERATURE`
- Math tools on-demand (not in default toolset to save context)
- 322 tests across 18 test files

## Coding Conventions
- TypeScript strict mode
- ESM imports (no `require`)
- Async/await for async code
- Flat ESLint config
- Prettier for formatting
- Vitest for testing (describe/it/expect)
