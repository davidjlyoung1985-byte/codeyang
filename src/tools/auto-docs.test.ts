/**
 * Tests for src/tools/auto-docs.ts — Markdown documentation generation.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('./registry.js', () => ({
  toolSchemas: vi.fn(() => [
    {
      name: 'Bash',
      description: 'Run a shell command and capture output.',
      input_schema: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The command to run' },
          timeout: { type: 'number', description: 'Seconds', enum: [10, 30, 60] },
          items: { type: 'array', items: { type: 'string' } },
        },
        required: ['command'],
      },
    },
    {
      name: 'CustomTool',
      description: 'A tool without category mapping. Has a second sentence that should be trimmed.',
      input_schema: { type: 'object', properties: { flag: { type: 'boolean', description: 'On or off' } } },
    },
    {
      name: 'NoParams',
      description: 'Tool with no parameters.',
      input_schema: { type: 'object', properties: {} },
    },
  ]),
}));

import { generateDocs } from './auto-docs.js';

describe('auto-docs', () => {
  it('generates a full Markdown document with header and table of contents', () => {
    const md = generateDocs();
    expect(md).toContain('# Tool Reference');
    expect(md).toContain('3 tools total.');
    expect(md).toContain('## Table of Contents');
  });

  it('groups tools into categories and renders table rows', () => {
    const md = generateDocs();
    expect(md).toContain('## Core');
    expect(md).toContain('## Other');
    expect(md).toContain('| **Bash** |');
    expect(md).toContain('| **CustomTool** |');
  });

  it('formats parameters with type, enum, items and required marker', () => {
    const md = generateDocs();
    // Bash row: command (required, string), timeout (optional, enum), items (optional, array of string)
    expect(md).toContain('`command`: `string`');
    expect(md).toContain('(10|30|60)');
    expect(md).toContain('_(**required**)_');
    expect(md).toContain('`timeout`');
    expect(md).toContain('`items`');
    expect(md).toContain('`array`');
    expect(md).toContain('[string]');
  });

  it('trims description to first sentence', () => {
    const md = generateDocs();
    // split('.')[0] keeps everything before the first dot (dot not included)
    expect(md).toContain('A tool without category mapping');
    expect(md).not.toContain('second sentence');
  });

  it('shows "None" when a tool has no parameters', () => {
    const md = generateDocs();
    expect(md).toContain('None');
  });

  it('handles tools with unknown categories as Other', () => {
    const md = generateDocs();
    // CustomTool should land in "Other"
    const otherSection = md.split('## Other')[1] || '';
    expect(otherSection).toContain('CustomTool');
  });

  it('generates a clean table of contents anchor', () => {
    const md = generateDocs();
    expect(md).toContain('[Core](#core)');
    expect(md).toContain('[Other](#other)');
  });
});
