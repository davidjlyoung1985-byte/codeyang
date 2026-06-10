import type { ToolDefinition } from '../../types.js';
import { executeGitHub } from '../GitHubTool.js';
import { requiredString, optionalString } from '../validate.js';

export const definitions: ToolDefinition[] = [
  {
    name: 'GitHub',
    description:
      'Interact with the GitHub API. List open pull requests, issues, or retrieve file contents from public/private repositories. Requires a GitHub token configured via GITHUB_TOKEN environment variable or the "config" action.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list-prs', 'list-issues', 'get-file', 'config', 'help'],
          description:
            'Action to perform: list-prs (list open PRs), list-issues (list open issues), get-file (get file content), config (set token/repo), help (show usage).',
        },
        repo: {
          type: 'string',
          description:
            'Repository in format owner/repo (e.g., "facebook/react"). Can also be set via the config action.',
        },
        path: {
          type: 'string',
          description: 'File path for the get-file action (e.g., "README.md" or "src/index.js").',
        },
        token: {
          type: 'string',
          description: 'GitHub personal access token (only used with the config action).',
        },
      },
      required: ['action'],
    },
    execute: async (args) => {
      return executeGitHub(args);
    },
  },
];
