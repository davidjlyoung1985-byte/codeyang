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
import { requiredString, optionalString, optionalBoolean, optionalNumber } from '../validate.js';
import { invalidParam } from '../errors.js';

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
      const cwd = optionalString(args, 'cwd');
      const short = optionalBoolean(args, 'short', false) ?? false;
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
      const cwd = optionalString(args, 'cwd');
      const staged = optionalBoolean(args, 'staged', false) ?? false;
      const filePath = optionalString(args, 'filePath');
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
      const message = requiredString(args, 'message');
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
      const cwd = optionalString(args, 'cwd');
      const remotes = optionalBoolean(args, 'remotes', false) ?? false;
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
      const branch = requiredString(args, 'branch');
      const cwd = optionalString(args, 'cwd');
      const create = optionalBoolean(args, 'create', false) ?? false;
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
      const cwd = optionalString(args, 'cwd');
      const maxCount = optionalNumber(args, 'maxCount', 10) ?? 10;
      const oneline = optionalBoolean(args, 'oneline', false) ?? false;
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
      const cwd = optionalString(args, 'cwd');
      const remote = optionalString(args, 'remote', 'origin') ?? 'origin';
      const branch = optionalString(args, 'branch');
      const force = optionalBoolean(args, 'force', false) ?? false;
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
      const cwd = optionalString(args, 'cwd');
      const remote = optionalString(args, 'remote', 'origin') ?? 'origin';
      const branch = optionalString(args, 'branch');
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
      const url = requiredString(args, 'url');
      const destination = optionalString(args, 'destination');
      const cwd = optionalString(args, 'cwd');
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
      if (!Array.isArray(files) || files.length === 0) {
        throw new Error(invalidParam('files', 'a non-empty array'));
      }
      const cwd = optionalString(args, 'cwd');
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
      const cwd = optionalString(args, 'cwd');
      const hard = optionalBoolean(args, 'hard', false) ?? false;
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
      const message = optionalString(args, 'message');
      const cwd = optionalString(args, 'cwd');
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
      const branch = requiredString(args, 'branch');
      const cwd = optionalString(args, 'cwd');
      const noFf = optionalBoolean(args, 'noFf', false) ?? false;
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
      const cwd = optionalString(args, 'cwd');
      const verbose = optionalBoolean(args, 'verbose', false) ?? false;
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
      const cwd = optionalString(args, 'cwd');
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
      const filePath = requiredString(args, 'filePath');
      const cwd = optionalString(args, 'cwd');
      return executeGitBlame(filePath, cwd);
    },
  },
];
