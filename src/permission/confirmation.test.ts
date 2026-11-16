import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  requestConfirmation,
  setConfirmer,
  setConfirmationTimeout,
  clearSessionGrants,
  hasSessionGrant,
  type Confirmer,
} from './confirmation.js';

describe('confirmation', () => {
  beforeEach(() => {
    clearSessionGrants();
    setConfirmer(null);
  });

  afterEach(() => {
    setConfirmer(null);
    setConfirmationTimeout(60_000);
    clearSessionGrants();
  });

  describe('decision mapping', () => {
    it('returns allow when the user says yes', async () => {
      setConfirmer(async () => 'allow');
      expect(await requestConfirmation({ subject: 'bash: sudo ls' })).toBe('allow');
    });

    it('returns deny when the user says no', async () => {
      setConfirmer(async () => 'deny');
      expect(await requestConfirmation({ subject: 'bash: sudo ls' })).toBe('deny');
    });

    it('records a session grant for "always"', async () => {
      setConfirmer(async () => 'allow-session');
      expect(await requestConfirmation({ subject: 'bash: sudo ls' })).toBe('allow-session');
      expect(hasSessionGrant('bash: sudo ls')).toBe(true);
    });
  });

  describe('session grants', () => {
    it('skips the prompt once a subject is granted for the session', async () => {
      const confirmer = vi.fn<Confirmer>(async () => 'allow-session');
      setConfirmer(confirmer);

      await requestConfirmation({ subject: 'bash: sudo ls' });
      expect(confirmer).toHaveBeenCalledTimes(1);

      // Second call must not prompt again.
      expect(await requestConfirmation({ subject: 'bash: sudo ls' })).toBe('allow-session');
      expect(confirmer).toHaveBeenCalledTimes(1);
    });

    it('does not leak a grant to a different subject', async () => {
      const confirmer = vi.fn<Confirmer>(async () => 'allow-session');
      setConfirmer(confirmer);

      await requestConfirmation({ subject: 'bash: sudo ls' });
      await requestConfirmation({ subject: 'bash: sudo rm -rf /var' });
      expect(confirmer).toHaveBeenCalledTimes(2);
    });

    it('clears grants on demand', async () => {
      setConfirmer(async () => 'allow-session');
      await requestConfirmation({ subject: 'x' });
      expect(hasSessionGrant('x')).toBe(true);

      clearSessionGrants();
      expect(hasSessionGrant('x')).toBe(false);
    });
  });

  // ── Fail-closed guarantees ──
  //
  // These are the properties that make it safe to put a prompt inside
  // executeBash(): a broken or absent prompter must never become a "yes".
  describe('fails closed', () => {
    it('denies when the confirmer throws', async () => {
      setConfirmer(async () => {
        throw new Error('prompter exploded');
      });
      expect(await requestConfirmation({ subject: 'bash: rm -rf /' })).toBe('deny');
    });

    it('denies when there is no TTY', async () => {
      // Default confirmer, no injected one. vitest runs without a TTY.
      const originalIsTTY = process.stdin.isTTY;
      Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
      try {
        expect(await requestConfirmation({ subject: 'bash: rm -rf /' })).toBe('deny');
      } finally {
        Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true });
      }
    });

    it('denies when the confirmer returns an unexpected value', async () => {
      // Cast through unknown: simulate a host UI returning junk.
      setConfirmer(async () => 'maybe' as unknown as 'allow');
      expect(await requestConfirmation({ subject: 'bash: rm -rf /' })).toBe('deny');
    });
  });

  describe('question content', () => {
    it('includes the subject and the reason so the user can judge', async () => {
      let seen = '';
      setConfirmer(async (question) => {
        seen = question;
        return 'deny';
      });
      await requestConfirmation({ subject: 'bash: git push --force', reason: 'Force push is destructive' });
      expect(seen).toContain('bash: git push --force');
      expect(seen).toContain('Force push is destructive');
    });

    it('works without a reason', async () => {
      let seen = '';
      setConfirmer(async (question) => {
        seen = question;
        return 'deny';
      });
      await requestConfirmation({ subject: 'bash: sudo ls' });
      expect(seen).toContain('bash: sudo ls');
    });
  });
});
