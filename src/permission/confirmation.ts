/**
 * Interactive confirmation for `ask`-level permission decisions.
 *
 * The permission system has three levels, but until now only two behaved
 * differently: `ask` was implemented as a plain `throw` everywhere, which made
 * it identical to `deny`. This module supplies the missing third behaviour —
 * "stop and let the user decide".
 *
 * Design constraints:
 *   - **Fail closed.** No TTY (CI, piped stdin, agent-to-agent) means we cannot
 *     ask, so the answer is "no". Silence must never be read as consent.
 *   - **Never hang.** A prompt that blocks forever is worse than a denial, so
 *     every prompt has a timeout that resolves to "deny".
 *   - **Testable.** The actual question is behind an injectable `Confirmer`, so
 *     tests never have to drive a real terminal.
 */

import * as readline from 'node:readline';

export type ConfirmationDecision = 'allow' | 'allow-session' | 'deny';

/** Asks the user a yes/no question. Injectable so tests need no TTY. */
export type Confirmer = (question: string, timeoutMs: number) => Promise<ConfirmationDecision>;

export interface ConfirmationRequest {
  /** What is being attempted, e.g. `bash: rm -rf dist`. */
  subject: string;
  /** Why the rules flagged it, from the permission rule's `reason`. */
  reason?: string;
}

/** Default timeout for an interactive prompt. */
const DEFAULT_TIMEOUT_MS = 60_000;

/** Decisions granted for this process lifetime only (`allow-session`). */
const sessionGrants = new Set<string>();

let confirmer: Confirmer | null = null;
let timeoutMs = DEFAULT_TIMEOUT_MS;

/**
 * Override the confirmer. Passing `null` restores the default.
 * Intended for tests and for embedding CodeYang in a host that has its own UI.
 */
export function setConfirmer(next: Confirmer | null): void {
  confirmer = next;
}

/** Adjust how long a prompt waits before resolving to "deny". */
export function setConfirmationTimeout(ms: number): void {
  timeoutMs = ms;
}

/** Forget session-wide grants (called on `reloadPermissions` and in tests). */
export function clearSessionGrants(): void {
  sessionGrants.clear();
}

/** Whether the given subject was already approved for this session. */
export function hasSessionGrant(subject: string): boolean {
  return sessionGrants.has(subject);
}

/**
 * Prompt the user. Returns 'allow' / 'allow-session' / 'deny'.
 *
 * Never throws: any failure (no TTY, EOF, error) resolves to 'deny'.
 */
export async function requestConfirmation(request: ConfirmationRequest): Promise<ConfirmationDecision> {
  const subject = request.subject.trim();

  if (sessionGrants.has(subject)) return 'allow-session';

  const ask = confirmer ?? defaultConfirmer;
  const question = formatQuestion(request);

  let decision: ConfirmationDecision;
  try {
    decision = await ask(question, timeoutMs);
  } catch {
    // A broken prompter must not turn into an implicit yes.
    return 'deny';
  }

  if (decision === 'allow-session') {
    sessionGrants.add(subject);
    return 'allow-session';
  }
  return decision === 'allow' ? 'allow' : 'deny';
}

function formatQuestion(request: ConfirmationRequest): string {
  const lines = [`Allow ${request.subject}?`];
  if (request.reason) lines.push(`  Reason: ${request.reason}`);
  lines.push('  [y]es once / [a]lways this session / [N]o');
  return lines.join('\n');
}

/**
 * Terminal-backed confirmer.
 *
 * Resolves to 'deny' when stdin is not a TTY: there is nobody to ask, and
 * defaulting to "yes" would let a piped/CI invocation approve `rm -rf`.
 */
const defaultConfirmer: Confirmer = (question, timeout) =>
  new Promise<ConfirmationDecision>((resolve) => {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      resolve('deny');
      return;
    }

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    let settled = false;

    const finish = (decision: ConfirmationDecision): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      rl.close();
      resolve(decision);
    };

    const timer = setTimeout(() => {
      process.stdout.write('\n(no answer within timeout — denied)\n');
      finish('deny');
    }, timeout);

    // Unref so a pending prompt cannot keep the process alive.
    if (typeof timer.unref === 'function') timer.unref();

    rl.question(`${question}\n> `, (answer) => {
      const normalized = answer.trim().toLowerCase();
      if (normalized === 'y' || normalized === 'yes') return finish('allow');
      if (normalized === 'a' || normalized === 'always') return finish('allow-session');
      return finish('deny');
    });

    rl.on('close', () => finish('deny'));
  });
