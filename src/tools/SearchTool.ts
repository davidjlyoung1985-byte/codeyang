import * as path from 'node:path';
import { existsSync } from 'node:fs';
import { executeGrep } from './GrepTool.js';
import { getProjectIndex } from '../utils/projectIndex.js';

/**
 * Combined file name + content search.
 * Returns ranked results: name matches first, then content matches.
 */
export async function executeSearch(
  query: string,
  rootDir = process.cwd(),
  options: {
    maxResults?: number;
    includeGlob?: string;
    searchContent?: boolean;
    searchNames?: boolean;
    caseSensitive?: boolean;
  } = {},
): Promise<string> {
  const { maxResults = 20, includeGlob, searchContent = true, searchNames = true, caseSensitive = false } = options;

  if (!query.trim()) return 'Error: query cannot be empty';
  if (!existsSync(rootDir)) return `Error: directory not found: ${rootDir}`;

  const results: Array<{ type: 'name' | 'content'; path: string; line?: number; snippet?: string }> = [];

  // 1. File name search via cached project index
  if (searchNames) {
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = caseSensitive ? new RegExp(escaped) : new RegExp(escaped, 'i');
    try {
      const idx = await getProjectIndex(rootDir);
      for (const filePath of idx.files) {
        // Quick path reject before calling .test()
        if (!filePath.toLowerCase().includes(query.toLowerCase())) continue;

        const base = path.basename(filePath);
        if (re.test(base)) {
          results.push({ type: 'name', path: filePath });
          if (results.length >= maxResults) break;
        }
      }
    } catch {
      // ignore index errors
    }
  }

  // 2. Content search via grep
  if (searchContent && results.length < maxResults) {
    try {
      // GrepTool always searches case-insensitively; for case-sensitive pass as-is (rg respects it)
      const grepOut = await executeGrep(query, includeGlob, rootDir, 0);
      if (grepOut && grepOut !== '(no matches)') {
        // Output format (Node fallback): "relpath\nlinenum: content\n..."
        // Output format (ripgrep):       "relpath:linenum:content"
        let currentFile = '';
        for (const line of grepOut.split('\n')) {
          if (results.length >= maxResults) break;
          if (!line.trim()) continue;

          // ripgrep format: path:line:content
          const rgMatch = line.match(/^(.+?):(\d+):(.*)$/);
          if (rgMatch) {
            const [, filePath, lineNum, snippet] = rgMatch;
            const absPath = path.isAbsolute(filePath) ? filePath : path.join(rootDir, filePath);
            if (!results.find((r) => r.path === absPath && r.type === 'name')) {
              results.push({ type: 'content', path: absPath, line: Number(lineNum), snippet: snippet.trim() });
            }
            continue;
          }

          // Node fallback format: first line is relative path, following lines are "N: content"
          const lineMatch = line.match(/^(\d+)[: ]\s*(.*)/);
          if (lineMatch && currentFile) {
            const absPath = path.isAbsolute(currentFile) ? currentFile : path.join(rootDir, currentFile);
            if (!results.find((r) => r.path === absPath && r.type === 'name')) {
              results.push({
                type: 'content',
                path: absPath,
                line: Number(lineMatch[1]),
                snippet: lineMatch[2].trim(),
              });
            }
          } else if (!line.startsWith(' ') && !line.match(/^\d/)) {
            // treat as a file path header
            currentFile = line.trim();
          }
        }
      }
    } catch {
      // ignore grep errors
    }
  }

  if (results.length === 0) return `No results found for: ${query}`;

  const lines: string[] = [`Search: "${query}" in ${rootDir}`, `Found ${results.length} result(s):`, ''];

  const nameMatches = results.filter((r) => r.type === 'name');
  const contentMatches = results.filter((r) => r.type === 'content');

  if (nameMatches.length > 0) {
    lines.push(`## File name matches (${nameMatches.length})`);
    for (const r of nameMatches) lines.push(`  ${r.path}`);
    lines.push('');
  }

  if (contentMatches.length > 0) {
    lines.push(`## Content matches (${contentMatches.length})`);
    for (const r of contentMatches) {
      lines.push(`  ${r.path}:${r.line}  ${r.snippet?.slice(0, 120) ?? ''}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
