/**
 * QtProFileTool — Read and analyze .pro files for Qt qmake projects.
 * Parses key variables: QT, CONFIG, SOURCES, HEADERS, FORMS, RESOURCES, LIBS.
 */
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

interface ProFileInfo {
  path: string;
  template: string;
  qtModules: string[];
  config: string[];
  sources: string[];
  headers: string[];
  forms: string[];
  resources: string[];
  libs: string[];
  target: string;
  raw: string;
}

export async function executeQtProFile(proPath?: string, cwd?: string): Promise<string> {
  const base = cwd || process.cwd();

  // Find .pro file if not specified
  let proFile: string;
  if (proPath) {
    proFile = proPath;
  } else {
    const entries = await readdir(base, { withFileTypes: true, recursive: false });
    const found = entries.find((e) => e.isFile() && e.name.endsWith('.pro'));
    if (!found) return 'No .pro file found in the project directory.';
    proFile = join(base, found.name);
  }

  let content: string;
  try {
    content = await readFile(proFile, 'utf-8');
  } catch {
    return `Cannot read .pro file: ${proFile}`;
  }

  const info = parseProFile(proFile, content);

  const lines: string[] = [];
  lines.push(`## .pro File Analysis: ${relative(base, info.path).replace(/\\/g, '/')}`);
  lines.push('');

  if (info.template) lines.push(`**Template**: ${info.template}`);
  if (info.target) lines.push(`**Target**: ${info.target}`);

  if (info.qtModules.length > 0) {
    lines.push(`\n### Qt Modules (${info.qtModules.length})`);
    for (const m of info.qtModules) lines.push(`  - ${m}`);

    // Check for common issues
    if (!info.qtModules.some((m) => ['core', 'widgets', 'quick'].includes(m))) {
      lines.push('\n⚠ No `core`, `widgets`, or `quick` module found. Ensure QT is configured correctly.');
    }
  }

  if (info.config.length > 0) {
    lines.push(`\n### CONFIG (${info.config.length})`);
    for (const c of info.config) lines.push(`  - ${c}`);
  }

  if (info.sources.length > 0) {
    lines.push(`\n### SOURCES (${info.sources.length})`);
    for (const s of info.sources.slice(0, 20)) lines.push(`  - ${s}`);
    if (info.sources.length > 20) lines.push(`  ... and ${info.sources.length - 20} more`);
  }

  if (info.headers.length > 0) {
    lines.push(`\n### HEADERS (${info.headers.length})`);
    for (const h of info.headers.slice(0, 10)) lines.push(`  - ${h}`);
    if (info.headers.length > 10) lines.push(`  ... and ${info.headers.length - 10} more`);
  }

  if (info.forms.length > 0) {
    lines.push(`\n### FORMS (${info.forms.length})`);
    for (const f of info.forms) lines.push(`  - ${f}`);
  }

  if (info.resources.length > 0) {
    lines.push(`\n### RESOURCES (${info.resources.length})`);
    for (const r of info.resources) lines.push(`  - ${r}`);
  }

  if (info.libs.length > 0) {
    lines.push(`\n### LIBS`);
    for (const l of info.libs) lines.push(`  - ${l}`);
  }

  return lines.join('\n');
}

function parseProFile(filePath: string, content: string): ProFileInfo {
  const result: ProFileInfo = {
    path: filePath,
    template: '',
    qtModules: [],
    config: [],
    sources: [],
    headers: [],
    forms: [],
    resources: [],
    libs: [],
    target: '',
    raw: content,
  };

  // Extract += and = values for each variable
  result.template = extractValue(content, 'TEMPLATE');
  result.target = extractValue(content, 'TARGET');

  const qtRaw = extractMultiLineValue(content, 'QT');
  result.qtModules = qtRaw
    .split(/\s+/)
    .filter(Boolean)
    .map((m) => m.toLowerCase());

  const configRaw = extractMultiLineValue(content, 'CONFIG');
  result.config = configRaw.split(/\s+/).filter(Boolean);

  result.sources = extractListValues(extractMultiLineValue(content, 'SOURCES'));
  result.headers = extractListValues(extractMultiLineValue(content, 'HEADERS'));
  result.forms = extractListValues(extractMultiLineValue(content, 'FORMS'));
  result.resources = extractListValues(extractMultiLineValue(content, 'RESOURCES'));

  const libsRaw = extractMultiLineValue(content, 'LIBS');
  result.libs = libsRaw.split(/\s+/).filter(Boolean);

  return result;
}

/** Extract a simple variable value: VAR = value */
function extractValue(content: string, varName: string): string {
  const match = content.match(new RegExp(`${varName}\\s*=\\s*([^\\n\\\\]+)`, 'i'));
  return match ? match[1].trim() : '';
}

/** Extract a multi-line variable: VAR += value1 \ value2 ... */
function extractMultiLineValue(content: string, varName: string): string {
  const regex = new RegExp(`${varName}\\s*[+*]?=\\s*([\\s\\S]*?)(?=\\n\\s*\\n|\\n\\s*\\w+\\s*[+*]?=|$)`, 'im');
  const match = content.match(regex);
  if (!match) return '';
  return match[1]
    .replace(/\\\s*\n/g, ' ') // line continuation
    .replace(/#.*/g, '') // comments
    .trim();
}

/** Split a space-separated list, filtering out empty entries. */
function extractListValues(raw: string): string[] {
  return raw
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
