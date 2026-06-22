import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { matchGlob } from './GlobTool.js';
import { executeTodoWrite, getTodos, type TodoItem } from './TodoWriteTool.js';
import { executeEdit } from './EditTool.js';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { clearTodos } from '../utils/todoStore.js';

// ──────────────────────────────────────────────
// GlobTool tests
// ──────────────────────────────────────────────

describe('matchGlob', () => {
  describe('exact match', () => {
    it('matches simple filename', () => {
      expect(matchGlob('file.txt', 'file.txt')).toBe(true);
    });

    it('does not match different filename', () => {
      expect(matchGlob('file.txt', 'other.txt')).toBe(false);
    });

    it('does not match substring unsless pattern says so', () => {
      expect(matchGlob('file', 'myfile')).toBe(false);
    });
  });

  describe('wildcard *', () => {
    it('matches any characters in the same directory level', () => {
      expect(matchGlob('*.ts', 'index.ts')).toBe(true);
      expect(matchGlob('*.ts', 'types.ts')).toBe(true);
      expect(matchGlob('*.ts', 'config.ts')).toBe(true);
    });

    it('does not match across directory boundaries', () => {
      expect(matchGlob('*.ts', 'src/index.ts')).toBe(false);
      expect(matchGlob('*.ts', 'a/b/c.ts')).toBe(false);
    });

    it('matches prefix with star', () => {
      expect(matchGlob('src/*.ts', 'src/index.ts')).toBe(true);
      expect(matchGlob('src/*.ts', 'src/types.ts')).toBe(true);
      expect(matchGlob('src/*.ts', 'lib/index.ts')).toBe(false);
    });
  });

  describe('double star **', () => {
    it('matches across directories', () => {
      expect(matchGlob('**/*.ts', 'src/index.ts')).toBe(true);
      expect(matchGlob('**/*.ts', 'a/b/c/d.ts')).toBe(true);
      expect(matchGlob('**/*.ts', 'file.ts')).toBe(true);
    });

    it('matches empty directory path', () => {
      expect(matchGlob('src/**/*.ts', 'src/index.ts')).toBe(true);
      expect(matchGlob('src/**/*.ts', 'src/a/b/c.ts')).toBe(true);
    });

    it('respects prefix directory', () => {
      expect(matchGlob('src/**/*.ts', 'lib/index.ts')).toBe(false);
      expect(matchGlob('src/**/*.ts', 'src/lib/index.ts')).toBe(true);
    });
  });

  describe('question mark ?', () => {
    it('matches exactly one non-slash character', () => {
      expect(matchGlob('file?.ts', 'file1.ts')).toBe(true);
      expect(matchGlob('file?.ts', 'fileA.ts')).toBe(true);
      expect(matchGlob('file?.ts', 'file.ts')).toBe(false);
      expect(matchGlob('file?.ts', 'file12.ts')).toBe(false);
    });

    it('does not match slash', () => {
      expect(matchGlob('file?.ts', 'file/.ts')).toBe(false);
    });
  });

  describe('character class [...]', () => {
    it('matches any char in the class', () => {
      expect(matchGlob('[ab]*.ts', 'a.ts')).toBe(true);
      expect(matchGlob('[ab]*.ts', 'b.ts')).toBe(true);
      expect(matchGlob('[ab]*.ts', 'c.ts')).toBe(false);
    });

    it('respects negation [!...]', () => {
      expect(matchGlob('[!ab]*.ts', 'c.ts')).toBe(true);
      expect(matchGlob('[!ab]*.ts', 'a.ts')).toBe(false);
      expect(matchGlob('[!ab]*.ts', 'b.ts')).toBe(false);
    });
  });

  describe('regex metacharacters are escaped', () => {
    it('handles dots as literal', () => {
      expect(matchGlob('package.json', 'package.json')).toBe(true);
      expect(matchGlob('package.json', 'packageXjson')).toBe(false);
    });

    it('handles plus signs as literal', () => {
      expect(matchGlob('C++.h', 'C++.h')).toBe(true);
      expect(matchGlob('C++.h', 'CX.h')).toBe(false);
    });
  });
});

// ──────────────────────────────────────────────
// TodoWriteTool tests
// ──────────────────────────────────────────────

describe('executeTodoWrite', () => {
  beforeEach(async () => {
    await clearTodos();
  });

  it('rejects empty array', async () => {
    const result = await executeTodoWrite([]);
    expect(result).toContain('Usage:');
  });

  it('rejects non-array', async () => {
    const result = await executeTodoWrite(undefined as unknown as TodoItem[]);
    expect(result).toContain('Usage:');
  });

  it('creates and tracks todos', async () => {
    const result = await executeTodoWrite([
      { content: 'Task A', status: 'pending', priority: 'high' },
      { content: 'Task B', status: 'in_progress', priority: 'medium' },
      { content: 'Task C', status: 'completed', priority: 'low' },
    ]);
    expect(result).toContain('Task A');
    expect(result).toContain('Task B');
    expect(result).toContain('3: 2 active, 1 done, 0 cancelled');

    // All items are persisted (including completed)
    const todos = await getTodos();
    expect(todos.length).toBe(3);
  });

  it('normalizes invalid status/priority', async () => {
    await executeTodoWrite([
      { content: 'X', status: 'invalid' as TodoItem['status'], priority: 'invalid' as TodoItem['priority'] },
    ]);
    const todos = await getTodos();
    expect(todos[0].status).toBe('pending');
    expect(todos[0].priority).toBe('medium');
  });

  it('merges updates by content', async () => {
    await executeTodoWrite([{ content: 'Task', status: 'pending', priority: 'high' }]);
    await executeTodoWrite([{ content: 'Task', status: 'completed', priority: 'high' }]);
    const todos = await getTodos();
    expect(todos.length).toBe(1);
    expect(todos[0].status).toBe('completed');
  });

  it('replaces items not in update', async () => {
    await executeTodoWrite([{ content: 'Task 1', status: 'in_progress', priority: 'high' }]);
    await executeTodoWrite([{ content: 'Task 2', status: 'pending', priority: 'medium' }]);
    const todos = await getTodos();
    // Each write replaces the file — only Task 2 remains
    expect(todos.find((t) => t.content === 'Task 1')).toBeUndefined();
    expect(todos.find((t) => t.content === 'Task 2')).toBeDefined();
  });
});

// ──────────────────────────────────────────────
// EditTool tests
// ──────────────────────────────────────────────

describe('executeEdit', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `codeyang-test-${randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  async function createTestFile(name: string, content: string): Promise<string> {
    const path = join(tempDir, name);
    await writeFile(path, content, 'utf-8');
    return path;
  }

  it('replaces a single occurrence', async () => {
    const filePath = await createTestFile('test.ts', 'const x = 1;\nconst y = 2;');
    const result = await executeEdit(filePath, 'const x = 1', 'let x = 10');
    expect(result).toContain('1 occurrence');
    const { readFile } = await import('node:fs/promises');
    const content = await readFile(filePath, 'utf-8');
    expect(content).toContain('let x = 10');
    expect(content).not.toContain('const x = 1');
  });

  it('throws on multiple matches without replaceAll', async () => {
    const filePath = await createTestFile('dup.ts', 'dup\ndup\n');
    await expect(executeEdit(filePath, 'dup', 'new', false)).rejects.toThrow('multiple matches');
  });

  it('replaces all with replaceAll=true', async () => {
    const filePath = await createTestFile('dup.ts', 'dup\ndup\n');
    const result = await executeEdit(filePath, 'dup', 'new', true);
    expect(result).toContain('2 occurrence');
    const { readFile } = await import('node:fs/promises');
    const content = await readFile(filePath, 'utf-8');
    expect(content).toBe('new\nnew\n');
  });

  it('throws when oldString not found', async () => {
    const filePath = await createTestFile('test.ts', 'hello world');
    await expect(executeEdit(filePath, 'nonexistent', 'replacement')).rejects.toThrow('not found');
  });

  it('throws on nonexistent file', async () => {
    await expect(executeEdit(join(tempDir, 'nope.txt'), 'a', 'b')).rejects.toThrow('File not found');
  });
});
