import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

vi.mock('./config.js', () => ({
  config: {
    model: 'test-model',
    apiKey: 'test-key-integration-12345',
    maxTokens: 8192,
    maxRetries: 3,
    maxTurns: 5,
    temperature: 0.5,
    getSystemPrompt: vi.fn(() => 'You are an integration test agent.'),
  },
}));

const mockStream = vi.fn();

vi.mock('./LLMClient.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('./LLMClient.js')>();
  return { ...mod, createLLMClient: vi.fn(() => ({ stream: mockStream })) };
});

vi.mock('../permission/index.js', () => ({
  checkPermission: vi.fn().mockResolvedValue({ level: 'allow' }),
}));

import type { StreamEvent } from './LLMClient.js';

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
  return (async function* () {
    for (const e of events) yield e;
  })();
}

import { Agent } from './Agent.js';

let testDir: string;

beforeEach(async () => {
  vi.clearAllMocks();
  testDir = path.join(tmpdir(), `codeyang-int-${randomUUID()}`);
  await fs.mkdir(testDir, { recursive: true });
});

afterEach(async () => {
  await fs.rm(testDir, { recursive: true, force: true });
});

describe('Agent Loop Integration', () => {
  describe('full agent loop: text → tool → result → text', () => {
    it('completes a full cycle with a real Bash tool call', async () => {
      const agent = new Agent();

      let callIndex = 0;
      mockStream.mockImplementation(() => {
        callIndex++;
        if (callIndex === 1) {
          return makeStream(
            toolCallStart(0, 'tc_001', 'Bash'),
            toolCallDelta(0, '{"command":"echo integration test"}'),
            toolCallEnd(0, 'tc_001', '{"command":"echo integration test"}'),
          );
        }
        return makeStream(textDelta('Done.'), usageEvent(50, 30));
      });

      const onToolResult = vi.fn();
      agent.setCallbacks({ onToolResult });
      await agent.run('run echo command');

      const bashCalls = onToolResult.mock.calls.filter((c) => c[0] === 'Bash');
      expect(bashCalls.length).toBeGreaterThanOrEqual(1);
      expect(bashCalls[0][1]).toContain('integration');
      expect(agent.getTokenUsage().inputTokens).toBe(50);
    });

    it('completes a cycle with Write + Read tool calls', async () => {
      const agent = new Agent();
      const fp = path.join(testDir, 'created.txt');
      const content = 'Hello from integration test!';

      let ci = 0;
      mockStream.mockImplementation(() => {
        ci++;
        if (ci === 1)
          return makeStream(
            toolCallStart(0, 'tc_001', 'Write'),
            toolCallDelta(0, JSON.stringify({ filePath: fp, content })),
            toolCallEnd(0, 'tc_001', JSON.stringify({ filePath: fp, content })),
          );
        if (ci === 2)
          return makeStream(
            toolCallStart(0, 'tc_002', 'Read'),
            toolCallDelta(0, JSON.stringify({ filePath: fp })),
            toolCallEnd(0, 'tc_002', JSON.stringify({ filePath: fp })),
          );
        return makeStream(textDelta('Done.'));
      });

      const onToolResult = vi.fn();
      agent.setCallbacks({ onToolResult });
      await agent.run('write and read a file');

      expect(existsSync(fp)).toBe(true);
      expect(await fs.readFile(fp, 'utf-8')).toBe(content);
      expect(onToolResult.mock.calls.filter((c) => c[0] === 'Read').length).toBe(1);
    });

    it('completes a cycle with Edit tool call', async () => {
      const agent = new Agent();
      const fp = path.join(testDir, 'edit-target.txt');
      await fs.writeFile(fp, 'const OLD_VALUE = 42;', 'utf-8');

      mockStream.mockImplementation(() =>
        makeStream(
          toolCallStart(0, 'tc_001', 'Edit'),
          toolCallDelta(0, JSON.stringify({ filePath: fp, oldString: 'OLD_VALUE', newString: 'NEW_VALUE' })),
          toolCallEnd(0, 'tc_001', JSON.stringify({ filePath: fp, oldString: 'OLD_VALUE', newString: 'NEW_VALUE' })),
        ),
      );

      await agent.run('rename');
      expect(await fs.readFile(fp, 'utf-8')).toBe('const NEW_VALUE = 42;');
    });

    it('completes a cycle with Glob + Grep tool calls', async () => {
      const agent = new Agent();
      await fs.writeFile(path.join(testDir, 'a.ts'), '// typescript A', 'utf-8');
      await fs.writeFile(path.join(testDir, 'b.ts'), '// typescript B', 'utf-8');
      await fs.writeFile(path.join(testDir, 'c.js'), '// javascript', 'utf-8');

      let ci = 0;
      mockStream.mockImplementation(() => {
        ci++;
        if (ci === 1)
          return makeStream(
            toolCallStart(0, 'tc_001', 'Glob'),
            toolCallDelta(0, JSON.stringify({ pattern: '*.ts', root: testDir })),
            toolCallEnd(0, 'tc_001', JSON.stringify({ pattern: '*.ts', root: testDir })),
          );
        if (ci === 2)
          return makeStream(
            toolCallStart(0, 'tc_002', 'Grep'),
            toolCallDelta(0, JSON.stringify({ pattern: 'typescript', path: testDir, include: '*.ts' })),
            toolCallEnd(0, 'tc_002', JSON.stringify({ pattern: 'typescript', path: testDir, include: '*.ts' })),
          );
        return makeStream(textDelta('Done.'));
      });

      const onToolResult = vi.fn();
      agent.setCallbacks({ onToolResult });
      await agent.run('find TS files');

      const globR = onToolResult.mock.calls.filter((c) => c[0] === 'Glob');
      const grepR = onToolResult.mock.calls.filter((c) => c[0] === 'Grep');
      expect(globR.length).toBe(1);
      expect(grepR.length).toBe(1);
      expect(globR[0][1]).toContain('a.ts');
      expect(globR[0][1]).not.toContain('c.js');
    });
  });

  describe('parallel tool calls', () => {
    it('executes multiple tools in one turn', async () => {
      const agent = new Agent();
      const f1 = path.join(testDir, 'p1.txt');
      const f2 = path.join(testDir, 'p2.txt');

      mockStream.mockImplementation(() =>
        makeStream(
          toolCallStart(0, 'tc_001', 'Write'),
          toolCallDelta(0, JSON.stringify({ filePath: f1, content: 'd1' })),
          toolCallEnd(0, 'tc_001', JSON.stringify({ filePath: f1, content: 'd1' })),
          toolCallStart(1, 'tc_002', 'Write'),
          toolCallDelta(1, JSON.stringify({ filePath: f2, content: 'd2' })),
          toolCallEnd(1, 'tc_002', JSON.stringify({ filePath: f2, content: 'd2' })),
          textDelta('Done.'),
        ),
      );

      await agent.run('create two files');
      expect(existsSync(f1)).toBe(true);
      expect(existsSync(f2)).toBe(true);
    });

    it('handles mixed success and error in parallel batch', async () => {
      const agent = new Agent();
      const okFile = path.join(testDir, 'ok.txt');

      mockStream.mockImplementation(() =>
        makeStream(
          toolCallStart(0, 'tc_001', 'Write'),
          toolCallDelta(0, JSON.stringify({ filePath: okFile, content: 'ok' })),
          toolCallEnd(0, 'tc_001', JSON.stringify({ filePath: okFile, content: 'ok' })),
          toolCallStart(1, 'tc_002', 'Read'),
          toolCallDelta(1, JSON.stringify({ filePath: path.join(testDir, 'nope.txt') })),
          toolCallEnd(1, 'tc_002', JSON.stringify({ filePath: path.join(testDir, 'nope.txt') })),
          textDelta('Done.'),
        ),
      );

      const onToolResult = vi.fn();
      agent.setCallbacks({ onToolResult });
      await agent.run('write and read');
      expect(existsSync(okFile)).toBe(true);
      expect(onToolResult.mock.calls.filter((c) => c[2] === true).length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('max turns enforcement', () => {
    it('stops after reaching max turns', async () => {
      const agent = new Agent();
      let turn = 0;
      mockStream.mockImplementation(() => {
        turn++;
        return makeStream(
          toolCallStart(0, `tc_${turn}`, 'Bash'),
          toolCallDelta(0, `{"command":"echo t${turn}"}`),
          toolCallEnd(0, `tc_${turn}`, `{"command":"echo t${turn}"}`),
        );
      });
      await agent.run('loop');
      expect(turn).toBeGreaterThanOrEqual(1);
      expect(turn).toBeLessThanOrEqual(5);
    }, 30000);
  });

  describe('tool error handling', () => {
    it('gracefully handles tool returning an error result', async () => {
      const agent = new Agent();
      mockStream.mockImplementation(() =>
        makeStream(
          toolCallStart(0, 'tc_001', 'Read'),
          toolCallDelta(0, JSON.stringify({ filePath: path.join(testDir, 'no.txt') })),
          toolCallEnd(0, 'tc_001', JSON.stringify({ filePath: path.join(testDir, 'no.txt') })),
        ),
      );
      const onToolResult = vi.fn();
      agent.setCallbacks({ onToolResult });
      await agent.run('read missing');
      expect(onToolResult.mock.calls.filter((c) => c[2] === true).length).toBeGreaterThanOrEqual(1);
    });

    it('handles unknown tool gracefully', async () => {
      const agent = new Agent();
      mockStream.mockImplementation(() =>
        makeStream(
          toolCallStart(0, 'tc_001', 'NonExistentTool'),
          toolCallDelta(0, '{"arg":"v"}'),
          toolCallEnd(0, 'tc_001', '{"arg":"v"}'),
        ),
      );
      await agent.run('use unknown');
    });
  });

  describe('session persistence', () => {
    it('preserves conversation history with tool calls', async () => {
      const agent = new Agent();
      mockStream.mockImplementation(() =>
        makeStream(
          toolCallStart(0, 'tc_001', 'Bash'),
          toolCallDelta(0, '{"command":"echo persisted"}'),
          toolCallEnd(0, 'tc_001', '{"command":"echo persisted"}'),
        ),
      );
      await agent.run('run command');
      const exported = agent.exportMessages();
      expect(exported.length).toBeGreaterThanOrEqual(2);

      const agent2 = new Agent();
      agent2.loadMessages(exported);
      expect(agent2.exportMessages().length).toBe(exported.length);
    });

    it('preserves tool results in exported messages', async () => {
      const agent = new Agent();
      const fp = path.join(testDir, 'exp.txt');
      await fs.writeFile(fp, 'export content', 'utf-8');
      mockStream.mockImplementation(() =>
        makeStream(
          toolCallStart(0, 'tc_001', 'Read'),
          toolCallDelta(0, JSON.stringify({ filePath: fp })),
          toolCallEnd(0, 'tc_001', JSON.stringify({ filePath: fp })),
        ),
      );
      await agent.run('read');
      const exported = agent.exportMessages();
      const rm = exported.filter((m) => m.toolResults);
      expect(rm.length).toBeGreaterThanOrEqual(1);
      expect(rm[0].toolResults![0].output).toContain('export content');
    });
  });

  describe('checkpoint / restore', () => {
    it('saves and restores conversation state', async () => {
      const agent = new Agent();
      expect(agent.saveCheckpoint()).toBe(0);
      mockStream.mockReturnValue(makeStream(textDelta('Hi')));
      await agent.run('msg');
      expect(agent.exportMessages().length).toBeGreaterThanOrEqual(2);
      expect(agent.restoreCheckpoint()).toBe(true);
      expect(agent.exportMessages().length).toBe(0);
    });

    it('restoreCheckpoint returns false when no checkpoints', () => {
      expect(new Agent().restoreCheckpoint()).toBe(false);
    });
  });

  describe('token usage tracking', () => {
    it('accumulates tokens across multiple runs', async () => {
      const agent = new Agent();
      mockStream.mockReturnValue(makeStream(textDelta('R1'), usageEvent(10, 20)));
      await agent.run('p1');
      mockStream.mockReturnValue(makeStream(textDelta('R2'), usageEvent(15, 25)));
      await agent.run('p2');
      expect(agent.getTokenUsage()).toEqual({ inputTokens: 25, outputTokens: 45 });
    });

    it('resets token usage on agent.reset()', async () => {
      const agent = new Agent();
      mockStream.mockReturnValue(makeStream(textDelta('R'), usageEvent(10, 20)));
      await agent.run('p');
      agent.reset();
      expect(agent.getTokenUsage()).toEqual({ inputTokens: 0, outputTokens: 0 });
    });
  });

  describe('tool statistics tracking', () => {
    it('tracks per-tool call counts', async () => {
      const agent = new Agent();
      let ci = 0;
      mockStream.mockImplementation(() => {
        ci++;
        if (ci === 1)
          return makeStream(
            toolCallStart(0, 'tc_001', 'Bash'),
            toolCallDelta(0, '{"command":"echo s1"}'),
            toolCallEnd(0, 'tc_001', '{"command":"echo s1"}'),
          );
        return makeStream(textDelta('Done.'));
      });
      await agent.run('run bash');
      expect(agent.getToolStats().get('Bash')?.calls).toBe(1);
    });
  });

  describe('agent reset', () => {
    it('clears all state on reset', async () => {
      const agent = new Agent();
      mockStream.mockReturnValue(
        makeStream(
          textDelta('Hello'),
          toolCallStart(0, 'tc_001', 'Bash'),
          toolCallDelta(0, '{"command":"echo hi"}'),
          toolCallEnd(0, 'tc_001', '{"command":"echo hi"}'),
        ),
      );
      await agent.run('hello');
      agent.reset();
      expect(agent.exportMessages()).toHaveLength(0);
      expect(agent.getTokenUsage()).toEqual({ inputTokens: 0, outputTokens: 0 });
      expect(agent.getToolStats().size).toBe(0);
    });
  });

  describe('callbacks', () => {
    it('fires onToolBatch and onToolStart with correct counts', async () => {
      const agent = new Agent();
      let ci = 0;
      mockStream.mockImplementation(() => {
        ci++;
        if (ci === 1)
          return makeStream(
            toolCallStart(0, 'tc_001', 'Bash'),
            toolCallDelta(0, '{"command":"echo 1"}'),
            toolCallEnd(0, 'tc_001', '{"command":"echo 1"}'),
            toolCallStart(1, 'tc_002', 'Write'),
            toolCallDelta(1, JSON.stringify({ filePath: path.join(testDir, 'cb.txt'), content: 'cb' })),
            toolCallEnd(1, 'tc_002', JSON.stringify({ filePath: path.join(testDir, 'cb.txt'), content: 'cb' })),
          );
        return makeStream(textDelta('Done.'));
      });
      const onToolBatch = vi.fn();
      const onToolStart = vi.fn();
      agent.setCallbacks({ onToolBatch, onToolStart });
      await agent.run('run two');
      expect(onToolBatch).toHaveBeenCalledWith(2);
      expect(onToolStart).toHaveBeenCalledTimes(2);
    });

    it('fires onAgentDelta for streaming text', async () => {
      const agent = new Agent();
      mockStream.mockReturnValue(makeStream(textDelta('Part 1 '), textDelta('Part 2')));
      const onAgentDelta = vi.fn();
      agent.setCallbacks({ onAgentDelta });
      await agent.run('stream');
      expect(onAgentDelta).toHaveBeenCalledTimes(2);
    });
  });

  describe('realistic coding workflow', () => {
    it('handles write → read → edit → glob → bash', async () => {
      const agent = new Agent();
      const fp = path.join(testDir, 'workflow.ts');
      const content = 'export function add(a: number, b: number): number {\n  return a + b;\n}\n';

      let turn = 0;
      mockStream.mockImplementation(() => {
        turn++;
        switch (turn) {
          case 1:
            return makeStream(
              toolCallStart(0, 'tc_w1', 'Write'),
              toolCallDelta(0, JSON.stringify({ filePath: fp, content })),
              toolCallEnd(0, 'tc_w1', JSON.stringify({ filePath: fp, content })),
            );
          case 2:
            return makeStream(
              toolCallStart(0, 'tc_r1', 'Read'),
              toolCallDelta(0, JSON.stringify({ filePath: fp })),
              toolCallEnd(0, 'tc_r1', JSON.stringify({ filePath: fp })),
            );
          case 3:
            return makeStream(
              toolCallStart(0, 'tc_e1', 'Edit'),
              toolCallDelta(0, JSON.stringify({ filePath: fp, oldString: 'add', newString: 'sum', replaceAll: true })),
              toolCallEnd(
                0,
                'tc_e1',
                JSON.stringify({ filePath: fp, oldString: 'add', newString: 'sum', replaceAll: true }),
              ),
            );
          case 4:
            return makeStream(
              toolCallStart(0, 'tc_g1', 'Glob'),
              toolCallDelta(0, JSON.stringify({ pattern: '*.ts', root: testDir })),
              toolCallEnd(0, 'tc_g1', JSON.stringify({ pattern: '*.ts', root: testDir })),
            );
          case 5: {
            const isWin = process.platform === 'win32';
            return makeStream(
              toolCallStart(0, 'tc_b1', 'Bash'),
              toolCallDelta(0, JSON.stringify({ command: isWin ? `cmd /c type "${fp}"` : `cat "${fp}"` })),
              toolCallEnd(0, 'tc_b1', JSON.stringify({ command: isWin ? `cmd /c type "${fp}"` : `cat "${fp}"` })),
              textDelta('Workflow complete.'),
              usageEvent(200, 100),
            );
          }
          default:
            return makeStream(textDelta('Done.'));
        }
      });

      await agent.run('create TS file and refactor');

      expect(existsSync(fp)).toBe(true);
      const fc = await fs.readFile(fp, 'utf-8');
      expect(fc).toContain('sum');
      expect(fc).not.toContain('add');

      const stats = agent.getToolStats();
      expect(stats.get('Write')?.calls).toBe(1);
      expect(stats.get('Read')?.calls).toBe(1);
      expect(stats.get('Edit')?.calls).toBe(1);
      expect(stats.get('Glob')?.calls).toBe(1);
      expect(stats.get('Bash')?.calls).toBe(1);

      expect(agent.getTokenUsage().inputTokens).toBe(200);
      expect(agent.getTokenUsage().outputTokens).toBe(100);
    });
  });
});
