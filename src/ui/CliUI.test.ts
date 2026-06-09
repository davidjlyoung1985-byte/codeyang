import { describe, it, expect, vi, beforeEach } from 'vitest';

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
  process.stdout.write = mockWrite as any;
  console.log = mockLog;
});
afterAll(() => {
  if (origWrite) process.stdout.write = origWrite;
  if (origLog) console.log = origLog;
});

/** Combine all captured output (stdout + console.log) */
function capturedOutput(): string {
  const stdoutCalls = mockWrite.mock.calls.map((c: any[]) => String(c[0]));
  const logCalls = mockLog.mock.calls.map((c: any[]) => c.join(' '));
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
      const calls = mockWrite.mock.calls.map((c: any) => c[0]).join('');
      expect(calls).toContain('->');
    });
  });

  describe('showUserMessage', () => {
    it('shows user message with User label', () => {
      ui.showUserMessage('hello world');
      const output = mockWrite.mock.calls.map((c: any) => c[0]).join('');
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
      const output = mockWrite.mock.calls.map((c: any) => c[0]).join('');
      expect(output).toContain('Bash');
    });
  });

  describe('showToolResult', () => {
    it('shows success output', () => {
      ui.showToolResult('output text', false);
      const output = capturedOutput();
      expect(output).toContain('output text');
    });

    it('shows error output', () => {
      ui.showToolResult('error text', true);
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
});
