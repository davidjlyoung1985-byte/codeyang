import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { executeGlob } from './GlobTool.js';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

// ──────────────────────────────────────────────
// Test helpers
// ──────────────────────────────────────────────

let tempDir: string;

beforeEach(async () => {
  tempDir = join(tmpdir(), `codeyang-glob-${randomUUID()}`);
  await mkdir(tempDir, { recursive: true });
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

async function createFile(name: string, content = ''): Promise<string> {
  const filePath = join(tempDir, name);
  await mkdir(join(filePath, '..'), { recursive: true });
  await writeFile(filePath, content, 'utf-8');
  return filePath;
}

async function createDir(name: string): Promise<string> {
  const dirPath = join(tempDir, name);
  await mkdir(dirPath, { recursive: true });
  return dirPath;
}

// ──────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────

describe('GlobTool', () => {
  describe('executeGlob', () => {
    it('matches TypeScript files with *.ts pattern', async () => {
      await createFile('index.ts', '// ts');
      await createFile('util.js', '// js');
      await createFile('readme.md', '# readme');

      const result = await executeGlob('*.ts', tempDir);

      expect(result).toContain('index.ts');
      expect(result).not.toContain('util.js');
      expect(result).not.toContain('readme.md');
    });

    it('matches files in subdirectories with **/*.ts pattern', async () => {
      await createDir('src');
      await createDir('src/utils');
      await createFile('src/index.ts', '// main');
      await createFile('src/utils/helper.ts', '// helper');
      await createFile('src/utils/helper.js', '// js');

      const result = await executeGlob('**/*.ts', tempDir);

      expect(result).toContain('src/index.ts');
      expect(result).toContain('src/utils/helper.ts');
      expect(result).not.toContain('src/utils/helper.js');
    });

    it('matches files at any depth with ** pattern', async () => {
      await createFile('a.txt', 'a');
      await createFile('dir/b.txt', 'b');
      await createFile('dir/sub/c.txt', 'c');

      const result = await executeGlob('**/*.txt', tempDir);

      expect(result).toContain('a.txt');
      expect(result).toContain('dir/b.txt');
      expect(result).toContain('dir/sub/c.txt');
    });

    it('handles custom root directory', async () => {
      await createDir('project-a');
      await createDir('project-b');
      await createFile('project-a/main.ts', '// a');
      await createFile('project-b/main.ts', '// b');

      const result = await executeGlob('*.ts', join(tempDir, 'project-a'));

      expect(result).toContain('main.ts');
      expect(result).not.toContain('project-b');
    });

    it('supports relative root path', async () => {
      const originalCwd = process.cwd();
      try {
        process.chdir(tempDir);
        await createFile('rel.ts', '// rel');
        await createFile('other.js', '// js');

        const result = await executeGlob('*.ts', '.');

        expect(result).toContain('rel.ts');
        expect(result).not.toContain('other.js');
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('returns "(no matches)" when pattern matches nothing', async () => {
      await createFile('readme.md', '# hello');

      const result = await executeGlob('*.ts', tempDir);

      expect(result).toBe('(no matches)');
    });

    it('returns "(no matches)" for empty directory', async () => {
      const result = await executeGlob('*', tempDir);

      expect(result).toBe('(no matches)');
    });

    it('handles invalid pattern gracefully', async () => {
      await createFile('test.txt', 'content');

      const result = await executeGlob('[invalid', tempDir);

      // Should not throw — returns (no matches) or the result
      expect(typeof result).toBe('string');
    });

    it('matches specific filenames with literal pattern', async () => {
      await createFile('foo.txt', 'foo');
      await createFile('bar.txt', 'bar');
      await createFile('baz.txt', 'baz');

      const result = await executeGlob('foo.txt', tempDir);

      expect(result).toBe('foo.txt');
    });

    it('does not walk into hidden directories', async () => {
      await createDir('.hidden');
      await createFile('.hidden/secret.ts', '// secret');
      await createFile('visible.ts', '// visible');

      const result = await executeGlob('**/*.ts', tempDir);

      expect(result).toContain('visible.ts');
      expect(result).not.toContain('secret.ts');
    });
  });
});
