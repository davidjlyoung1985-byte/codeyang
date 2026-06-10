---
name: s18-github-integration
description: GitHub 集成工具 — PR/Issue 查看 + GitHub MCP 配置助手
runAs: subagent
allowed-tools: read_file, write_file, edit_file, multi_edit, glob, search_content, run_command
---
# GitHub Integration

Add GitHub API integration tools and MCP setup helper.

## Tasks

### 1. Create `src/tools/GitHubTool.ts`

```typescript
import axios from 'axios';

interface GitHubConfig {
  token?: string;
  repo?: string;
}

let ghConfig: GitHubConfig = {};

export function configureGitHub(token?: string, repo?: string): void {
  ghConfig = { token, repo };
}

export async function executeGitHub(args: Record<string, unknown>): Promise<string> {
  const action = String(args['action'] ?? '');
  const token = ghConfig.token || process.env['GITHUB_TOKEN'] || '';
  
  if (!token && action !== 'help') {
    return 'GitHub token not configured. Set GITHUB_TOKEN env var or use `gh-config` tool.';
  }
  
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'codeyang',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const api = axios.create({ baseURL: 'https://api.github.com', headers });
  
  try {
    switch (action) {
      case 'list-prs': {
        const repo = args['repo'] || ghConfig.repo;
        if (!repo) return 'Repo required (format: owner/repo)';
        const { data } = await api.get(`/repos/${repo}/pulls`);
        return data.map((pr: any) => `#${pr.number} ${pr.title} (${pr.user.login})`).join('\n') || 'No open PRs';
      }
      case 'list-issues': {
        const repo = args['repo'] || ghConfig.repo;
        if (!repo) return 'Repo required';
        const { data } = await api.get(`/repos/${repo}/issues`, { params: { state: 'open', per_page: 10 } });
        return data.filter((i: any) => !i.pull_request).map((i: any) => `#${i.number} ${i.title}`).join('\n');
      }
      case 'get-file': {
        const repo = args['repo'] || ghConfig.repo;
        const path = String(args['path'] ?? '');
        if (!repo || !path) return 'repo and path required';
        const { data } = await api.get(`/repos/${repo}/contents/${path}`);
        return Buffer.from(data.content, 'base64').toString();
      }
      case 'help':
      default:
        return `GitHub Tool — Actions:
  list-prs    repo=owner/repo     List open pull requests
  list-issues repo=owner/repo     List open issues
  get-file    repo=owner/repo path=file.txt   Get file content`;
    }
  } catch (err: any) {
    return `GitHub API error: ${err.response?.data?.message || err.message}`;
  }
}
```

### 2. Register in `src/tools/registry.ts`

Add to tools array:
```typescript
{
  name: 'GitHub',
  description: 'Interact with GitHub API. List PRs/issues, get file contents. Requires GITHUB_TOKEN.',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['list-prs', 'list-issues', 'get-file', 'help'] },
      repo: { type: 'string', description: 'Repository in format owner/repo' },
      path: { type: 'string', description: 'File path for get-file action' },
    },
    required: ['action'],
  },
  execute: async (args) => executeGitHub(args),
}
```

### 3. Verify
```bash
npm run check && npm test
```
