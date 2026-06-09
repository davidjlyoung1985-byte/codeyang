/**
 * Lightweight .env file loader (no external dependency).
 * Reads .env and .env.local from the current working directory.
 * Only sets variables that are NOT already set in process.env.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

function parseDotEnv(content: string): Array<{ key: string; value: string }> {
  const entries: Array<{ key: string; value: string }> = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    // Skip comments and empties
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
      value = value.slice(1, -1);
    }
    if (key) entries.push({ key, value });
  }
  return entries;
}

export function loadEnvFiles(cwd: string = process.cwd()): void {
  // Track which keys were set by *this* loader so .env.local can override .env
  // but never override pre-existing process.env values.
  const loadedByUs = new Set<string>();

  for (const name of ['.env', '.env.local']) {
    const filePath = join(cwd, name);
    if (existsSync(filePath)) {
      try {
        const content = readFileSync(filePath, 'utf-8');
        const entries = parseDotEnv(content);
        for (const { key, value } of entries) {
          // .env.local can override .env, but nothing overrides original env
          if (name === '.env.local' && loadedByUs.has(key)) {
            process.env[key] = value;
          } else if (!process.env[key]) {
            process.env[key] = value;
            loadedByUs.add(key);
          }
        }
      } catch {
        // Silently ignore unreadable files
      }
    }
  }
}
