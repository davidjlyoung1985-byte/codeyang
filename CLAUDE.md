# CodeYang v0.7.0 — Terminal AI Coding Agent

## Purpose
Terminal-based AI coding agent with 64+ tools, MCP server support, session persistence, and Qt project specialization.

## Tech Stack
- **Runtime**: Node >=18, ESM (`"type": "module"`)
- **Language**: TypeScript
- **Key deps**: `openai` (primary provider driver), `@anthropic-ai/sdk` (Anthropic fallback), `@modelcontextprotocol/sdk` (MCP), `execa` (shell), `picocolors` (UI), `axios` (HTTP)
- **Build**: tsup (`src/index.ts` → `dist/index.js`, ESM, sourcemap, dts)
- **Test**: vitest ^3.2.6 — 290+ tests
- **Lint**: eslint v10.4.1 (flat config) + typescript-eslint
- **Format**: prettier v3.8.3
- **License**: MIT

## Scripts
| Command | Task |
|---------|------|
| `npm run build` | tsup bundle |
| `npm run dev` | tsup watch mode |
| `npm start` | run the CLI agent |
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
| `src/index.ts` | CLI entry point (arg parsing, key resolution, agent setup) |
| `src/agent/` | Agent orchestration, LLM client, config/system prompt |
| `src/mcp/` | MCP client + manager (connect external tool servers) |
| `src/tools/` | 60+ tool definitions and executors |
| `src/ui/` | CLI terminal UI with markdown rendering |
| `src/utils/` | Session persistence, memory store |
| `src/qt/` | Qt project detection, knowledge injection, and tools |
| `src/math/` | Math solver, SVG plotter, concept explainer |
| `src/types.ts` | Shared type definitions |
| `codeyangx/` | Electron desktop app (separate `package.json`) |
| `vscode-extension/` | VS Code extension (separate `package.json`) |

## Environment Variables
| Variable | Default | Description |
|----------|---------|-------------|
| `CODEYANG_API_KEY` | — | API key for the LLM provider |
| `DEEPSEEK_API_KEY` | — | Fallback API key env var |
| `CODEYANG_MODEL` | `deepseek-chat` | Model name |
| `CODEYANG_BASE_URL` | `https://api.deepseek.com/v1` | Custom API base URL |
| `CODEYANG_MAX_TOKENS` | `8192` | Max tokens per response |

## Tools
| Category | Tools |
|----------|-------|
| **Core** | Bash, Read, Write, Edit, Glob, Grep |
| **FS** | Copy, Move, Delete, Mkdir, List, Exists |
| **Data** | JsonParse/Write/Query, YamlParse/Write, Convert, CsvParse/Write, XmlParse/Write |
| **Git** | Status, Diff, Commit, Branch, Checkout, Log, Push, Pull, Clone, Add, Reset, Stash, Merge, Remote, CurrentBranch, Blame |
| **Code** | ParseAst, AnalyzeCode, Complexity, Lint, FindDeps, CountLines |
| **Network** | HttpRequest, DownloadFile, UploadFile, ApiCall, CheckUrl, ParseUrl |
| **Search** | Search (combined name + content) |
| **Image** | ImageInfo, ImageToBase64, ListImages |
| **Math** | MathSolve, MathPlot, MathExplain |
| **Memory** | Remember, Recall, Forget, ListMemories |
| **Sub-agent** | Task (autonomous sub-agent execution) |
| **UX** | TodoWrite, WebFetch, Question |
| **MCP** | Dynamic — any MCP-connected server tools |

## Coding Conventions
- TypeScript strict mode
- ESM imports (no `require`)
- Async/await for async code
- Flat ESLint config
- Prettier for formatting
- Vitest for testing (describe/it/expect)
