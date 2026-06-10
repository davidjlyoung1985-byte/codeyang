---
name: s10-config-hot-reload
description: 配置热重载 — 运行时重新加载 config.json + /reload 命令
runAs: subagent
allowed-tools: read_file, write_file, edit_file, multi_edit, glob, search_content, run_command
---
# Config Hot-Reload

Allow reloading configuration at runtime without restart.

## Tasks

### 1. Add reload function to `src/agent/config.ts`

```typescript
let _configVersion = 0;

export function getConfigVersion(): number {
  return _configVersion;
}

export async function reloadConfig(): Promise<void> {
  try {
    const data = await import('node:fs/promises').then(fs => fs.readFile(CONFIG_FILE, 'utf-8'));
    const parsed = JSON.parse(data);
    // Merge without losing session API key
    const currentKey = sessionApiKey || localConfig.apiKey;
    localConfig = parsed;
    if (currentKey) {
      localConfig.apiKey = currentKey;
      sessionApiKey = currentKey;
    }
    _configVersion++;
    console.log(`Configuration reloaded (v${_configVersion})`);
  } catch (err) {
    throw new Error(`Failed to reload config: ${err instanceof Error ? err.message : String(err)}`);
  }
}
```

### 2. Add `/reload` command in `src/index.ts`

```typescript
if (lower === '/reload') {
  try {
    const { reloadConfig } = await import('./agent/config.js');
    await reloadConfig();
    console.log('  Configuration reloaded from ~/.codeyang/config.json');
  } catch (err) {
    console.error(`  ✗ ${err instanceof Error ? err.message : String(err)}`);
  }
  ui.promptUser();
  return;
}
```

### 3. Add to help text and valid commands

### 4. Verify
```bash
npm run check && npm test
```
