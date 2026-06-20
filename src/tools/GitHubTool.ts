import axios from 'axios';
import { toolError } from './errors.js';

interface GitHubConfig {
  token?: string;
  repo?: string;
}

let ghConfig: GitHubConfig = {};

/**
 * Configure the GitHub integration with a token and/or default repository.
 * Can also be set via the GITHUB_TOKEN environment variable.
 */
export function configureGitHub(token?: string, repo?: string): void {
  ghConfig = { token, repo };
}

/**
 * Execute a GitHub API action.
 *
 * Supported actions:
 *   - list-prs:   List open pull requests for a repository
 *   - list-issues: List open issues for a repository
 *   - get-file:    Get the content of a file from a repository
 *   - help:        Show usage information
 */
export async function executeGitHub(args: Record<string, unknown>): Promise<string> {
  const action = String(args['action'] ?? '');
  const token = ghConfig.token || process.env['GITHUB_TOKEN'] || '';

  if (!token && action !== 'help') {
    return toolError(
      'GitHub',
      'No authentication token available.',
      'Set GITHUB_TOKEN environment variable or use the gh-config tool to configure a token.',
    );
  }

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'codeyang',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const api = axios.create({
    baseURL: 'https://api.github.com',
    headers,
    timeout: 30_000,
  });

  try {
    switch (action) {
      case 'list-prs': {
        const repo = String(args['repo'] || ghConfig.repo || '');
        if (!repo) {
          return toolError(
            'GitHub',
            'Repository required (format: owner/repo).',
            'Provide a repo parameter or set a default via gh-config.',
          );
        }
        const { data } = await api.get(`/repos/${repo}/pulls`);
        if (!Array.isArray(data) || data.length === 0) {
          return `No open pull requests in ${repo}.`;
        }
        interface PullRequest {
          number: number;
          title: string;
          user?: { login?: string };
        }
        return (data as PullRequest[])
          .map((pr) => `#${pr.number} ${pr.title} (${pr.user?.login || 'unknown'})`)
          .join('\n');
      }

      case 'list-issues': {
        const repo = String(args['repo'] || ghConfig.repo || '');
        if (!repo) {
          return toolError(
            'GitHub',
            'Repository required (format: owner/repo).',
            'Provide a repo parameter or set a default via gh-config.',
          );
        }
        const { data } = await api.get(`/repos/${repo}/issues`, {
          params: { state: 'open', per_page: 10 },
        });
        interface Issue {
          number: number;
          title: string;
          pull_request?: unknown;
        }
        const issues = (Array.isArray(data) ? data : []).filter((i: Issue) => !i.pull_request);
        if (issues.length === 0) {
          return `No open issues in ${repo}.`;
        }
        return issues.map((i: Issue) => `#${i.number} ${i.title}`).join('\n');
      }

      case 'get-file': {
        const repo = String(args['repo'] || ghConfig.repo || '');
        const path = String(args['path'] ?? '');
        if (!repo || !path) {
          return toolError(
            'GitHub',
            'Both "repo" (owner/repo) and "path" (file path) are required.',
            'Example: repo=facebook/react path=README.md',
          );
        }
        const { data } = await api.get(`/repos/${repo}/contents/${encodeURIComponent(path)}`);
        if (!data.content) {
          return `Error: No content returned for ${path} in ${repo}. The path may point to a directory.`;
        }
        return Buffer.from(data.content, 'base64').toString('utf-8');
      }

      case 'config': {
        const newToken = String(args['token'] ?? ghConfig.token ?? process.env['GITHUB_TOKEN'] ?? '');
        const newRepo = String(args['repo'] ?? ghConfig.repo ?? '');
        configureGitHub(newToken || undefined, newRepo || undefined);
        return `GitHub configured: repo=${ghConfig.repo || '(not set)'}, token=${ghConfig.token ? '***' : '(not set)'}`;
      }

      case 'help':
      default:
        return [
          'GitHub Tool — Interact with the GitHub API',
          '',
          'Actions:',
          '  list-prs    repo=owner/repo              List open pull requests',
          '  list-issues repo=owner/repo              List open issues (up to 10)',
          '  get-file    repo=owner/repo path=path    Get file content from repository',
          '  config      token=xxx repo=owner/repo    Configure GitHub token/repo (optional)',
          '  help                                     Show this help message',
          '',
          'Configuration:',
          '  Set GITHUB_TOKEN environment variable or use the "config" action to authenticate.',
          '  A default repository can be set via the "config" action or gh-config tool.',
          '',
          'Examples:',
          '  action=list-prs repo=facebook/react',
          '  action=list-issues repo=vercel/next.js',
          '  action=get-file repo=torvalds/linux path=README.md',
        ].join('\n');
    }
  } catch (err: unknown) {
    const error = err as {
      response?: { status?: number; data?: { message?: string } };
      message?: string;
      config?: { url?: string };
    };
    const status = error.response?.status;
    const msg = error.response?.data?.message || error.message;
    if (status === 404) {
      return toolError(
        'GitHub',
        `Resource not found (404). Check that the repository and path exist.`,
        `Requested: ${error.config?.url || 'unknown'}`,
      );
    }
    if (status === 401 || status === 403) {
      return toolError(
        'GitHub',
        `Authentication error (${status}). Check your token permissions.`,
        'Ensure the token has repo scope for private repos.',
      );
    }
    return toolError('GitHub', `${error.config?.url || 'request'}: ${msg}`, 'Check the parameters and try again.');
  }
}
