import type { ToolDefinition } from '../../types.js';
import {
  executeGitStatus,
  executeGitDiff,
  executeGitCommit,
  executeGitBranch,
  executeGitCheckout,
  executeGitLog,
  executeGitPush,
  executeGitPull,
  executeGitClone,
  executeGitAdd,
  executeGitReset,
  executeGitStash,
  executeGitMerge,
  executeGitRemote,
  executeGitCurrentBranch,
  executeGitBlame,
} from '../GitTool.js';

export const definitions: ToolDefinition[] = [
  {
    name: 'GitStatus',
    description: 'Get git repository status. Shows modified, staged, and untracked files.',
    parameters: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: 'Working directory (optional)' },
        short: { type: 'boolean', description: 'Use short format (default: false)' },
      },
      required: [],
    },
    execute: async (args) => {
      const cwd = args['cwd'] ? String(args['cwd']) : undefined;
      const short = args['short'] === true;
      return executeGitStatus(cwd, short);
    },
  },
  {
    name: 'GitDiff',
    description: 'Show git diff. Can show unstaged or staged changes, optionally for a specific file.',
    parameters: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: 'Working directory (optional)' },
        staged: { type: 'boolean', description: 'Show staged changes (default: false)' },
        filePath: { type: 'string', description: 'Specific file to diff (optional)' },
      },
      required: [],
    },
    execute: async (args) => {
      const cwd = args['cwd'] ? String(args['cwd']) : undefined;
      const staged = args['staged'] === true;
      const filePath = args['filePath'] ? String(args['filePath']) : undefined;
      return executeGitDiff(cwd, staged, filePath);
    },
  },
  {
    name: 'GitCommit',
    description: 'Create a git commit with a message. Optionally stage all changes first.',
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Commit message' },
        cwd: { type: 'string', description: 'Working directory (optional)' },
        addAll: { type: 'boolean', description: 'Stage all changes before committing (default: false)' },
      },
      required: ['message'],
    },
    execute: async (args) => {
      const message = String(args['message'] ?? '');
      const cwd = args['cwd'] ? String(args['cwd']) : undefined;
      const addAll = args['addAll'] === true;
      return executeGitCommit(message, cwd, addAll);
    },
  },
  {
    name: 'GitBranch',
    description: 'List git branches. Can show local or all branches including remotes.',
    parameters: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: 'Working directory (optional)' },
        remotes: { type: 'boolean', description: 'Show remote branches too (default: false)' },
      },
      required: [],
    },
    execute: async (args) => {
      const cwd = args['cwd'] ? String(args['cwd']) : undefined;
      const remotes = args['remotes'] === true;
      return executeGitBranch(cwd, remotes);
    },
  },
  {
    name: 'GitCheckout',
    description: 'Switch to a branch or create a new branch.',
    parameters: {
      type: 'object',
      properties: {
        branch: { type: 'string', description: 'Branch name' },
        cwd: { type: 'string', description: 'Working directory (optional)' },
        create: { type: 'boolean', description: 'Create new branch (default: false)' },
      },
      required: ['branch'],
    },
    execute: async (args) => {
      const branch = String(args['branch'] ?? '');
      const cwd = args['cwd'] ? String(args['cwd']) : undefined;
      const create = args['create'] === true;
      return executeGitCheckout(branch, cwd, create);
    },
  },
  {
    name: 'GitLog',
    description: 'Show git commit history.',
    parameters: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: 'Working directory (optional)' },
        maxCount: { type: 'number', description: 'Maximum number of commits (default: 10)' },
        oneline: { type: 'boolean', description: 'Show in one-line format (default: false)' },
      },
      required: [],
    },
    execute: async (args) => {
      const cwd = args['cwd'] ? String(args['cwd']) : undefined;
      const maxCount = args['maxCount'] !== undefined ? Number(args['maxCount']) : 10;
      const oneline = args['oneline'] === true;
      return executeGitLog(cwd, maxCount, oneline);
    },
  },
  {
    name: 'GitPush',
    description: 'Push commits to remote repository. Use with caution on shared branches.',
    parameters: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: 'Working directory (optional)' },
        remote: { type: 'string', description: 'Remote name (default: "origin")' },
        branch: { type: 'string', description: 'Branch name (optional)' },
        force: { type: 'boolean', description: 'Force push (USE WITH EXTREME CAUTION, default: false)' },
      },
      required: [],
    },
    execute: async (args) => {
      const cwd = args['cwd'] ? String(args['cwd']) : undefined;
      const remote = args['remote'] ? String(args['remote']) : 'origin';
      const branch = args['branch'] ? String(args['branch']) : undefined;
      const force = args['force'] === true;
      return executeGitPush(cwd, remote, branch, force);
    },
  },
  {
    name: 'GitPull',
    description: 'Pull changes from remote repository.',
    parameters: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: 'Working directory (optional)' },
        remote: { type: 'string', description: 'Remote name (default: "origin")' },
        branch: { type: 'string', description: 'Branch name (optional)' },
      },
      required: [],
    },
    execute: async (args) => {
      const cwd = args['cwd'] ? String(args['cwd']) : undefined;
      const remote = args['remote'] ? String(args['remote']) : 'origin';
      const branch = args['branch'] ? String(args['branch']) : undefined;
      return executeGitPull(cwd, remote, branch);
    },
  },
  {
    name: 'GitClone',
    description: 'Clone a git repository from a URL.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Repository URL' },
        destination: { type: 'string', description: 'Destination directory (optional)' },
        cwd: { type: 'string', description: 'Working directory (optional)' },
      },
      required: ['url'],
    },
    execute: async (args) => {
      const url = String(args['url'] ?? '');
      const destination = args['destination'] ? String(args['destination']) : undefined;
      const cwd = args['cwd'] ? String(args['cwd']) : undefined;
      return executeGitClone(url, destination, cwd);
    },
  },
  {
    name: 'GitAdd',
    description: 'Stage files for commit.',
    parameters: {
      type: 'object',
      properties: {
        files: { type: 'array', items: { type: 'string' }, description: 'Files to stage' },
        cwd: { type: 'string', description: 'Working directory (optional)' },
      },
      required: ['files'],
    },
    execute: async (args) => {
      const files = (args['files'] as string[]) ?? [];
      const cwd = args['cwd'] ? String(args['cwd']) : undefined;
      return executeGitAdd(files, cwd);
    },
  },
  {
    name: 'GitReset',
    description: 'Unstage files or reset changes. Use hard reset with caution.',
    parameters: {
      type: 'object',
      properties: {
        files: { type: 'array', items: { type: 'string' }, description: 'Files to unstage (optional)' },
        cwd: { type: 'string', description: 'Working directory (optional)' },
        hard: { type: 'boolean', description: 'Hard reset - DISCARDS CHANGES (default: false)' },
      },
      required: [],
    },
    execute: async (args) => {
      const files = args['files'] ? (args['files'] as string[]) : undefined;
      const cwd = args['cwd'] ? String(args['cwd']) : undefined;
      const hard = args['hard'] === true;
      return executeGitReset(files, cwd, hard);
    },
  },
  {
    name: 'GitStash',
    description: 'Stash uncommitted changes. Can save, pop, list, or apply stashes.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['save', 'pop', 'list', 'apply'], description: 'Stash action (default: save)' },
        message: { type: 'string', description: 'Stash message (for save action)' },
        cwd: { type: 'string', description: 'Working directory (optional)' },
      },
      required: [],
    },
    execute: async (args) => {
      const action = (args['action'] as 'save' | 'pop' | 'list' | 'apply') || 'save';
      const message = args['message'] ? String(args['message']) : undefined;
      const cwd = args['cwd'] ? String(args['cwd']) : undefined;
      return executeGitStash(action, message, cwd);
    },
  },
  {
    name: 'GitMerge',
    description: 'Merge a branch into the current branch.',
    parameters: {
      type: 'object',
      properties: {
        branch: { type: 'string', description: 'Branch to merge' },
        cwd: { type: 'string', description: 'Working directory (optional)' },
        noFf: { type: 'boolean', description: 'Create merge commit even if fast-forward (default: false)' },
      },
      required: ['branch'],
    },
    execute: async (args) => {
      const branch = String(args['branch'] ?? '');
      const cwd = args['cwd'] ? String(args['cwd']) : undefined;
      const noFf = args['noFf'] === true;
      return executeGitMerge(branch, cwd, noFf);
    },
  },
  {
    name: 'GitRemote',
    description: 'List remote repositories.',
    parameters: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: 'Working directory (optional)' },
        verbose: { type: 'boolean', description: 'Show URLs (default: false)' },
      },
      required: [],
    },
    execute: async (args) => {
      const cwd = args['cwd'] ? String(args['cwd']) : undefined;
      const verbose = args['verbose'] === true;
      return executeGitRemote(cwd, verbose);
    },
  },
  {
    name: 'GitCurrentBranch',
    description: 'Show the current branch name.',
    parameters: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: 'Working directory (optional)' },
      },
      required: [],
    },
    execute: async (args) => {
      const cwd = args['cwd'] ? String(args['cwd']) : undefined;
      return executeGitCurrentBranch(cwd);
    },
  },
  {
    name: 'GitBlame',
    description: 'Show who last modified each line of a file.',
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'File to blame' },
        cwd: { type: 'string', description: 'Working directory (optional)' },
      },
      required: ['filePath'],
    },
    execute: async (args) => {
      const filePath = String(args['filePath'] ?? '');
      const cwd = args['cwd'] ? String(args['cwd']) : undefined;
      return executeGitBlame(filePath, cwd);
    },
  },
];
