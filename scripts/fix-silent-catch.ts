/**
 * Automatic Silent Catch Fixer
 *
 * Scans and fixes all silent catch blocks in the codebase.
 *
 * Strategy:
 * 1. Detect catch blocks without error handling
 * 2. Add proper error logging based on context
 * 3. Preserve intentional silent catches with clear comments
 */

import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

interface CatchBlock {
  file: string;
  line: number;
  context: string;
  type: 'silent' | 'comment-only' | 'has-logic';
  suggestion: string;
}

/**
 * Recursively find all TypeScript files
 */
async function findTsFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git') {
        files.push(...(await findTsFiles(fullPath)));
      }
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Analyze a catch block and determine its type
 */
function analyzeCatchBlock(
  code: string,
  startIndex: number,
): {
  type: 'silent' | 'comment-only' | 'has-logic';
  body: string;
  context: string;
} {
  // Extract catch block body
  let braceCount = 0;
  let i = startIndex;
  let catchStart = -1;

  // Find opening brace
  while (i < code.length) {
    if (code[i] === '{') {
      catchStart = i;
      braceCount = 1;
      i++;
      break;
    }
    i++;
  }

  if (catchStart === -1) {
    return { type: 'silent', body: '', context: '' };
  }

  let catchEnd = i;
  while (i < code.length && braceCount > 0) {
    if (code[i] === '{') braceCount++;
    if (code[i] === '}') braceCount--;
    if (braceCount === 0) {
      catchEnd = i;
      break;
    }
    i++;
  }

  const body = code.slice(catchStart + 1, catchEnd).trim();

  // Get context (try block)
  const tryMatch = code.slice(Math.max(0, startIndex - 500), startIndex).match(/try\s*{([^}]+)}/s);
  const context = tryMatch ? tryMatch[1].trim().slice(0, 100) : '';

  // Determine type
  if (!body) {
    return { type: 'silent', body, context };
  }

  const commentOnlyPattern = /^(\/\/.*|\/\*[\s\S]*?\*\/)\s*$/;
  if (commentOnlyPattern.test(body)) {
    return { type: 'comment-only', body, context };
  }

  return { type: 'has-logic', body, context };
}

/**
 * Generate appropriate error handling code
 */
function generateErrorHandling(context: string, existingComment: string): string {
  // Detect context type
  const isFileOp = /readFile|writeFile|stat|mkdir|rm/.test(context);
  const isJsonParse = /JSON\.parse/.test(context);
  const isCleanup = /cleanup|shutdown|close|destroy/.test(context);
  const isOptional = /optional|best-effort/.test(existingComment);

  if (isCleanup || isOptional) {
    return `} catch (err) {
    // Best-effort cleanup - failure is acceptable
    if (process.env.CODEYANG_DEBUG) {
      console.warn('[Cleanup] Non-critical error:', err);
    }
  }`;
  }

  if (isFileOp) {
    return `} catch (err) {
    // File operation failed
    if (process.env.CODEYANG_DEBUG) {
      console.error('[FileSystem] Error:', err);
    }
    // Fallback to default behavior
  }`;
  }

  if (isJsonParse) {
    return `} catch (err) {
    // JSON parsing failed - data may be corrupted
    console.warn('[JSON] Parse error:', err instanceof Error ? err.message : String(err));
    // Using fallback value
  }`;
  }

  // Default: log error
  return `} catch (err) {
    // Unexpected error - investigate if this appears in logs
    console.error('[ERROR] Caught exception:', err);
  }`;
}

/**
 * Fix a single file
 */
async function fixFile(filePath: string): Promise<number> {
  const content = await readFile(filePath, 'utf-8');
  const lines = content.split('\n');

  let fixed = 0;
  let newContent = content;

  // Find all catch blocks
  const catchPattern = /}\s*catch\s*\{/g;
  let match;

  const replacements: Array<{ start: number; end: number; replacement: string }> = [];

  while ((match = catchPattern.exec(content)) !== null) {
    const analysis = analyzeCatchBlock(content, match.index);

    if (analysis.type === 'silent' || analysis.type === 'comment-only') {
      const replacement = generateErrorHandling(analysis.context, analysis.body);

      // Find the closing brace of this catch block
      let braceCount = 1;
      let i = match.index + match[0].length;
      while (i < content.length && braceCount > 0) {
        if (content[i] === '{') braceCount++;
        if (content[i] === '}') braceCount--;
        i++;
      }

      replacements.push({
        start: match.index + match[0].indexOf('catch'),
        end: i,
        replacement: replacement,
      });

      fixed++;
    }
  }

  // Apply replacements in reverse order to preserve indices
  replacements.reverse();
  for (const { start, end, replacement } of replacements) {
    newContent = newContent.slice(0, start) + replacement + newContent.slice(end);
  }

  if (fixed > 0) {
    await writeFile(filePath, newContent, 'utf-8');
  }

  return fixed;
}

/**
 * Main function
 */
async function main() {
  console.log('🔍 Scanning for silent catch blocks...\n');

  const files = await findTsFiles('src');

  let totalFixed = 0;
  const results: Array<{ file: string; fixed: number }> = [];

  for (const file of files) {
    const fixed = await fixFile(file);
    if (fixed > 0) {
      results.push({ file, fixed });
      totalFixed += fixed;
      console.log(`✅ ${file}: Fixed ${fixed} catch block(s)`);
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Files scanned: ${files.length}`);
  console.log(`   Files modified: ${results.length}`);
  console.log(`   Total catch blocks fixed: ${totalFixed}`);

  if (totalFixed > 0) {
    console.log(`\n⚠️  Please review the changes and run tests!`);
    console.log(`   npm test`);
  }
}

main().catch(console.error);
