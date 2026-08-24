#!/usr/bin/env node
/**
 * Enhanced secret scan pre-commit hook.
 * Blocks commits containing API keys / credentials / sensitive patterns.
 */
import { execSync } from 'node:child_process';

const FAKE_KEY = 'sk-1234567890abcdefghij';

const PATTERNS = {
  critical: [
    { regex: /\bsk-[a-zA-Z0-9]{20,}\b/g, name: 'OpenAI/Anthropic API key' },
    { regex: /\bdeepseek-r-[a-zA-Z0-9]{20,}\b/g, name: 'DeepSeek API key' },
    { regex: /\bAKIA[0-9A-Z]{16}\b/g, name: 'AWS access key' },
    { regex: /\bxox[baprs]-[a-zA-Z0-9-]{10,}\b/g, name: 'Slack token' },
  ],
  high: [
    { regex: /\bghp_[a-zA-Z0-9]{36,}\b/g, name: 'GitHub PAT' },
    { regex: /\bgithub_pat_[a-zA-Z0-9_]{82}\b/g, name: 'GitHub fine-grained PAT' },
    { regex: /\bAIza[0-9A-Za-z_-]{35}\b/g, name: 'Google API key' },
    { regex: /"password"\s*:\s*"(?![^"]*REDACT)[^"]{8,}"/g, name: 'Password in JSON' },
  ],
};

const EXCLUDE_PATTERNS = [
  /\.test\.ts$/,
  /\.spec\.ts$/,
  /mock/i,
  /example/i,
  /SECURITY.*\.md$/,
  /AgentUtils\.ts$/,  // Contains sanitization examples
];

try {
  const diff = execSync('git diff --cached --name-only', { encoding: 'utf8' });
  const files = diff.trim().split('\n').filter(Boolean);
  const results = { critical: [], high: [] };

  for (const file of files) {
    if (EXCLUDE_PATTERNS.some((p) => p.test(file))) continue;

    try {
      const content = execSync(`git diff --cached -- "${file}"`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
      const addedLines = content.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++'));

      for (const line of addedLines) {
        // Skip lines containing REDACTED (sanitization examples)
        if (line.includes('REDACTED') || line.includes('[REDACT')) continue;

        for (const [severity, patterns] of Object.entries(PATTERNS)) {
          for (const { regex, name } of patterns) {
            const matches = [...line.matchAll(regex)];
            for (const match of matches) {
              const value = match[0];
              if (value === FAKE_KEY) continue;
              results[severity].push({ file, name, value: value.slice(0, 12) + '****' });
            }
          }
        }
      }
    } catch {}
  }

  const total = results.critical.length + results.high.length;

  if (total > 0) {
    console.error('\n❌ [secret-scan] Detected secrets in staged changes:\n');
    for (const [severity, findings] of Object.entries(results)) {
      if (findings.length === 0) continue;
      console.error(`${severity.toUpperCase()}:`);
      for (const { file, name, value } of findings) {
        console.error(`   ${file}: ${name} → ${value}`);
      }
    }
    console.error('\n👉 Remove secrets and use environment variables instead\n');
    process.exit(1);
  }

  console.log('✅ [secret-scan] No secrets detected');
} catch (err) {
  console.error('❌ [secret-scan] Failed:', err.message);
  process.exit(1);
}
