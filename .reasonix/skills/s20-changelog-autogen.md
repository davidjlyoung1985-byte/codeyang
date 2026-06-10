---
name: s20-changelog-autogen
description: CHANGELOG 自动生成 — 从 git log 提取 Commit 生成更新日志
runAs: subagent
allowed-tools: read_file, write_file, edit_file, multi_edit, glob, search_content, run_command
---
# CHANGELOG Auto-Generator

Script to auto-generate CHANGELOG from git commits.

## Tasks

### 1. Create `scripts/generate-changelog.ts`

```typescript
import { execSync } from 'node:child_process';

interface Commit {
  hash: string;
  message: string;
  type: 'feat' | 'fix' | 'docs' | 'refactor' | 'test' | 'chore' | 'perf' | 'merge' | 'other';
}

function parseType(msg: string): Commit['type'] {
  if (msg.startsWith('feat') || msg.startsWith('feature')) return 'feat';
  if (msg.startsWith('fix') || msg.startsWith('bug')) return 'fix';
  if (msg.startsWith('docs') || msg.startsWith('doc')) return 'docs';
  if (msg.startsWith('refactor') || msg.startsWith('ref')) return 'refactor';
  if (msg.startsWith('test')) return 'test';
  if (msg.startsWith('chore') || msg.startsWith('merge')) return 'chore';
  if (msg.startsWith('perf')) return 'perf';
  return 'other';
}

function getLastTag(): string {
  try {
    return execSync('git describe --tags --abbrev=0', { encoding: 'utf-8' }).trim();
  } catch {
    return '';
  }
}

function generateChangelog(from: string, to: string = 'HEAD'): string {
  const range = from ? `${from}..${to}` : to;
  const log = execSync(`git log --oneline --no-merges ${range}`, { encoding: 'utf-8' });
  
  const commits: Commit[] = log.trim().split('\n').filter(Boolean).map(line => {
    const match = line.match(/^([a-f0-9]+)\s(.+)$/);
    return {
      hash: match?.[1] ?? '',
      message: match?.[2] ?? line,
      type: parseType(match?.[2] ?? ''),
    };
  });
  
  const grouped: Record<string, Commit[]> = {};
  for (const c of commits) {
    (grouped[c.type] ??= []).push(c);
  }
  
  const labels: Record<string, string> = {
    feat: '🚀 Features', fix: '🐛 Bug Fixes', docs: '📄 Documentation',
    refactor: '♻️ Refactoring', test: '🧪 Tests', perf: '⚡ Performance',
    chore: '🔧 Chores', other: '📦 Other',
  };
  
  let md = `## [${new Date().toISOString().slice(0, 10)}]\n\n`;
  
  for (const [type, items] of Object.entries(grouped)) {
    if (items.length === 0) continue;
    md += `### ${labels[type] || type}\n\n`;
    for (const c of items) {
      md += `- ${c.message} ([${c.hash.slice(0, 7)}](..))\n`;
    }
    md += '\n';
  }
  
  return md;
}

// CLI mode
const from = process.argv[2] || getLastTag();
console.log(generateChangelog(from));
```

### 2. Add script to `package.json`
```json
"changelog": "npx tsx scripts/generate-changelog.ts"
```

### 3. Verify
```bash
npm run check
node -e "console.log('script created')"
```
