import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { existsSync } from 'node:fs';
import { executeEdit } from './EditTool.js';
import { editHistory } from '../utils/editHistory.js';

const TEST_DIR = path.join(process.cwd(), '.test-edit-tool');

describe('EditTool', () => {
  beforeEach(async () => {
    if (existsSync(TEST_DIR)) await fs.rm(TEST_DIR, { recursive: true, force: true });
    await fs.mkdir(TEST_DIR, { recursive: true });
    editHistory.clear();
  });

  afterEach(async () => {
    if (existsSync(TEST_DIR)) await fs.rm(TEST_DIR, { recursive: true, force: true });
    editHistory.clear();
  });

  describe('single replace', () => {
    it('should replace a single occurrence', async () => {
      const fp = path.join(TEST_DIR, 'edit.txt');
      await fs.writeFile(fp, 'Hello World');
      const result = await executeEdit(fp, 'Hello', 'Goodbye');
      expect(result).toContain('Edited');
      expect(await fs.readFile(fp, 'utf-8')).toBe('Goodbye World');
    });

    it('should replace in the middle of a file', async () => {
      const fp = path.join(TEST_DIR, 'middle.txt');
      await fs.writeFile(fp, 'line1\nOLD\nline3');
      await executeEdit(fp, 'OLD', 'NEW');
      expect(await fs.readFile(fp, 'utf-8')).toBe('line1\nNEW\nline3');
    });

    it('should replace with empty string (deletion)', async () => {
      const fp = path.join(TEST_DIR, 'delete.txt');
      await fs.writeFile(fp, 'before_to_remove_after');
      await executeEdit(fp, '_to_remove_', '');
      expect(await fs.readFile(fp, 'utf-8')).toBe('beforeafter');
    });

    it('should save previous content to edit history', async () => {
      const fp = path.join(TEST_DIR, 'history.txt');
      await fs.writeFile(fp, 'original content');
      await executeEdit(fp, 'original', 'modified');
      expect(editHistory.canUndo).toBe(true);
    });
  });

  describe('replaceAll', () => {
    it('should replace all occurrences', async () => {
      const fp = path.join(TEST_DIR, 'replaceall.txt');
      await fs.writeFile(fp, 'foo bar foo baz foo');
      const result = await executeEdit(fp, 'foo', 'qux', true);
      expect(result).toContain('Replaced 3 occurrence');
      expect(await fs.readFile(fp, 'utf-8')).toBe('qux bar qux baz qux');
    });

    it('should handle replaceAll with a single occurrence', async () => {
      const fp = path.join(TEST_DIR, 'replaceall-single.txt');
      await fs.writeFile(fp, 'only one here');
      await executeEdit(fp, 'one', 'two', true);
      expect(await fs.readFile(fp, 'utf-8')).toBe('only two here');
    });
  });

  describe('error handling', () => {
    it('should throw when file does not exist', async () => {
      await expect(executeEdit(path.join(TEST_DIR, 'nope.txt'), 'old', 'new')).rejects.toThrow(/not found/i);
    });

    it('should throw when oldString is not found', async () => {
      const fp = path.join(TEST_DIR, 'notfound.txt');
      await fs.writeFile(fp, 'some content');
      await expect(executeEdit(fp, 'nonexistent', 'new')).rejects.toThrow(/not found/i);
    });

    it('should throw when single replace finds multiple matches', async () => {
      const fp = path.join(TEST_DIR, 'multiple.txt');
      await fs.writeFile(fp, 'dup dup');
      await expect(executeEdit(fp, 'dup', 'new')).rejects.toThrow(/multiple matches/i);
    });
  });

  describe('edge cases', () => {
    it('should handle replacement at beginning of file', async () => {
      const fp = path.join(TEST_DIR, 'beginning.txt');
      await fs.writeFile(fp, 'START middle end');
      await executeEdit(fp, 'START', 'BEGIN');
      expect(await fs.readFile(fp, 'utf-8')).toBe('BEGIN middle end');
    });

    it('should handle replacement at end of file', async () => {
      const fp = path.join(TEST_DIR, 'ending.txt');
      await fs.writeFile(fp, 'begin middle END');
      await executeEdit(fp, 'END', 'FINISH');
      expect(await fs.readFile(fp, 'utf-8')).toBe('begin middle FINISH');
    });

    it('should handle multi-line oldString', async () => {
      const fp = path.join(TEST_DIR, 'multiline.txt');
      await fs.writeFile(fp, 'line1\nline2\nline3\nline4');
      await executeEdit(fp, 'line2\nline3', 'NEW_LINE');
      expect(await fs.readFile(fp, 'utf-8')).toBe('line1\nNEW_LINE\nline4');
    });

    it('should handle replace with special regex-like characters', async () => {
      const fp = path.join(TEST_DIR, 'special.txt');
      await fs.writeFile(fp, 'plain (text) [here]');
      await executeEdit(fp, '(text)', '(modified)');
      expect(await fs.readFile(fp, 'utf-8')).toBe('plain (modified) [here]');
    });

    it('should handle Unicode content', async () => {
      const fp = path.join(TEST_DIR, 'utf8.txt');
      await fs.writeFile(fp, '日本語のテキスト');
      await executeEdit(fp, '日本語', 'にほんご');
      expect(await fs.readFile(fp, 'utf-8')).toBe('にほんごのテキスト');
    });

    it('should work with relative paths', async () => {
      const originalCwd = process.cwd();
      try {
        process.chdir(TEST_DIR);
        await fs.writeFile('rel.txt', 'hello world');
        await executeEdit('rel.txt', 'hello', 'hi');
        expect(await fs.readFile('rel.txt', 'utf-8')).toBe('hi world');
      } finally {
        process.chdir(originalCwd);
      }
    });
  });

  describe('undo via editHistory', () => {
    it('should allow undo after edit', async () => {
      const fp = path.join(TEST_DIR, 'undo.txt');
      await fs.writeFile(fp, 'original');
      await executeEdit(fp, 'original', 'changed');
      const entry = editHistory.undo();
      expect(entry).not.toBeNull();
      expect(entry!.previousContent).toBe('original');
    });
  });
});
