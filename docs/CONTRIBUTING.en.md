# Contributing to CodeYang

Thank you for your interest in contributing to CodeYang! This document provides guidelines and information for contributors.

---

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Contribution Guidelines](#contribution-guidelines)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Documentation](#documentation)

---

## Code of Conduct

We are committed to providing a welcoming and inclusive environment. Please:

- Be respectful and considerate
- Use inclusive language
- Accept constructive criticism gracefully
- Focus on what's best for the community
- Show empathy towards others

---

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- npm >= 8.0.0
- Git
- Familiarity with TypeScript

### Fork and Clone

```bash
# Fork the repository on GitHub

# Clone your fork
git clone https://github.com/YOUR_USERNAME/codeyang.git
cd codeyang

# Add upstream remote
git remote add upstream https://github.com/davidjlyoung1985-byte/codeyang.git
```

---

## Development Setup

### Installation

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Start in development mode
npm run dev
```

### Project Structure

```
codeyang/
├── src/
│   ├── agent/          # Core agent logic
│   ├── tools/          # Tool implementations
│   ├── bridge/         # Bridge server
│   ├── ui/             # Terminal UI
│   └── utils/          # Utilities
├── tests/              # Test files
├── docs/               # Documentation
└── examples/           # Usage examples
```

---

## Contribution Guidelines

### Types of Contributions

We welcome:

1. **Bug Fixes**
   - Fix reported issues
   - Add regression tests

2. **New Features**
   - Propose via GitHub issue first
   - Include tests and documentation

3. **Tool Additions**
   - Follow tool interface
   - Add comprehensive tests
   - Document usage

4. **Documentation**
   - Fix typos
   - Improve clarity
   - Add examples

5. **Tests**
   - Increase coverage
   - Add edge cases
   - Improve reliability

---

## Pull Request Process

### 1. Create a Branch

```bash
# Update main
git checkout main
git pull upstream main

# Create feature branch
git checkout -b feat/your-feature-name
```

### 2. Make Changes

- Write clean, readable code
- Follow coding standards
- Add tests for new functionality
- Update documentation

### 3. Commit Changes

Use [Conventional Commits](https://www.conventionalcommits.org/):

```bash
# Format: <type>(<scope>): <description>

git commit -m "feat(tools): add database query tool"
git commit -m "fix(agent): resolve context overflow issue"
git commit -m "docs(readme): update installation instructions"
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `test`: Testing
- `refactor`: Code refactoring
- `perf`: Performance improvement
- `chore`: Maintenance

### 4. Push and Create PR

```bash
# Push to your fork
git push origin feat/your-feature-name

# Create Pull Request on GitHub
```

### 5. PR Checklist

- [ ] Tests pass locally
- [ ] Code follows style guide
- [ ] Documentation updated
- [ ] Commit messages follow convention
- [ ] PR description is clear
- [ ] No console.log statements
- [ ] All TODOs removed or tracked

---

## Coding Standards

### TypeScript Style

```typescript
// Use explicit types
function processData(input: string): number {
  return input.length;
}

// Prefer interfaces over types for objects
interface UserConfig {
  name: string;
  age: number;
}

// Use const for immutable values
const MAX_RETRIES = 3;

// Use async/await over promises
async function fetchData(): Promise<Data> {
  const response = await fetch(url);
  return response.json();
}
```

### Naming Conventions

- **Files**: `kebab-case.ts`
- **Classes**: `PascalCase`
- **Functions**: `camelCase`
- **Constants**: `UPPER_SNAKE_CASE`
- **Interfaces**: `PascalCase`

### Error Handling

Use `CodeYangError` for all errors:

```typescript
import { CodeYangError, ErrorCode } from './errors';

throw new CodeYangError(
  'Failed to read file',
  ErrorCode.FILE_READ_ERROR,
  {
    context: { path: filePath },
    recoverable: true
  }
);
```

### Logging

Use the logger utility:

```typescript
import { logger } from './utils/logger';

logger.info('Processing started');
logger.warn('Rate limit approaching');
logger.error('Operation failed', { error });
```

---

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- src/agent/Agent.test.ts

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

### Writing Tests

Use Vitest framework:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('MyFeature', () => {
  beforeEach(() => {
    // Setup
  });

  afterEach(() => {
    // Cleanup
  });

  it('should do something', () => {
    const result = myFunction();
    expect(result).toBe(expected);
  });

  it('should handle errors', async () => {
    await expect(async () => {
      await riskyOperation();
    }).rejects.toThrow('Expected error');
  });
});
```

### Test Coverage

Maintain high coverage:
- **Core modules**: >= 85%
- **Tools**: >= 80%
- **Utilities**: >= 90%

---

## Documentation

### Code Comments

```typescript
/**
 * Processes user input and generates response.
 * 
 * @param input - User's message
 * @param context - Conversation context
 * @returns Generated response
 * @throws CodeYangError if processing fails
 */
async function processInput(
  input: string,
  context: Context
): Promise<string> {
  // Implementation
}
```

### README Updates

Update relevant README files when:
- Adding new features
- Changing APIs
- Modifying configuration

### Documentation Files

Create/update docs in `docs/` for:
- New features (guide)
- API changes (reference)
- Breaking changes (migration)

---

## Development Workflow

### 1. Issue First

For major changes:
1. Create GitHub issue
2. Discuss approach
3. Get approval
4. Implement

### 2. Small PRs

Keep PRs focused:
- One feature per PR
- < 500 lines changed
- Easy to review

### 3. Continuous Integration

Our CI runs:
- Linting (ESLint)
- Type checking (TypeScript)
- Tests (all platforms)
- Coverage check
- Security scan

All checks must pass.

### 4. Code Review

- Address review comments
- Update PR based on feedback
- Re-request review when ready

---

## Adding New Tools

### Tool Template

```typescript
// src/tools/MyNewTool.ts
import { ToolSchema } from '../types';

export const MyNewTool: ToolSchema = {
  name: 'my_new_tool',
  description: 'Brief description of what it does',
  input_schema: {
    type: 'object',
    properties: {
      param1: { 
        type: 'string',
        description: 'First parameter'
      }
    },
    required: ['param1']
  }
};

export async function executeMyNewTool(
  params: { param1: string }
): Promise<string> {
  // Implementation
  return 'Result';
}
```

### Register Tool

```typescript
// src/tools/index.ts
import { MyNewTool, executeMyNewTool } from './MyNewTool';

export const allTools = [
  // ...existing tools
  MyNewTool
];

export const toolExecutors = {
  // ...existing executors
  my_new_tool: executeMyNewTool
};
```

### Test Tool

```typescript
// src/tools/MyNewTool.test.ts
import { describe, it, expect } from 'vitest';
import { executeMyNewTool } from './MyNewTool';

describe('MyNewTool', () => {
  it('should execute successfully', async () => {
    const result = await executeMyNewTool({ param1: 'test' });
    expect(result).toBeDefined();
  });

  it('should handle errors', async () => {
    await expect(async () => {
      await executeMyNewTool({ param1: '' });
    }).rejects.toThrow();
  });
});
```

---

## Release Process

Maintainers follow this process:

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Create git tag: `git tag v1.0.0`
4. Push tag: `git push origin v1.0.0`
5. GitHub Actions auto-publishes to npm

---

## Getting Help

- **Questions**: Open a GitHub discussion
- **Bugs**: Create an issue with reproduction steps
- **Security**: Email security@codeyang.dev
- **Chat**: Join our Discord (coming soon)

---

## Recognition

Contributors are recognized in:
- `CONTRIBUTORS.md`
- Release notes
- GitHub contributors page

Thank you for making CodeYang better!

---

**Last Updated**: 2026-11-12  
**Maintainers**: See [MAINTAINERS.md](MAINTAINERS.md)
