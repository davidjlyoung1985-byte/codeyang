# API Reference

> Auto-generated API documentation for CodeYang tools.

## Table of Contents

- [Core Tools](#core-tools)
- [File System Tools](#file-system-tools)
- [Git Tools](#git-tools)
- [Shell Tools](#shell-tools)
- [Network Tools](#network-tools)
- [Code Analysis Tools](#code-analysis-tools)
- [Data Tools](#data-tools)
- [Task Management Tools](#task-management-tools)
- [Memory Tools](#memory-tools)
- [Agent Tools](#agent-tools)

---

## Core Tools

### Read

Read file contents with optional line range.

**Parameters:**
- `file_path` (string, required) — Path to file
- `offset` (number, optional) — Start line number (0-indexed)
- `limit` (number, optional) — Number of lines to read (default: 2000)

**Returns:** File contents with line numbers

**Example:**
```typescript
const content = await executeTool('Read', {
  file_path: '/path/to/file.ts',
  offset: 0,
  limit: 100
});
```

---

### Write

Write content to file (creates if doesn't exist).

**Parameters:**
- `file_path` (string, required) — Path to file
- `content` (string, required) — Content to write

**Returns:** Success message

**Example:**
```typescript
await executeTool('Write', {
  file_path: '/path/to/file.ts',
  content: 'console.log("Hello");'
});
```

---

### Edit

Edit file with find-and-replace.

**Parameters:**
- `file_path` (string, required) — Path to file
- `old_string` (string, required) — Text to replace
- `new_string` (string, required) — Replacement text
- `replace_all` (boolean, optional) — Replace all occurrences (default: false)

**Returns:** Success message with changes made

**Example:**
```typescript
await executeTool('Edit', {
  file_path: '/path/to/file.ts',
  old_string: 'oldFunction',
  new_string: 'newFunction',
  replace_all: true
});
```

---

### Grep

Search for pattern in files.

**Parameters:**
- `pattern` (string, required) — Regex pattern to search
- `path` (string, optional) — Directory or file to search (default: cwd)
- `glob` (string, optional) — File pattern filter (e.g., "*.ts")
- `output_mode` (string, optional) — "content" | "files_with_matches" | "count"
- `-i` (boolean, optional) — Case insensitive
- `-n` (boolean, optional) — Show line numbers
- `-C` (number, optional) — Context lines before/after match

**Returns:** Search results

**Example:**
```typescript
const results = await executeTool('Grep', {
  pattern: 'TODO',
  glob: '*.ts',
  output_mode: 'content',
  '-n': true
});
```

---

### Glob

Find files matching pattern.

**Parameters:**
- `pattern` (string, required) — Glob pattern (e.g., "**/*.ts")
- `path` (string, optional) — Base directory (default: cwd)

**Returns:** List of matching file paths

**Example:**
```typescript
const files = await executeTool('Glob', {
  pattern: 'src/**/*.test.ts'
});
```

---

## File System Tools

### List

List directory contents.

**Parameters:**
- `path` (string, required) — Directory path
- `recursive` (boolean, optional) — Recursive listing

**Returns:** Directory listing with file info

---

### Move

Move or rename file/directory.

**Parameters:**
- `source` (string, required) — Source path
- `destination` (string, required) — Destination path

---

### Copy

Copy file/directory.

**Parameters:**
- `source` (string, required) — Source path
- `destination` (string, required) — Destination path

---

### Delete

Delete file/directory.

**Parameters:**
- `path` (string, required) — Path to delete
- `recursive` (boolean, optional) — Delete recursively

---

## Git Tools

### GitStatus

Show working tree status.

**Parameters:**
- `path` (string, optional) — Repository path (default: cwd)

**Returns:** Git status output

---

### GitDiff

Show changes between commits/files.

**Parameters:**
- `path` (string, optional) — Repository path
- `staged` (boolean, optional) — Show staged changes only
- `file_path` (string, optional) — Specific file to diff

---

### GitCommit

Create commit.

**Parameters:**
- `message` (string, required) — Commit message
- `path` (string, optional) — Repository path
- `add_all` (boolean, optional) — Stage all changes before commit

---

### GitLog

Show commit history.

**Parameters:**
- `path` (string, optional) — Repository path
- `count` (number, optional) — Number of commits (default: 10)
- `oneline` (boolean, optional) — One-line format

---

### GitBranch

List, create, or switch branches.

**Parameters:**
- `path` (string, optional) — Repository path
- `branch_name` (string, optional) — Branch name to create/switch
- `create` (boolean, optional) — Create new branch

---

## Shell Tools

### Bash

Execute bash command.

**Parameters:**
- `command` (string, required) — Command to execute
- `timeout` (number, optional) — Timeout in milliseconds (default: 120000)

**Returns:** Command output (stdout + stderr + exit code)

**Security:** Commands go through deny list and permission checks.

---

### PowerShell

Execute PowerShell command (Windows).

**Parameters:**
- `command` (string, required) — Command to execute
- `timeout` (number, optional) — Timeout in milliseconds

---

## Network Tools

### WebFetch

Fetch URL content.

**Parameters:**
- `url` (string, required) — URL to fetch
- `method` (string, optional) — HTTP method (default: GET)
- `headers` (object, optional) — Request headers
- `body` (string, optional) — Request body

**Returns:** Response body

**Security:** SSRF protection blocks private IPs.

---

### WebSearch

Search the web (requires search API key).

**Parameters:**
- `query` (string, required) — Search query
- `count` (number, optional) — Number of results (default: 5)

**Returns:** Search results with titles, URLs, snippets

---

## Code Analysis Tools

### CodeAnalysis

Analyze code quality and structure.

**Parameters:**
- `file_path` (string, required) — File to analyze
- `checks` (string[], optional) — Specific checks to run

**Returns:** Analysis results (complexity, issues, metrics)

---

### Refactor

Refactor code (rename, extract, etc.).

**Parameters:**
- `file_path` (string, required) — File to refactor
- `operation` (string, required) — "rename" | "extract" | "inline"
- `target` (string, required) — What to refactor
- `replacement` (string, optional) — New name/value

---

## Data Tools

### DataTransform

Parse and transform CSV/JSON data.

**Parameters:**
- `input` (string, required) — Input data or file path
- `format` (string, required) — "csv" | "json"
- `operation` (string, optional) — Transform operation

**Returns:** Transformed data

---

## Task Management Tools

### TaskCreate

Create background task.

**Parameters:**
- `command` (string, required) — Command to run
- `description` (string, optional) — Task description

**Returns:** Task ID

---

### TaskList

List running tasks.

**Returns:** Array of tasks with status

---

### TaskStop

Stop running task.

**Parameters:**
- `task_id` (string, required) — Task ID to stop

---

## Memory Tools

### MemoryStore

Store information for future conversations.

**Parameters:**
- `key` (string, required) — Memory key
- `value` (string, required) — Value to store
- `type` (string, optional) — "fact" | "preference" | "instruction" | "context"

---

### MemoryRecall

Recall stored memories.

**Parameters:**
- `query` (string, optional) — Search query
- `type` (string, optional) — Filter by type
- `limit` (number, optional) — Max results

**Returns:** Array of matching memories

---

## Agent Tools

### Agent

Spawn sub-agent for subtask.

**Parameters:**
- `prompt` (string, required) — Task for sub-agent
- `description` (string, required) — Short description (3-5 words)
- `subagent_type` (string, optional) — Specialized agent type

**Returns:** Sub-agent result

---

## Permission System

All tools respect the permission system:
- **allow** — Execute without confirmation
- **ask** — Prompt user for confirmation
- **deny** — Block execution

Set permission mode via:
```bash
codeyang --permission ask  # Safe mode
codeyang --permission auto # Auto-allow safe operations
```

---

## Rate Limiting

Tools are rate-limited to prevent abuse:
- Token bucket: 30 burst, 10/sec refill
- Per-tool custom limits
- Configurable via `CODEYANG_RATE_LIMIT_RPM`

---

## Error Handling

All tools return structured errors:
```typescript
{
  success: false,
  error: "Error message",
  code: "ERROR_CODE"
}
```

Common error codes:
- `PERMISSION_DENIED` — Permission system blocked
- `FILE_NOT_FOUND` — File doesn't exist
- `TIMEOUT` — Operation timed out
- `INVALID_ARGS` — Invalid arguments

---

## Tool Development

See [CONTRIBUTING.md](../CONTRIBUTING.md) for how to add new tools.

---

**Generated:** 2026-06-25  
**Version:** 0.7.0
