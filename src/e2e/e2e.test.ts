/**
 * End-to-End Tests for CodeYang
 *
 * Tests real-world workflows: multi-turn agent loops with real tool execution.
 * Uses mocked LLM stream (same pattern as Agent-integration tests) so no API key required.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

vi.mock('../agent/config.js', () => ({
  config: {
    model: 'test-model',
    apiKey: 'test-e2e-key',
    maxTokens: 8192,
    maxRetries: 3,
    maxTurns: 10,
    temperature: 0.5,
    autoVerify: true,
    autoFixOnError: true,
    watchMode: true,
    reflexion: { enabled: true, failureThreshold: 2, maxReflections: 50, autoInject: true },
    planner: { enabled: true, autoDetect: true, complexityThreshold: 3, requireApproval: true, maxRetries: 2 },
    getSystemPrompt: vi.fn(() => 'You are an E2E test agent.'),
  },
}));

const mockStream = vi.fn();
vi.mock('../agent/LLMClient.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../agent/LLMClient.js')>();
  return { ...mod, createLLMClient: vi.fn(() => ({ stream: mockStream })) };
});

vi.mock('../permission/index.js', () => ({
  checkPermission: vi.fn().mockResolvedValue({ level: 'allow' }),
}));

vi.mock('../gateway/index.js', () => {
  const mockGateway = {
    createRequest: vi.fn((opts: Record<string, unknown>) => ({ ...opts, source: 'internal' })),
    handle: vi.fn().mockResolvedValue({ success: true, data: null }),
    getAuditLogger: vi.fn(() => ({ log: vi.fn(), getEntries: vi.fn(() => []), clear: vi.fn() })),
    getCircuitBreaker: vi.fn(() => ({ isOpen: vi.fn(() => false), recordSuccess: vi.fn(), recordFailure: vi.fn() })),
  };
  return { Gateway: { getInstance: vi.fn(() => mockGateway) } };
});

import type { StreamEvent } from '../agent/LLMClient.js';
import { Agent } from '../agent/Agent.js';

function textDelta(text: string): StreamEvent {
  return { type: 'text_delta', text };
}
function toolCallStart(index: number, id: string, name: string): StreamEvent {
  return { type: 'tool_call_start', toolCallIndex: index, toolCallId: id, toolCallName: name };
}
function toolCallDelta(index: number, args: string): StreamEvent {
  return { type: 'tool_call_delta', toolCallIndex: index, toolCallArgs: args };
}
function toolCallEnd(index: number, id: string, args: string): StreamEvent {
  return { type: 'tool_call_end', toolCallIndex: index, toolCallId: id, toolCallArgs: args };
}
function usageEvent(inputTokens: number, outputTokens: number): StreamEvent {
  return { type: 'usage', inputTokens, outputTokens };
}

function makeStream(...events: StreamEvent[]): AsyncIterable<StreamEvent> {
  return (function* () {
    for (const e of events) yield e;
  })();
}

let testDir: string;

beforeAll(async () => {
  testDir = path.join(tmpdir(), `codeyang-e2e-${randomUUID()}`);
  await fs.mkdir(testDir, { recursive: true });
});

afterAll(async () => {
  await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
});

describe('E2E: Multi-turn File Workflow', () => {
  it('should create, read, and edit a file across multiple turns', async () => {
    const agent = new Agent();
    let turn = 0;

    // Turn 1: Write file
    // Turn 2: Read file
    // Turn 3: Edit file
    // Turn 4: Final text response
    mockStream.mockImplementation(() => {
      turn++;
      switch (turn) {
        case 1:
          return makeStream(
            toolCallStart(0, 'tc_w1', 'Write'),
            toolCallDelta(0, JSON.stringify({ filePath: path.join(testDir, 'hello.txt'), content: 'Hello World' })),
            toolCallEnd(
              0,
              'tc_w1',
              JSON.stringify({ filePath: path.join(testDir, 'hello.txt'), content: 'Hello World' }),
            ),
          );
        case 2:
          return makeStream(
            toolCallStart(0, 'tc_r1', 'Read'),
            toolCallDelta(0, JSON.stringify({ filePath: path.join(testDir, 'hello.txt') })),
            toolCallEnd(0, 'tc_r1', JSON.stringify({ filePath: path.join(testDir, 'hello.txt') })),
          );
        case 3:
          return makeStream(
            toolCallStart(0, 'tc_e1', 'Edit'),
            toolCallDelta(
              0,
              JSON.stringify({ filePath: path.join(testDir, 'hello.txt'), oldString: 'World', newString: 'CodeYang' }),
            ),
            toolCallEnd(
              0,
              'tc_e1',
              JSON.stringify({ filePath: path.join(testDir, 'hello.txt'), oldString: 'World', newString: 'CodeYang' }),
            ),
            textDelta('All done.'),
            usageEvent(100, 50),
          );
        default:
          return makeStream(textDelta('Done.'));
      }
    });

    const onToolResult = vi.fn();
    agent.setCallbacks({ onToolResult });
    await agent.run('create, read, and edit hello.txt');

    // Verify file operations
    expect(existsSync(path.join(testDir, 'hello.txt'))).toBe(true);
    const content = await fs.readFile(path.join(testDir, 'hello.txt'), 'utf-8');
    expect(content).toBe('Hello CodeYang');

    // Verify tool calls were made
    expect(onToolResult.mock.calls.filter((c) => c[0] === 'Write').length).toBe(1);
    expect(onToolResult.mock.calls.filter((c) => c[0] === 'Read').length).toBe(1);
    expect(onToolResult.mock.calls.filter((c) => c[0] === 'Edit').length).toBe(1);
    expect(agent.getTokenUsage().inputTokens).toBe(100);
  }, 30000);

  it('should search across multiple files', async () => {
    const agent = new Agent();
    const f1 = path.join(testDir, 'file1.txt');
    const f2 = path.join(testDir, 'file2.txt');
    const f3 = path.join(testDir, 'file3.txt');
    await fs.writeFile(f1, 'TODO: Implement feature A');
    await fs.writeFile(f2, 'Regular content');
    await fs.writeFile(f3, 'TODO: Fix bug B');

    mockStream.mockImplementation(() =>
      makeStream(
        toolCallStart(0, 'tc_s1', 'Grep'),
        toolCallDelta(0, JSON.stringify({ pattern: 'TODO', path: testDir })),
        toolCallEnd(0, 'tc_s1', JSON.stringify({ pattern: 'TODO', path: testDir })),
        textDelta('Search results:'),
        usageEvent(30, 20),
      ),
    );

    const onToolResult = vi.fn();
    agent.setCallbacks({ onToolResult });
    await agent.run('find TODOs');

    const grepCalls = onToolResult.mock.calls.filter((c) => c[0] === 'Grep');
    expect(grepCalls.length).toBeGreaterThanOrEqual(1);
    expect(grepCalls[0][1]).toContain('TODO');
  }, 30000);
});

describe('E2E: Git Workflow', () => {
  let gitDir: string;

  beforeAll(async () => {
    gitDir = path.join(tmpdir(), `codeyang-e2e-git-${randomUUID()}`);
    await fs.mkdir(gitDir, { recursive: true });
    const { execa } = await import('execa');
    await execa('git', ['init'], { cwd: gitDir });
    await execa('git', ['config', 'user.name', 'Test User'], { cwd: gitDir });
    await execa('git', ['config', 'user.email', 'test@example.com'], { cwd: gitDir });

    // Create initial commit so we have a baseline
    await fs.writeFile(path.join(gitDir, 'README.md'), '# Test');
    await execa('git', ['add', '-A'], { cwd: gitDir });
    await execa('git', ['commit', '-m', 'Initial commit'], { cwd: gitDir });
  });

  afterAll(async () => {
    await fs.rm(gitDir, { recursive: true, force: true }).catch(() => {});
  });

  it('should create branch, make changes, and verify commit', async () => {
    const agent = new Agent();
    let turn = 0;

    mockStream.mockImplementation(() => {
      turn++;
      switch (turn) {
        case 1:
          return makeStream(
            toolCallStart(0, 'tc_b1', 'GitCheckout'),
            toolCallDelta(0, JSON.stringify({ branch: 'feature-test', create: true, cwd: gitDir })),
            toolCallEnd(0, 'tc_b1', JSON.stringify({ branch: 'feature-test', create: true, cwd: gitDir })),
          );
        case 2:
          return makeStream(
            toolCallStart(0, 'tc_w1', 'Write'),
            toolCallDelta(0, JSON.stringify({ filePath: path.join(gitDir, 'feature.txt'), content: 'Test Feature' })),
            toolCallEnd(
              0,
              'tc_w1',
              JSON.stringify({ filePath: path.join(gitDir, 'feature.txt'), content: 'Test Feature' }),
            ),
          );
        case 3:
          return makeStream(
            toolCallStart(0, 'tc_a1', 'GitAdd'),
            toolCallDelta(0, JSON.stringify({ files: ['feature.txt'], cwd: gitDir })),
            toolCallEnd(0, 'tc_a1', JSON.stringify({ files: ['feature.txt'], cwd: gitDir })),
          );
        case 4:
          return makeStream(
            toolCallStart(0, 'tc_c1', 'GitCommit'),
            toolCallDelta(0, JSON.stringify({ message: 'Add feature.txt', cwd: gitDir })),
            toolCallEnd(0, 'tc_c1', JSON.stringify({ message: 'Add feature.txt', cwd: gitDir })),
            textDelta('Done.'),
            usageEvent(80, 40),
          );
        default:
          return makeStream(textDelta('Done.'));
      }
    });

    const onToolResult = vi.fn();
    agent.setCallbacks({ onToolResult });
    await agent.run('create feature branch with a new file');

    const branchCalls = onToolResult.mock.calls.filter((c) => c[0] === 'GitCheckout');
    expect(branchCalls.length).toBe(1);
    expect(branchCalls[0][1]).toContain('feature-test');

    expect(existsSync(path.join(gitDir, 'feature.txt'))).toBe(true);

    // Verify git log shows the commit
    const { execa } = await import('execa');
    const log = await execa('git', ['log', '--oneline'], { cwd: gitDir });
    expect(log.stdout).toContain('Add feature.txt');
  }, 30000);
});

describe('E2E: Error Recovery', () => {
  it('should handle file not found gracefully', async () => {
    const agent = new Agent();

    mockStream.mockImplementation(() =>
      makeStream(
        toolCallStart(0, 'tc_r1', 'Read'),
        toolCallDelta(0, JSON.stringify({ filePath: path.join(testDir, 'nonexistent.txt') })),
        toolCallEnd(0, 'tc_r1', JSON.stringify({ filePath: path.join(testDir, 'nonexistent.txt') })),
        textDelta('File was not found.'),
        usageEvent(10, 15),
      ),
    );

    const onToolResult = vi.fn();
    agent.setCallbacks({ onToolResult });
    await agent.run('read missing file');

    const readCalls = onToolResult.mock.calls.filter((c) => c[0] === 'Read');
    expect(readCalls.length).toBeGreaterThanOrEqual(1);
    // Read tool should return an error for nonexistent file
    const hasError = readCalls.some((c) => c[2] === true);
    expect(hasError).toBe(true);
  });

  it('should recover from a failed operation and continue', async () => {
    const agent = new Agent();
    let turn = 0;

    mockStream.mockImplementation(() => {
      turn++;
      if (turn === 1) {
        // Delete a non-existent file (will fail)
        return makeStream(
          toolCallStart(0, 'tc_d1', 'Delete'),
          toolCallDelta(0, JSON.stringify({ path: path.join(testDir, 'missing.txt') })),
          toolCallEnd(0, 'tc_d1', JSON.stringify({ path: path.join(testDir, 'missing.txt') })),
        );
      }
      // Then create it (succeeds)
      return makeStream(
        toolCallStart(0, 'tc_c1', 'Write'),
        toolCallDelta(0, JSON.stringify({ filePath: path.join(testDir, 'missing.txt'), content: 'Now it exists' })),
        toolCallEnd(
          0,
          'tc_c1',
          JSON.stringify({ filePath: path.join(testDir, 'missing.txt'), content: 'Now it exists' }),
        ),
        textDelta('Recovered.'),
        usageEvent(20, 25),
      );
    });

    await agent.run('delete then create');
    expect(existsSync(path.join(testDir, 'missing.txt'))).toBe(true);
    const content = await fs.readFile(path.join(testDir, 'missing.txt'), 'utf-8');
    expect(content).toBe('Now it exists');
  }, 30000);
});
