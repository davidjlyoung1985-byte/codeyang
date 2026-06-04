import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { existsSync } from 'node:fs';
import {
  executeParseAst,
  executeAnalyzeCode,
  executeComplexity,
  executeLint,
  executeFindDeps,
  executeCountLines,
} from './CodeAnalysisTool.js';

const TEST_DIR = path.join(process.cwd(), '.test-code-analysis');

describe('CodeAnalysisTool', () => {
  beforeEach(async () => {
    if (existsSync(TEST_DIR)) {
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    }
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    if (existsSync(TEST_DIR)) {
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe('executeParseAst', () => {
    it('should parse JavaScript code', async () => {
      const file = path.join(TEST_DIR, 'test.js');
      await fs.writeFile(file, 'const x = 1;\nfunction foo() { return x; }');

      const result = await executeParseAst(file, 'javascript');

      expect(result).toContain('"type"');
      expect(result).toContain('Program');
    });

    it('should parse TypeScript code', async () => {
      const file = path.join(TEST_DIR, 'test.ts');
      await fs.writeFile(file, 'const x: number = 1;\nfunction foo(): number { return x; }');

      const result = await executeParseAst(file, 'typescript');

      expect(result).toContain('"type"');
      expect(result).toContain('Program');
    });

    it('should handle missing file', async () => {
      const result = await executeParseAst('nonexistent.js', 'javascript');

      expect(result).toContain('Error');
      expect(result).toContain('does not exist');
    });
  });

  describe('executeAnalyzeCode', () => {
    it('should analyze imports', async () => {
      const file = path.join(TEST_DIR, 'test.js');
      await fs.writeFile(
        file,
        `import fs from 'fs';\nimport path from 'path';\nconst x = 1;`,
      );

      const result = await executeAnalyzeCode(file, 'javascript');

      expect(result).toContain('Imports: 2');
      expect(result).toContain('fs');
      expect(result).toContain('path');
    });

    it('should analyze functions', async () => {
      const file = path.join(TEST_DIR, 'test.js');
      await fs.writeFile(
        file,
        `function foo(a, b) { return a + b; }\nconst bar = (x) => x * 2;`,
      );

      const result = await executeAnalyzeCode(file, 'javascript');

      expect(result).toContain('Functions: 2');
      expect(result).toContain('foo');
      expect(result).toContain('bar');
    });

    it('should analyze classes', async () => {
      const file = path.join(TEST_DIR, 'test.js');
      await fs.writeFile(
        file,
        `class MyClass {\n  method1() {}\n  method2() {}\n}`,
      );

      const result = await executeAnalyzeCode(file, 'javascript');

      expect(result).toContain('Classes: 1');
      expect(result).toContain('MyClass');
      expect(result).toContain('2 methods');
    });

    it('should analyze variables', async () => {
      const file = path.join(TEST_DIR, 'test.js');
      await fs.writeFile(
        file,
        `const x = 1;\nlet y = 2;\nvar z = 3;`,
      );

      const result = await executeAnalyzeCode(file, 'javascript');

      expect(result).toContain('Variables: 3');
      expect(result).toContain('const x');
      expect(result).toContain('let y');
      expect(result).toContain('var z');
    });

    it('should analyze exports', async () => {
      const file = path.join(TEST_DIR, 'test.js');
      await fs.writeFile(
        file,
        `export function foo() {}\nexport const bar = 1;`,
      );

      const result = await executeAnalyzeCode(file, 'javascript');

      expect(result).toContain('Exports:');
      expect(result).toContain('foo');
      expect(result).toContain('bar');
    });
  });

  describe('executeComplexity', () => {
    it('should calculate complexity for simple code', async () => {
      const file = path.join(TEST_DIR, 'test.js');
      await fs.writeFile(
        file,
        `function foo() { return 1; }`,
      );

      const result = await executeComplexity(file);

      expect(result).toContain('Functions: 1');
      expect(result).toContain('Cyclomatic Complexity:');
      expect(result).toContain('Low');
    });

    it('should calculate complexity for branching code', async () => {
      const file = path.join(TEST_DIR, 'test.js');
      await fs.writeFile(
        file,
        `function foo(x) {
          if (x > 0) {
            return 1;
          } else if (x < 0) {
            return -1;
          } else {
            return 0;
          }
        }`,
      );

      const result = await executeComplexity(file);

      expect(result).toContain('Functions: 1');
      expect(result).toContain('Cyclomatic Complexity:');
      expect(result).toContain('Conditional Branches:');
    });

    it('should calculate complexity for loops', async () => {
      const file = path.join(TEST_DIR, 'test.js');
      await fs.writeFile(
        file,
        `function foo() {
          for (let i = 0; i < 10; i++) {
            if (i % 2 === 0) {
              console.log(i);
            }
          }
        }`,
      );

      const result = await executeComplexity(file);

      expect(result).toContain('Functions: 1');
      expect(result).toContain('Cyclomatic Complexity:');
    });
  });

  describe('executeLint', () => {
    it('should find no issues in clean code', async () => {
      const file = path.join(TEST_DIR, 'test.js');
      await fs.writeFile(
        file,
        `const x = 1;\nconsole.log(x);`,
      );

      const result = await executeLint(file, false);

      expect(result).toContain('No issues found');
    });

    it('should find unused variables', async () => {
      const file = path.join(TEST_DIR, 'test.js');
      await fs.writeFile(
        file,
        `const x = 1;\nconst y = 2;\nconsole.log(x);`,
      );

      const result = await executeLint(file, false);

      expect(result).toContain('Warning');
      expect(result).toContain('no-unused-vars');
    });

    it('should handle missing file', async () => {
      const result = await executeLint('nonexistent.js', false);

      expect(result).toContain('Error');
      expect(result).toContain('does not exist');
    });
  });

  describe('executeFindDeps', () => {
    it('should find dependencies in package.json', async () => {
      const pkgJson = {
        name: 'test-project',
        version: '1.0.0',
        dependencies: {
          express: '^4.18.0',
          lodash: '^4.17.0',
        },
        devDependencies: {
          jest: '^29.0.0',
        },
      };

      await fs.writeFile(
        path.join(TEST_DIR, 'package.json'),
        JSON.stringify(pkgJson, null, 2),
      );

      const result = await executeFindDeps(TEST_DIR);

      expect(result).toContain('Project: test-project');
      expect(result).toContain('Version: 1.0.0');
      expect(result).toContain('Dependencies: 2');
      expect(result).toContain('express');
      expect(result).toContain('lodash');
      expect(result).toContain('Dev Dependencies: 1');
      expect(result).toContain('jest');
    });

    it('should handle missing package.json', async () => {
      const result = await executeFindDeps(TEST_DIR);

      expect(result).toContain('Error');
      expect(result).toContain('package.json not found');
    });
  });

  describe('executeCountLines', () => {
    it('should count lines correctly', async () => {
      const file = path.join(TEST_DIR, 'test.js');
      await fs.writeFile(
        file,
        `// Comment 1
const x = 1;

// Comment 2
function foo() {
  return x;
}
`,
      );

      const result = await executeCountLines(file);

      expect(result).toContain('Total Lines:');
      expect(result).toContain('Code Lines:');
      expect(result).toContain('Comment Lines:');
      expect(result).toContain('Blank Lines:');
    });

    it('should handle block comments', async () => {
      const file = path.join(TEST_DIR, 'test.js');
      await fs.writeFile(
        file,
        `/* Block comment
   line 2
   line 3 */
const x = 1;
`,
      );

      const result = await executeCountLines(file);

      expect(result).toContain('Comment Lines: 3');
    });

    it('should handle missing file', async () => {
      const result = await executeCountLines('nonexistent.js');

      expect(result).toContain('Error');
      expect(result).toContain('does not exist');
    });
  });
});
