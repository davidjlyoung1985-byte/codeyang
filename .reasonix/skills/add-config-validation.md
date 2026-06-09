---
name: add-config-validation
description: 添加配置校验 — 启动时验证 config.json 字段
runAs: subagent
allowed-tools: read_file, write_file, edit_file, multi_edit, glob, search_content, run_command
---
# Configuration Validation at Startup

You are a configuration specialist. Add runtime validation of the config file.

## Context

`src/agent/config.ts` loads `~/.codeyang/config.json` with no validation. Invalid configs (missing fields, wrong types) fail silently with cryptic errors.

## Tasks

### 1. Add Validation in `src/agent/config.ts`

Add a validator function called after `loadLocalConfig()`:

```typescript
interface ValidationError {
  field: string;
  message: string;
}

function validateConfig(config: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = [];
  
  if (config.apiKey !== undefined && typeof config.apiKey !== 'string') {
    errors.push({ field: 'apiKey', message: 'must be a string' });
  }
  
  if (config.apiBaseURL !== undefined && typeof config.apiBaseURL !== 'string') {
    errors.push({ field: 'apiBaseURL', message: 'must be a string' });
  }
  
  if (config.apiProvider !== undefined && !['deepseek', 'anthropic', 'custom'].includes(config.apiProvider as string)) {
    errors.push({ field: 'apiProvider', message: 'must be "deepseek", "anthropic", or "custom"' });
  }
  
  if (config.mcpServers !== undefined) {
    if (typeof config.mcpServers !== 'object' || Array.isArray(config.mcpServers)) {
      errors.push({ field: 'mcpServers', message: 'must be an object mapping server names to configs' });
    } else {
      for (const [name, cfg] of Object.entries(config.mcpServers as Record<string, unknown>)) {
        if (typeof cfg !== 'object') {
          errors.push({ field: `mcpServers.${name}`, message: 'must be an object with "command" and "args"' });
        }
      }
    }
  }
  
  return errors;
}
```

### 2. Add Validation Call in `src/index.ts`

After `loadLocalConfig()`, call the validation and print warnings:

```typescript
import { validateConfig } from './agent/config.js';

// In main():
const configErrors = validateConfig();
if (configErrors.length > 0) {
  console.log(`  Configuration warnings:`);
  for (const e of configErrors) {
    console.log(`    ! ${e.field}: ${e.message}`);
  }
}
```

### 3. Add export in `src/agent/config.ts`

Export the `validateConfig()` function.

### 4. Verify

```bash
npm run check
npm test
```

## Files to Edit
- `src/agent/config.ts` — add validateConfig
- `src/index.ts` — call validation after loading config
