#!/usr/bin/env node
/**
 * Secret scan pre-commit hook.
 * Blocks commits containing API keys / credentials.
 * Excludes the fake key used in SecurityPolicy.test.ts (sk-1234567890abcdefghij).
 */
import { execSync } from 'node:child_process';

const FAKE_KEY = 'sk-1234567890abcdefghij'; // test-only placeholder, must be allowed
const PATTERNS = [
  /\bsk-[a-zA-Z0-9]{20,}\b/g, // OpenAI/Anthropic-style keys
  /\bghp_[a-zA-Z0-9]{30,}\b/g, // GitHub PAT
  /\bgithub_pat_[a-zA-Z0-9_]{30,}\b/g, // GitHub fine-grained PAT
  /\bAKIA[0-9A-Z]{16}\b/g, // AWS access key id
  /\bxox[baprs]-[a-zA-Z0-9-]{10,}\b/g, // Slack tokens
  /\bAIza[0-9A-Za-z_-]{30,}\b/g, // Google API key
];

try {
  const diff = execSync('git diff --cached -U0', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  const lines = diff.split('\n').filter((l) => l.startsWith('+'));
  const leaks = [];

  for (const line of lines) {
    for (const re of PATTERNS) {
      const matches = line.match(re) || [];
      for (const m of matches) {
        if (m === FAKE_KEY) continue;
        leaks.push(m);
      }
    }
  }

  const unique = [...new Set(leaks)];
  if (unique.length > 0) {
    console.error('❌ [secret-scan] API key(s) detected in staged changes. Aborting commit.');
    for (const k of unique) console.error(`   - ${k.slice(0, 8)}****[REDACTED]`);
    console.error('👉 Redact the secret, then retry.');
    process.exit(1);
  }

  console.log('✅ [secret-scan] no credentials in staged changes');
} catch (err) {
  // git diff failed (e.g. no repo) — fail safe
  console.error('❌ [secret-scan] could not inspect staged changes:', err.message);
  process.exit(1);
}
