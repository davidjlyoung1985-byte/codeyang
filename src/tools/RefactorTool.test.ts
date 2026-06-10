import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  executeRefactorRename,
  executeRefactorExtract,
  executeRefactorInline,
  executeRefactorOrganizeImports,
} from './RefactorTool.js';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

let tempDir: string;

beforeEach(async () => {
  tempDir = join(tmpdir(), `codeyang-refactor-${randomUUID()}`);
  await mkdir(tempDir, { recursive: true });
});

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 100));
  try {
    await rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  } catch (err) {
    console.warn(`Failed to clean up temp dir: ${tempDir}`, err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// RefactorRename Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('RefactorRename', () => {
  it('should rename a variable', async () => {
    const file = join(tempDir, 'test.js');
    await writeFile(
      file,
      `const oldName = 42;
console.log(oldName);
const result = oldName * 2;`,
    );

    const result = await executeRefactorRename(file, 1, 7, 'oldName', 'newName');

    expect(result).toContain('✓ Renamed "oldName" to "newName"');
    expect(result).toContain('References updated: 3');
  });

  it('should rename a function', async () => {
    const file = join(tempDir, 'test.js');
    await writeFile(
      file,
      `function oldFunc() { return 1; }
const x = oldFunc();
oldFunc();`,
    );

    const result = await executeRefactorRename(file, 1, 10, 'oldFunc', 'newFunc');

    expect(result).toContain('✓ Renamed "oldFunc" to "newFunc"');
    expect(result).toContain('References updated: 3');
  });

  it('should handle invalid identifier name', async () => {
    const file = join(tempDir, 'test.js');
    await writeFile(file, `const x = 1;`);

    const result = await executeRefactorRename(file, 1, 7, 'x', '123invalid');

    expect(result).toContain('Error: Invalid identifier name');
  });

  it('should handle no identifier at position', async () => {
    const file = join(tempDir, 'test.js');
    await writeFile(file, `const x = 1;`);

    const result = await executeRefactorRename(file, 1, 1, 'x', 'y');

    expect(result).toContain('Error: No identifier found');
  });

  it('should handle name mismatch', async () => {
    const file = join(tempDir, 'test.js');
    await writeFile(file, `const x = 1;`);

    const result = await executeRefactorRename(file, 1, 7, 'wrongName', 'newName');

    expect(result).toContain('Error: Symbol at position is "x", not "wrongName"');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RefactorExtract Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('RefactorExtract', () => {
  it('should extract simple code into function', async () => {
    const file = join(tempDir, 'test.js');
    await writeFile(
      file,
      `function main() {
  const a = 1;
  const b = 2;
  const sum = a + b;
  console.log(sum);
}`,
    );

    // Extract lines 4 (const sum = a + b;)
    const result = await executeRefactorExtract(file, 4, 3, 4, 22, 'calculateSum');

    expect(result).toContain('✓ Extracted function "calculateSum"');
    expect(result).toContain('Parameters: a, b');
  });

  it('should handle invalid function name', async () => {
    const file = join(tempDir, 'test.js');
    await writeFile(file, `const x = 1;`);

    const result = await executeRefactorExtract(file, 1, 1, 1, 10, '123invalid');

    expect(result).toContain('Error: Invalid function name');
  });

  it('should handle empty selection', async () => {
    const file = join(tempDir, 'test.js');
    await writeFile(file, `const x = 1;`);

    const result = await executeRefactorExtract(file, 1, 1, 1, 1, 'func');

    expect(result).toContain('Error: No code selected');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RefactorInline Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('RefactorInline', () => {
  it('should inline a variable', async () => {
    const file = join(tempDir, 'test.js');
    await writeFile(
      file,
      `function test() {
  const value = 42;
  console.log(value);
  return value * 2;
}`,
    );

    const result = await executeRefactorInline(file, 2, 9, 'value');

    expect(result).toContain('✓ Inlined variable "value"');
    expect(result).toContain('Value: 42');
  });

  it('should handle variable without initializer', async () => {
    const file = join(tempDir, 'test.js');
    await writeFile(
      file,
      `let x;
x = 1;`,
    );

    const result = await executeRefactorInline(file, 1, 5, 'x');

    expect(result).toContain('Error: Variable "x" has no initializer value');
  });

  it('should handle variable not found', async () => {
    const file = join(tempDir, 'test.js');
    await writeFile(file, `const x = 1;`);

    const result = await executeRefactorInline(file, 1, 1, 'nonexistent');

    expect(result).toContain('Error: Variable "nonexistent" not found');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RefactorOrganizeImports Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('RefactorOrganizeImports', () => {
  it('should organize and sort imports', async () => {
    const file = join(tempDir, 'test.ts');
    await writeFile(
      file,
      `import { z } from './local';
import axios from 'axios';
import * as path from 'node:path';
import { y } from './another';
import express from 'express';
import * as fs from 'node:fs';

const code = 'hello';`,
    );

    const result = await executeRefactorOrganizeImports(file);

    expect(result).toContain('✓ Organized imports');
    expect(result).toContain('Node.js imports: 2');
    expect(result).toContain('External imports: 2');
    expect(result).toContain('Local imports: 2');
  });

  it('should handle file with no imports', async () => {
    const file = join(tempDir, 'test.js');
    await writeFile(file, `const x = 1;\nconsole.log(x);`);

    const result = await executeRefactorOrganizeImports(file);

    expect(result).toContain('✓ No imports to organize');
  });

  it('should handle missing file', async () => {
    const result = await executeRefactorOrganizeImports(join(tempDir, 'nonexistent.js'));

    expect(result).toContain('Error: File does not exist');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Error Handling Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Error Handling', () => {
  it('RefactorRename handles missing file', async () => {
    const result = await executeRefactorRename('/nonexistent.js', 1, 1, 'x', 'y');
    expect(result).toContain('Error: File does not exist');
  });

  it('RefactorExtract handles missing file', async () => {
    const result = await executeRefactorExtract('/nonexistent.js', 1, 1, 1, 10, 'func');
    expect(result).toContain('Error: File does not exist');
  });

  it('RefactorInline handles missing file', async () => {
    const result = await executeRefactorInline('/nonexistent.js', 1, 1, 'x');
    expect(result).toContain('Error: File does not exist');
  });
});
