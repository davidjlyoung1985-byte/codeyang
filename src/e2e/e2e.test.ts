/**
 * End-to-End Tests for CodeYang
 *
 * Tests real-world workflows from user input to tool execution.
 * These tests verify the complete agent loop, not just individual tools.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Agent } from '../agent/Agent.js';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

describe('E2E: Basic File Operations', () => {
  let agent: Agent;
  let testDir: string;

  beforeAll(async () => {
    testDir = join(tmpdir(), `codeyang-e2e-${randomUUID()}`);
    await mkdir(testDir, { recursive: true });
    process.chdir(testDir);

    agent = new Agent({
      workingDirectory: testDir,
      provider: 'mock', // Use mock LLM for testing
    });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('should create, read, and edit a file', async () => {
    // User: "Create a file called hello.txt with content 'Hello World'"
    await agent.chat('Create a file called hello.txt with content Hello World');

    // Verify file was created
    const readResult = await agent.chat('Read hello.txt');
    expect(readResult).toContain('Hello World');

    // User: "Change 'World' to 'CodeYang' in hello.txt"
    await agent.chat('Change World to CodeYang in hello.txt');

    // Verify edit was made
    const editedResult = await agent.chat('Read hello.txt');
    expect(editedResult).toContain('Hello CodeYang');
    expect(editedResult).not.toContain('Hello World');
  }, 30000);

  it('should search across multiple files', async () => {
    // Setup: Create multiple files
    await writeFile(join(testDir, 'file1.txt'), 'TODO: Implement feature A');
    await writeFile(join(testDir, 'file2.txt'), 'Regular content');
    await writeFile(join(testDir, 'file3.txt'), 'TODO: Fix bug B');

    // User: "Find all TODO comments"
    const result = await agent.chat('Find all TODO comments in the current directory');

    expect(result).toContain('file1.txt');
    expect(result).toContain('feature A');
    expect(result).toContain('file3.txt');
    expect(result).toContain('bug B');
    expect(result).not.toContain('file2.txt');
  }, 30000);
});

describe('E2E: Git Workflow', () => {
  let agent: Agent;
  let testDir: string;

  beforeAll(async () => {
    testDir = join(tmpdir(), `codeyang-e2e-git-${randomUUID()}`);
    await mkdir(testDir, { recursive: true });
    process.chdir(testDir);

    // Initialize git repo
    const { execa } = await import('execa');
    await execa('git', ['init'], { cwd: testDir });
    await execa('git', ['config', 'user.name', 'Test User'], { cwd: testDir });
    await execa('git', ['config', 'user.email', 'test@example.com'], { cwd: testDir });

    agent = new Agent({
      workingDirectory: testDir,
      provider: 'mock',
    });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('should create branch, make changes, and commit', async () => {
    // Initial commit
    await writeFile(join(testDir, 'README.md'), '# Test Project');
    await agent.chat('Stage all files and commit with message "Initial commit"');

    // User: "Create a new branch called feature-test"
    await agent.chat('Create a new branch called feature-test');

    // User: "Add a new file called feature.txt with content Test Feature"
    await agent.chat('Add a new file called feature.txt with content Test Feature');

    // User: "Commit this change"
    await agent.chat('Commit with message "Add feature.txt"');

    // Verify commit was made
    const logResult = await agent.chat('Show git log');
    expect(logResult).toContain('Add feature.txt');
    expect(logResult).toContain('Initial commit');
  }, 30000);
});

describe('E2E: Code Analysis', () => {
  let agent: Agent;
  let testDir: string;

  beforeAll(async () => {
    testDir = join(tmpdir(), `codeyang-e2e-analysis-${randomUUID()}`);
    await mkdir(testDir, { recursive: true });
    process.chdir(testDir);

    agent = new Agent({
      workingDirectory: testDir,
      provider: 'mock',
    });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('should analyze TypeScript code', async () => {
    // Create a TypeScript file with issues
    const codeWithIssues = `
function complexFunction(a, b, c, d, e) {
  if (a > 0) {
    if (b > 0) {
      if (c > 0) {
        if (d > 0) {
          if (e > 0) {
            return a + b + c + d + e;
          }
        }
      }
    }
  }
  return 0;
}

const unused = 42;
console.log("test");
`;

    await writeFile(join(testDir, 'code.ts'), codeWithIssues);

    // User: "Analyze code.ts for quality issues"
    const result = await agent.chat('Analyze code.ts for quality issues');

    // Should detect high complexity
    expect(result.toLowerCase()).toMatch(/complex|nested/);
  }, 30000);
});

describe('E2E: Multi-step Tasks', () => {
  let agent: Agent;
  let testDir: string;

  beforeAll(async () => {
    testDir = join(tmpdir(), `codeyang-e2e-multistep-${randomUUID()}`);
    await mkdir(testDir, { recursive: true });
    process.chdir(testDir);

    agent = new Agent({
      workingDirectory: testDir,
      provider: 'mock',
    });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('should complete complex multi-step task', async () => {
    // User: "Create a TypeScript project with index.ts, package.json, and tsconfig.json"
    const result = await agent.chat(`
      Create a TypeScript project with:
      1. index.ts with a simple hello world function
      2. package.json with name "test-project"
      3. tsconfig.json with strict mode
    `);

    // Verify all files were created
    const files = await agent.chat('List all files in current directory');
    expect(files).toContain('index.ts');
    expect(files).toContain('package.json');
    expect(files).toContain('tsconfig.json');

    // Verify content is correct
    const packageJson = await agent.chat('Read package.json');
    expect(packageJson).toContain('test-project');

    const tsconfig = await agent.chat('Read tsconfig.json');
    expect(tsconfig).toContain('strict');
  }, 60000);
});

describe('E2E: Error Handling', () => {
  let agent: Agent;
  let testDir: string;

  beforeAll(async () => {
    testDir = join(tmpdir(), `codeyang-e2e-errors-${randomUUID()}`);
    await mkdir(testDir, { recursive: true });
    process.chdir(testDir);

    agent = new Agent({
      workingDirectory: testDir,
      provider: 'mock',
    });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('should handle file not found gracefully', async () => {
    // User: "Read nonexistent.txt"
    const result = await agent.chat('Read nonexistent.txt');

    expect(result.toLowerCase()).toMatch(/not found|does not exist/);
  });

  it('should recover from failed operations', async () => {
    // User: "Delete a file that doesn't exist, then create it"
    const result = await agent.chat(`
      Try to delete missing.txt (it might not exist).
      Then create missing.txt with content "Now it exists".
    `);

    // Should succeed despite initial failure
    const readResult = await agent.chat('Read missing.txt');
    expect(readResult).toContain('Now it exists');
  }, 30000);
});

describe('E2E: Permission System', () => {
  let agent: Agent;
  let testDir: string;

  beforeAll(async () => {
    testDir = join(tmpdir(), `codeyang-e2e-perms-${randomUUID()}`);
    await mkdir(testDir, { recursive: true });
    process.chdir(testDir);

    agent = new Agent({
      workingDirectory: testDir,
      provider: 'mock',
      permissionLevel: 'ask', // Require confirmation
    });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('should request permission for dangerous operations', async () => {
    // User: "Delete all files"
    // Should ask for confirmation before proceeding
    const result = await agent.chat('Delete all files');

    // In test mode, permission is denied by default
    expect(result.toLowerCase()).toMatch(/permission|confirm|denied/);
  });
});
