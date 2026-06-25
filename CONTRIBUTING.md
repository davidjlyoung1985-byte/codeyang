# Contributing to CodeYang

Thank you for your interest in contributing to CodeYang! This guide will help you get started.

## Development Setup

### Prerequisites
- Node.js 18+ (18.x, 20.x, or 22.x)
- Git
- npm or pnpm

### Clone and Install
```bash
git clone https://github.com/davidjlyoung1985-byte/codeyang.git
cd codeyang
npm install
```

### Build and Test
```bash
npm run build       # Build ESM and types
npm test           # Run test suite (684 tests)
npm run lint       # Check code style
npm run format     # Auto-format code
```

## Project Structure

```
src/
├── agent/          # Core agent orchestration (Agent.ts, LLMClient.ts)
├── tools/          # Tool implementations (64+ tools)
│   ├── definitions/  # Tool schema definitions
│   └── *Tool.ts      # Individual tool executors
├── planner/        # Multi-step task planning
├── reflexion/      # Self-critique and learning
├── circuit-breaker/# Fault tolerance
├── gateway/        # Request validation and rate limiting
├── sandbox/        # Code execution isolation
├── mcp/            # Model Context Protocol client
└── qt/             # Qt framework support
```

## How to Contribute

### 1. Reporting Issues
- Search existing issues first
- Use issue templates for bugs/features
- Include reproduction steps for bugs
- Specify environment (OS, Node version)

### 2. Code Contributions

**Workflow:**
1. Fork the repository
2. Create a feature branch (`git checkout -b feat/amazing-feature`)
3. Make your changes
4. Write/update tests
5. Run `npm test` and `npm run lint`
6. Commit with clear messages
7. Push and create a Pull Request

**Commit Convention:**
Follow [Conventional Commits](https://www.conventionalcommits.org/):
```
feat: add new WebSearch tool
fix: handle timeout in BashTool
docs: update API examples
test: add coverage for GitTool
refactor: simplify permission cache
```

### 3. Adding a New Tool

Tools are the core extension points. Here's how to add one:

**Step 1: Create tool file** (`src/tools/MyTool.ts`)
```typescript
import { checkPermission } from '../permission/index.js';

export async function executeMyTool(
  param1: string,
  param2?: number
): Promise<string> {
  // Check permissions
  const perm = await checkPermission('mytool', param1);
  if (perm.level === 'deny') {
    throw new Error('Permission denied');
  }

  // Your implementation
  return `Result: ${param1}`;
}
```

**Step 2: Add schema** (`src/tools/definitions/mytool.def.ts`)
```typescript
export const myToolDefinition = {
  name: 'MyTool',
  description: 'Clear, concise description',
  inputSchema: {
    type: 'object',
    properties: {
      param1: { type: 'string', description: 'What this does' },
      param2: { type: 'number', description: 'Optional param' }
    },
    required: ['param1']
  }
};
```

**Step 3: Register in `src/tools/registry.ts`**
```typescript
import { executeMyTool } from './MyTool.js';
import { myToolDefinition } from './definitions/mytool.def.js';

registerTool('MyTool', myToolDefinition, async (args) => {
  return executeMyTool(args.param1, args.param2);
});
```

**Step 4: Write tests** (`src/tools/MyTool.test.ts`)
```typescript
import { describe, it, expect } from 'vitest';
import { executeMyTool } from './MyTool.js';

describe('MyTool', () => {
  it('should execute successfully', async () => {
    const result = await executeMyTool('test');
    expect(result).toContain('Result');
  });
});
```

### 4. Code Style

- **TypeScript**: Use strict types, avoid `any`
- **Naming**: camelCase for variables, PascalCase for types
- **Async**: Prefer `async/await` over callbacks
- **Error handling**: Use try-catch, provide context
- **Comments**: Only when WHY is non-obvious, not WHAT
- **Security**: Validate inputs, sanitize outputs

**ESLint Rules:**
- No unused variables (prefix with `_` if intentional)
- No floating promises (always await)
- Prefer `const` over `let`
- Use strict equality (`===`)

### 5. Testing Guidelines

**Coverage expectations:**
- New tools: 80%+ coverage
- Bug fixes: Add regression test
- Critical paths (auth, security): 100%

**Test patterns:**
```typescript
// Good: Descriptive, isolated, fast
it('should reject invalid URLs', async () => {
  await expect(validateUrl('ftp://bad')).rejects.toThrow(/protocol/);
});

// Avoid: Slow, flaky, unclear
it('test 1', async () => {
  await sleep(5000);
  expect(result).toBeTruthy();
});
```

**Environment-dependent tests:**
Use conditional skipping:
```typescript
it.skipIf(process.env.CI)('requires local Git config', async () => {
  // Test that needs specific local setup
});
```

### 6. Documentation

- Update README.md for user-facing changes
- Add JSDoc for public APIs
- Include examples for complex features
- Update `.github/CI-CD.md` for workflow changes

## Pull Request Process

1. **Before submitting:**
   - All tests pass (`npm test`)
   - Code linted (`npm run lint`)
   - No console warnings
   - Commit messages follow convention

2. **PR Description:**
   - What changed and why
   - Link related issues
   - Screenshots for UI changes
   - Breaking changes clearly marked

3. **Review process:**
   - Maintainer reviews within 3-5 days
   - Address feedback promptly
   - Squash commits before merge (if requested)

4. **Merge:**
   - CI must pass
   - At least one approval
   - No unresolved conversations

## Architecture Decisions

Key design principles:

- **Tools are pure functions**: No global state, deterministic
- **Security first**: Validate at boundaries, least privilege
- **Fail gracefully**: Circuit breakers, timeouts, fallbacks
- **Observable**: Tracing, audit logs, metrics
- **Extensible**: Plugin-based MCP integration

## Community

- **Questions?** Open a [Discussion](https://github.com/davidjlyoung1985-byte/codeyang/discussions)
- **Chat:** (coming soon)
- **Twitter:** (coming soon)

## Code of Conduct

Be respectful, inclusive, and constructive. We follow the [Contributor Covenant](https://www.contributor-covenant.org/).

## License

By contributing, you agree your code will be licensed under the project's MIT License.

---

**Need help?** File an issue or reach out in Discussions. We're here to help!
