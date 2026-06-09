---
name: add-dotenv-support
description: 添加 dotenv 支持 — .env 文件加载
runAs: subagent
allowed-tools: read_file, write_file, edit_file, multi_edit, glob, search_content, run_command, create_directory
---
# Add dotenv support for local development

You are a configuration specialist. Add dotenv (.env) loading support to CodeYang.

## Context

Currently, environment variables must be set in the shell or passed via `--api-key`. Many developers expect `.env` file support for local development.

## Tasks

### 1. Install dotenv

```bash
npm install dotenv
npm install -D @types/dotenv
```

### 2. Add dotenv loading in `src/index.ts`

Add at the very top of the file (before any config access):

```typescript
import 'dotenv/config';
```

This automatically loads `.env` from the project root.

### 3. Update .gitignore

Ensure `.env` is already ignored (it is — verify).

### 4. Create `.env.example`

Create a `.env.example` with all supported env vars documented:

```
# CodeYang Configuration
CODEYANG_API_KEY=your-api-key-here
CODEYANG_MODEL=deepseek-chat
CODEYANG_BASE_URL=https://api.deepseek.com/v1
CODEYANG_MAX_TOKENS=8192
CODEX_DEBUG=false
```

### 5. Verify

```bash
npm run check
npm test
```

## Files to Edit
- `src/index.ts` — add `import 'dotenv/config'`
- `.env.example` — create
- `package.json` — add `dotenv` dependency
