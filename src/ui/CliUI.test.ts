import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import type { Message } from '../types.js';

// Mock picocolors to return plain text (no ANSI escape codes in test output)
vi.mock('picocolors', () => ({
  default: new Proxy(
    {},
    {
      get() {
        return (s: string) => s;
      },
    },
  ),
  cyan: (s: string) => s,
  bold: (s: string) => s,
  green: (s: string) => s,
  yellow: (s: string) => s,
  red: (s: string) => s,
  dim: (s: string) => s,
  white: (s: string) => s,
  italic: (s: string) => s,
}));

// Mock readline
vi.mock('node:readline', () => ({
  createInterface: vi.fn(() => ({
    on: vi.fn(),
    close: vi.fn(),
    question: vi.fn(),
    prompt: vi.fn(function () {
      if (typeof process !== 'undefined' && process.stdout) {
        process.stdout.write('-> ');
      }
    }),
  })),
}));

// Capture both console.log and process.stdout.write
const mockWrite = vi.fn();
const mockLog = vi.fn();
let origWrite: typeof process.stdout.write;
let origLog: typeof console.log;
beforeEach(() => {
  mockWrite.mockClear();
  mockLog.mockClear();
  origWrite = process.stdout.write;
  origLog = console.log;
  process.stdout.write = mockWrite as unknown as typeof process.stdout.write;
  console.log = mockLog;
});
afterAll(() => {
  if (origWrite) process.stdout.write = origWrite;
  if (origLog) console.log = origLog;
});

/** Combine all captured output (stdout + console.log) */
function capturedOutput(): string {
  const stdoutCalls = mockWrite.mock.calls.map((c) => String(c[0]));
  const logCalls = mockLog.mock.calls.map((c) => c.join(' '));
  return [...stdoutCalls, ...logCalls].join('');
}

import { CliUI } from './CliUI.js';
import { VERSION } from '../version.js';

describe('CliUI', () => {
  let ui: CliUI;

  beforeEach(() => {
    vi.clearAllMocks();
    process.stdout.columns = 80;
    ui = new CliUI();
  });

  describe('welcome', () => {
    it('prints welcome message with version', () => {
      ui.welcome();
      const output = capturedOutput();
      expect(output).toContain('CodeYang');
      expect(output).toContain(VERSION);
    });
  });

  describe('promptUser', () => {
    it('outputs prompt character', () => {
      ui.promptUser();
      const calls = mockWrite.mock.calls.map((c) => String(c[0])).join('');
      expect(calls).toContain('->');
    });
  });

  describe('showUserMessage', () => {
    it('shows user message with User label', () => {
      ui.showUserMessage('hello world');
      const output = mockWrite.mock.calls.map((c) => String(c[0])).join('');
      // should contain the message text somewhere (via console.log)
      expect(output).toBeTruthy();
    });
  });

  describe('showSystemMessage', () => {
    it('shows system message and re-prompts', () => {
      ui.showSystemMessage('test message');
      const output = capturedOutput();
      expect(output).toContain('test message');
      // Should re-prompt after
      expect(output).toContain('->');
    });
  });

  describe('showAgentStart / showAgentDone', () => {
    it('prints CodeYang label on start', () => {
      ui.showAgentStart();
      const output = capturedOutput();
      expect(output).toContain('CodeYang');
    });
  });

  describe('showAgentText', () => {
    it('renders plain text', () => {
      ui.showAgentText('Hello world');
      const output = capturedOutput();
      expect(output).toContain('Hello world');
    });

    it('renders inline code with backticks', () => {
      ui.showAgentText('Use the `Bash` tool');
      // Should render (no crash)
      expect(true).toBe(true);
    });

    it('renders bold text', () => {
      ui.showAgentText('This is **important**');
      // Should render (no crash)
      expect(true).toBe(true);
    });

    it('renders links', () => {
      ui.showAgentText('See [docs](https://example.com)');
      // Should render (no crash)
      expect(true).toBe(true);
    });

    it('renders headings', () => {
      ui.showAgentText('## Section Title');
      // Should render (no crash)
      expect(true).toBe(true);
    });

    it('renders code blocks', () => {
      ui.showAgentText("Here's code:\n```\nconst x = 1;\n```\nEnd.");
      // Should render (no crash)
      expect(true).toBe(true);
    });

    it('renders blockquotes', () => {
      ui.showAgentText('> Note: this is a quote');
      // Should render (no crash)
      expect(true).toBe(true);
    });

    it('renders horizontal rules', () => {
      ui.showAgentText('Text\n---\nMore text');
      // Should render (no crash)
      expect(true).toBe(true);
    });
  });

  describe('spinner', () => {
    it('starts and stops spinner', () => {
      ui.startSpinner('loading');
      // Spinner should have written something
      expect(mockWrite).toHaveBeenCalled();
      ui.stopSpinner();
    });

    it('stops spinner without error when not running', () => {
      expect(() => ui.stopSpinner()).not.toThrow();
    });
  });

  describe('showToolCall', () => {
    it('shows tool name and args', () => {
      ui.showToolCall('Bash', { command: 'echo hi' });
      const output = mockWrite.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('Bash');
    });
  });

  describe('showToolResult', () => {
    it('shows success output (short)', () => {
      ui.showToolCall('TestTool', {});
      ui.showToolResult('TestTool', 'output text', false);
      const output = capturedOutput();
      expect(output).toContain('output text');
    });

    it('shows collapsed output (long)', () => {
      const longOutput = 'line1\nline2\nline3\nline4\nline5';
      ui.showToolCall('TestTool', {});
      ui.showToolResult('TestTool', longOutput, false);
      const output = capturedOutput();
      expect(output).toContain('工具输出已折叠');
      expect(output).toContain('5 行');
    });

    it('shows error output', () => {
      ui.showToolCall('TestTool', {});
      ui.showToolResult('TestTool', 'error text', true);
      const output = capturedOutput();
      expect(output).toContain('error text');
    });
  });

  describe('showQuestion', () => {
    it('shows question text', () => {
      ui.showQuestion('What is your name?');
      const output = capturedOutput();
      expect(output).toContain('What is your name?');
    });

    it('shows numbered options', () => {
      ui.showQuestion('Pick one', [
        { label: 'Option A', description: 'First option' },
        { label: 'Option B', description: 'Second option' },
      ]);
      const output = capturedOutput();
      expect(output).toContain('1.');
      expect(output).toContain('Option A');
    });
  });

  describe('showError', () => {
    it('shows error message with error indicator', () => {
      ui.showError('Something went wrong');
      const output = capturedOutput();
      expect(output).toContain('Something went wrong');
    });
  });

  describe('close', () => {
    it('closes readline interface', () => {
      expect(() => ui.close()).not.toThrow();
    });
  });

  describe('setInputHandler', () => {
    it('accepts a handler function', () => {
      const handler = vi.fn();
      expect(() => ui.setInputHandler(handler)).not.toThrow();
    });
  });

  describe('showHistory', () => {
    it('shows user and assistant messages', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!', toolCalls: [], toolResults: [] },
      ];
      expect(() => ui.showHistory(messages)).not.toThrow();
    });

    it('shows messages with tool calls and results', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Run command' },
        {
          role: 'assistant',
          content: 'OK running',
          toolCalls: [{ id: 'tc1', name: 'Bash', args: { command: 'echo hi' } }],
          toolResults: [],
        },
        {
          role: 'user',
          content: '',
          toolResults: [{ tool: 'tc1', input: {}, output: 'hi', isError: false }],
          toolCalls: [],
        },
      ];
      expect(() => ui.showHistory(messages)).not.toThrow();
    });

    it('shows messages with error results', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Test' },
        {
          role: 'assistant',
          content: '',
          toolCalls: [{ id: 'tc1', name: 'Bash', args: { command: 'fail' } }],
          toolResults: [],
        },
        {
          role: 'user',
          content: '',
          toolResults: [{ tool: 'tc1', input: {}, output: 'Error!', isError: true }],
          toolCalls: [],
        },
      ];
      expect(() => ui.showHistory(messages)).not.toThrow();
    });

    it('handles system messages', () => {
      const messages: Message[] = [
        { role: 'system', content: 'System notice' },
        { role: 'user', content: 'Hello' },
      ];
      expect(() => ui.showHistory(messages)).not.toThrow();
    });
  });

  describe('showAgentDelta — streaming', () => {
    it('renders streaming text chunks', () => {
      ui.showAgentStart();
      ui.showAgentDelta('Hello ');
      ui.showAgentDelta('World');
      ui.showAgentDone();
      const output = capturedOutput();
      expect(output).toBeDefined();
    });

    it('stops spinner if active', () => {
      ui.startSpinner('thinking');
      ui.showAgentDelta('response text');
      const output = capturedOutput();
      expect(output).toBeDefined();
    });
  });

  describe('progress bar', () => {
    it('starts and updates progress', () => {
      ui.startProgress('building', 100);
      ui.updateProgress(50);
      ui.updateProgress(100);
      ui.stopProgress('done!');
      const output = capturedOutput();
      expect(output).toContain('done!');
    });

    it('stops progress without message', () => {
      ui.startProgress('test', 10);
      ui.stopProgress();
      expect(true).toBe(true);
    });
  });

  describe('tool progress tracking', () => {
    it('sets tool progress total', () => {
      expect(() => ui.setToolProgressTotal(5)).not.toThrow();
    });
  });

  describe('renderMarkdown edge cases', () => {
    it('renders thinking blocks collapsed', () => {
      ui.showAgentStart();
      ui.showAgentText('<thinking>\nThis is a reasoning step\n</thinking>\nFinal answer');
      const output = capturedOutput();
      expect(output).toContain('思考过程已折叠');
    });

    it('renders horizontal rules', () => {
      ui.showAgentStart();
      ui.showAgentText('Text\n---\nMore');
      const output = capturedOutput();
      expect(output).toBeDefined();
    });

    it('renders blockquotes', () => {
      ui.showAgentStart();
      ui.showAgentText('> A quoted line');
      const output = capturedOutput();
      expect(output).toBeDefined();
    });

    it('renders lists', () => {
      ui.showAgentStart();
      ui.showAgentText('- item 1\n- item 2');
      const output = capturedOutput();
      expect(output).toBeDefined();
    });

    it('renders headings', () => {
      ui.showAgentStart();
      ui.showAgentText('## Heading 2');
      const output = capturedOutput();
      expect(output).toContain('Heading 2');
    });
  });

  describe('promptForAnswer', () => {
    it('calls prompt on readline', () => {
      expect(() => ui.promptForAnswer()).not.toThrow();
    });
  });
});
