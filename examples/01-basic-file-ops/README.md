# Example 1: Basic File Operations

This example demonstrates basic file operations using CodeYang's core tools.

## Scenario

You need to:
1. Create a project structure
2. Read and analyze files
3. Make automated edits
4. Search across multiple files

## Step-by-Step

### 1. Create Project Structure

```bash
codeyang
```

Then tell CodeYang:
```
Create a new TypeScript project structure:
- src/index.ts (main entry point)
- src/utils/logger.ts (logging utility)
- src/config.ts (configuration)
- package.json with basic dependencies
- tsconfig.json with strict mode
```

**What CodeYang does:**
1. Uses `Write` tool to create each file
2. Generates appropriate content for each file
3. Ensures consistent formatting

### 2. Read and Analyze Files

Ask CodeYang:
```
Read all TypeScript files in the src/ directory and summarize what each file does.
```

**Tools used:**
- `Glob` — Find all .ts files
- `Read` — Read each file
- LLM analysis — Summarize content

### 3. Automated Edits

Request:
```
In all TypeScript files, replace 'console.log' with 'logger.info' and add import for logger.
```

**Tools used:**
- `Grep` — Find files with console.log
- `Edit` — Replace text with find-replace
- `Read` — Verify changes

### 4. Search Across Files

Query:
```
Find all TODO comments in the project and list them with file paths.
```

**Tools used:**
- `Grep` — Search for pattern 'TODO'
- Formatted output with line numbers

## Expected Output

```
Created project structure:
✓ src/index.ts
✓ src/utils/logger.ts
✓ src/config.ts
✓ package.json
✓ tsconfig.json

Summary:
- index.ts: Main entry point, initializes app
- logger.ts: Logging utility with levels (info, warn, error)
- config.ts: Configuration management with env vars

Replaced console.log → logger.info:
✓ src/index.ts (3 replacements)
✓ src/utils/logger.ts (1 replacement)

Found 2 TODO comments:
- src/index.ts:15 — TODO: Add error handling
- src/config.ts:8 — TODO: Validate env vars
```

## Key Learnings

1. **Declarative requests** — Describe what you want, not how to do it
2. **Tool chaining** — CodeYang automatically chains tools (Glob → Read → Edit)
3. **Verification** — Always verify changes before committing

## Try It Yourself

```bash
cd examples/01-basic-file-ops
codeyang
# Then follow the steps above
```

## Common Pitfalls

❌ **Don't:** "Use Write tool to create index.ts with content X"
✅ **Do:** "Create index.ts as a TypeScript entry point"

❌ **Don't:** "Run Grep then Edit then Read"
✅ **Do:** "Replace all console.log with logger.info"

---

**Next:** [Example 2: Git Workflow](../02-git-workflow/)
