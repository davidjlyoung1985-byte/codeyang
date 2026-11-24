/**
 * Render the `--help` environment variable section from the registry.
 *
 * Keeping this generated means the help text cannot drift from what the code
 * actually reads. Before this existed, `--help` documented 8 of 61 variables.
 */

import { envByCategory, type EnvCategory, type EnvSpec } from './env.js';

const CATEGORY_LABELS: Record<EnvCategory, string> = {
  api: 'API credentials',
  model: 'Model',
  agent: 'Agent behaviour',
  permission: 'Permissions',
  sandbox: 'Sandbox',
  tools: 'Tools',
  memory: 'Memory',
  observability: 'Observability',
  bridge: 'Bridge',
  web: 'Web server',
  qt: 'Qt integration',
  internal: 'Process environment',
};

function describe(spec: EnvSpec): string {
  const parts = [spec.description];
  if (spec.choices) parts.push(`(${spec.choices.join('|')})`);
  else if (spec.kind === 'bool') parts.push('(true|false)');
  if (spec.default !== undefined && spec.default !== '') {
    parts.push(`default: ${spec.default}`);
  }
  return parts.join(' ');
}

/** Build the help block, grouped by category. `indent` prefixes every line. */
export function renderEnvHelp(indent = ''): string {
  const groups = envByCategory();
  const lines: string[] = [];
  const width = Math.min(30, Math.max(...[...groups.values()].flat().map((s) => s.name.length)) + 2);

  let first = true;
  for (const [category, specs] of groups) {
    if (!first) lines.push('');
    first = false;
    lines.push(`${indent}# ${CATEGORY_LABELS[category] ?? category}`);
    for (const spec of specs) {
      lines.push(`${indent}${spec.name.padEnd(width)}${describe(spec)}`);
    }
  }
  return lines.join('\n');
}

/** One-line summary for `--help` headers. */
export function envSummary(): string {
  const groups = envByCategory();
  return `${groups.size} categories`;
}
