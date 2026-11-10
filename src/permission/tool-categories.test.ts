import { describe, it, expect } from 'vitest';
import { categoryOf, permissionSubject, gitSubject } from './tool-categories.js';

describe('categoryOf', () => {
  it('classifies shell tools as bash', () => {
    expect(categoryOf('Bash')).toBe('bash');
    expect(categoryOf('PowerShell')).toBe('bash');
  });

  it('classifies network tools as network', () => {
    expect(categoryOf('WebFetch')).toBe('network');
    expect(categoryOf('ApiCall')).toBe('network');
    expect(categoryOf('DownloadFile')).toBe('network');
    expect(categoryOf('GitPush')).toBe('network');
  });

  it('classifies file-mutating tools as file', () => {
    expect(categoryOf('Write')).toBe('file');
    expect(categoryOf('Edit')).toBe('file');
    expect(categoryOf('MultiEdit')).toBe('file');
    expect(categoryOf('Delete')).toBe('file');
    expect(categoryOf('Move')).toBe('file');
  });

  it('returns null for read-only tools (no permission prompt)', () => {
    expect(categoryOf('Read')).toBeNull();
    expect(categoryOf('Glob')).toBeNull();
    expect(categoryOf('Grep')).toBeNull();
    expect(categoryOf('Search')).toBeNull();
    expect(categoryOf('GitStatus')).toBeNull();
    expect(categoryOf('GitDiff')).toBeNull();
  });

  it('treats unknown/plugin tools as file-touching (fail safe)', () => {
    expect(categoryOf('SomeMcpTool')).toBe('file');
  });
});

describe('permissionSubject', () => {
  it('uses the command for shell tools', () => {
    expect(permissionSubject('Bash', { command: 'rm -rf /tmp' })).toBe('rm -rf /tmp');
  });

  it('uses the URL for network tools', () => {
    expect(permissionSubject('WebFetch', { url: 'https://example.com' })).toBe('https://example.com');
    expect(permissionSubject('ApiCall', { endpoint: 'https://api.x/y' })).toBe('https://api.x/y');
  });

  it('uses the file path for file tools', () => {
    expect(permissionSubject('Write', { filePath: 'src/a.ts' })).toBe('src/a.ts');
    expect(permissionSubject('Delete', { path: 'build' })).toBe('build');
  });

  it('checks the destination for Move (that is where the write lands)', () => {
    expect(permissionSubject('Move', { source: 'a.txt', destination: 'b.txt' })).toBe('b.txt');
  });

  it('falls back to a serialized form when no known field is present', () => {
    const subject = permissionSubject('UnknownTool', { weird: 'value' });
    expect(subject).toContain('weird');
    expect(subject.length).toBeLessThanOrEqual(500);
  });

  it('returns an empty string when nothing usable is present', () => {
    expect(permissionSubject('Write', {})).toBe('{}');
  });
});

describe('gitSubject', () => {
  it('renders a git subcommand with its remote/branch args', () => {
    expect(gitSubject('GitPush', { remote: 'origin', branch: 'master' })).toBe('git push origin master');
  });

  it('renders a bare subcommand when there are no args', () => {
    expect(gitSubject('GitPush', {})).toBe('git push');
    expect(gitSubject('GitClone', {})).toBe('git clone');
  });

  it('includes the url for clone so pattern rules can match on it', () => {
    expect(gitSubject('GitClone', { url: 'https://github.com/x/y.git' })).toBe('git clone https://github.com/x/y.git');
  });
});
