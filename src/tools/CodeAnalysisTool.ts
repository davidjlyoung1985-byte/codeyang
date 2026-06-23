import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { existsSync, statSync } from 'node:fs';
import { parse as babelParse, type ParserPlugin } from '@babel/parser';
import traverse from '@babel/traverse';
import { parse as acornParse } from 'acorn';
import * as acornWalk from 'acorn-walk';
import { ESLint } from 'eslint';

// ── AST Results Cache (mtime-based invalidation) ────────────────────
// Avoids re-parsing/re-analyzing the same file within a session when unchanged.
// Each entry expires after CACHE_TTL_MS to prevent stale results.
const CACHE_TTL_MS = 60_000;
const resultCache = new Map<string, { result: string; mtimeMs: number; cachedAt: number }>();

function getCached(key: string): string | null {
  const entry = resultCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt < CACHE_TTL_MS) {
    return entry.result;
  }
  resultCache.delete(key);
  return null;
}

function setCached(key: string, result: string): void {
  resultCache.set(key, { result, mtimeMs: 0, cachedAt: Date.now() });
}

/**
 * Build a cache key from the resolved file path + current mtime.
 * Returns null if the file can't be stat'd (e.g. deleted).
 */
function cacheKey(filePath: string): string | null {
  try {
    const absPath = path.resolve(filePath);
    const mtimeMs = statSync(absPath).mtimeMs;
    return `${absPath}@${mtimeMs}`;
  } catch {
    return null;
  }
}

/**
 * 安全 JSON 序列化 — 处理循环引用、BigInt、undefined 等特殊情况。
 * Babel AST 中存在 parent/child 循环引用，直接用 JSON.stringify 会抛出异常。
 */
function safeJsonStringify(value: unknown, space?: number): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(
    value,
    (_key: string, val: unknown): unknown => {
      if (typeof val === 'object' && val !== null) {
        if (seen.has(val)) return '[Circular]';
        seen.add(val);
      }
      if (typeof val === 'bigint') return val.toString();
      if (val === undefined) return null;
      return val;
    },
    space,
  );
}

/**
 * Parse JavaScript/TypeScript code and return AST information
 */
export async function executeParseAst(
  filePath: string,
  language: 'javascript' | 'typescript' = 'javascript',
): Promise<string> {
  try {
    const absPath = path.resolve(filePath);
    if (!existsSync(absPath)) {
      return `Error: File does not exist: ${filePath}`;
    }
    const ck = cacheKey(absPath);
    if (ck) {
      const cached = getCached(`parseAst:${ck}`);
      if (cached) return cached;
    }

    const code = await fs.readFile(absPath, 'utf-8');

    const plugins: ParserPlugin[] = ['jsx'];
    if (language === 'typescript') {
      plugins.push('typescript');
    }

    const ast = babelParse(code, {
      sourceType: 'module',
      plugins,
    });

    // 仅提取基础信息，避免序列化整个 AST（含循环引用）
    const info = {
      type: ast.type,
      program: {
        type: ast.program.type,
        bodyLength: ast.program.body.length,
        statements: ast.program.body.map((node: { type: string; start?: number | null; end?: number | null }) => ({
          type: node.type,
          start: node.start ?? undefined,
          end: node.end ?? undefined,
        })),
      },
    };

    const result = safeJsonStringify(info, 2);
    if (ck) setCached(`parseAst:${ck}`, result);
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Error parsing AST: ${msg}`;
  }
}

/**
 * Analyze code structure and extract symbols (functions, classes, imports)
 */
export async function executeAnalyzeCode(
  filePath: string,
  language: 'javascript' | 'typescript' = 'javascript',
): Promise<string> {
  try {
    const absPath = path.resolve(filePath);
    if (!existsSync(absPath)) {
      return `Error: File does not exist: ${filePath}`;
    }
    const ck = cacheKey(absPath);
    if (ck) {
      const cached = getCached(`analyzeCode:${ck}`);
      if (cached) return cached;
    }

    const code = await fs.readFile(absPath, 'utf-8');

    const plugins: ParserPlugin[] = ['jsx'];
    if (language === 'typescript') {
      plugins.push('typescript');
    }

    const ast = babelParse(code, {
      sourceType: 'module',
      plugins,
    });

    const analysis = {
      imports: [] as string[],
      exports: [] as string[],
      functions: [] as Array<{ name: string; line: number; params: number }>,
      classes: [] as Array<{ name: string; line: number; methods: number }>,
      variables: [] as Array<{ name: string; kind: string; line: number }>,
    };

    // Babel visitor 类型较复杂，使用带类型守卫的 any 访问
    traverse(ast, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ImportDeclaration(path: any) {
        const sourceVal = path.node?.source?.value;
        if (typeof sourceVal === 'string') analysis.imports.push(sourceVal);
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ExportNamedDeclaration(path: any) {
        const decl = path.node?.declaration;
        if (!decl) return;
        if (decl.type === 'FunctionDeclaration') {
          analysis.exports.push(decl.id?.name || 'anonymous');
        } else if (decl.type === 'VariableDeclaration') {
          for (const d of decl.declarations ?? []) {
            if (d.id?.name) analysis.exports.push(d.id.name);
          }
        }
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      FunctionDeclaration(path: any) {
        analysis.functions.push({
          name: path.node.id?.name || 'anonymous',
          line: path.node.loc?.start.line || 0,
          params: (path.node.params ?? []).length,
        });
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ArrowFunctionExpression(path: any) {
        const parent = path.parent;
        if (parent?.type === 'VariableDeclarator' && parent.id?.name) {
          analysis.functions.push({
            name: parent.id.name,
            line: path.node.loc?.start.line || 0,
            params: (path.node.params ?? []).length,
          });
        }
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ClassDeclaration(path: any) {
        const body = path.node?.body?.body ?? [];
        const methods = body.filter((n: { type: string }) => n.type === 'ClassMethod').length;
        analysis.classes.push({
          name: path.node.id?.name || 'anonymous',
          line: path.node.loc?.start.line || 0,
          methods,
        });
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      VariableDeclaration(path: any) {
        for (const d of path.node.declarations ?? []) {
          if (d.id?.name) {
            analysis.variables.push({
              name: d.id.name,
              kind: path.node.kind || 'var',
              line: d.loc?.start.line || 0,
            });
          }
        }
      },
    });

    const summary = [
      `File: ${filePath}`,
      ``,
      `Imports: ${analysis.imports.length}`,
      analysis.imports.length > 0 ? `  - ${analysis.imports.join('\n  - ')}` : '',
      ``,
      `Exports: ${analysis.exports.length}`,
      analysis.exports.length > 0 ? `  - ${analysis.exports.join('\n  - ')}` : '',
      ``,
      `Functions: ${analysis.functions.length}`,
      ...analysis.functions.map((f) => `  - ${f.name} (line ${f.line}, ${f.params} params)`),
      ``,
      `Classes: ${analysis.classes.length}`,
      ...analysis.classes.map((c) => `  - ${c.name} (line ${c.line}, ${c.methods} methods)`),
      ``,
      `Variables: ${analysis.variables.length}`,
      ...analysis.variables.map((v) => `  - ${v.kind} ${v.name} (line ${v.line})`),
    ];

    const result = summary.filter((s) => s !== '').join('\n');
    if (ck) setCached(`analyzeCode:${ck}`, result);
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Error analyzing code: ${msg}`;
  }
}

/**
 * Calculate code complexity metrics
 */
export async function executeComplexity(filePath: string): Promise<string> {
  try {
    const absPath = path.resolve(filePath);
    if (!existsSync(absPath)) {
      return `Error: File does not exist: ${filePath}`;
    }
    const ck = cacheKey(absPath);
    if (ck) {
      const cached = getCached(`complexity:${ck}`);
      if (cached) return cached;
    }

    const code = await fs.readFile(absPath, 'utf-8');

    const ast = acornParse(code, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      locations: true,
    });

    let complexity = 1; // McCabe: M = 1 + number of decision points
    let maxDepth = 0;
    let functions = 0;
    let branches = 0;

    acornWalk.recursive(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ast as any,
      { depth: 0 },
      {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        FunctionDeclaration(node: any, state: any, c: any) {
          functions++;
          state.depth++;
          if (state.depth > maxDepth) maxDepth = state.depth;
          c(node.body, state);
          state.depth--;
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ArrowFunctionExpression(node: any, state: any, c: any) {
          functions++;
          state.depth++;
          if (state.depth > maxDepth) maxDepth = state.depth;
          if (node.body?.type === 'BlockStatement') {
            c(node.body, state);
          }
          state.depth--;
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        IfStatement(node: any, state: any, c: any) {
          complexity++;
          branches++;
          if (node.consequent) c(node.consequent, state);
          if (node.alternate) c(node.alternate, state);
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        WhileStatement(node: any, state: any, c: any) {
          complexity++;
          if (node.body) c(node.body, state);
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ForStatement(node: any, state: any, c: any) {
          complexity++;
          if (node.body) c(node.body, state);
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        SwitchCase(node: any, state: any, c: any) {
          complexity++;
          branches++;
          if (node.consequent) {
            for (const n of node.consequent) c(n, state);
          }
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ConditionalExpression(_node: any) {
          complexity++;
          branches++;
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        LogicalExpression(node: any) {
          if (node.operator === '&&' || node.operator === '||') {
            complexity++;
          }
        },
      },
    );

    const lines = code.split('\n').length;
    const avgComplexity = functions > 0 ? (complexity / functions).toFixed(2) : '0';

    const result = [
      `File: ${filePath}`,
      `Lines: ${lines}`,
      `Functions: ${functions}`,
      `Cyclomatic Complexity: ${complexity}`,
      `Average Complexity per Function: ${avgComplexity}`,
      `Max Nesting Depth: ${maxDepth}`,
      `Conditional Branches: ${branches}`,
      ``,
      `Complexity Rating: ${getComplexityRating(complexity, functions)}`,
    ].join('\n');
    if (ck) setCached(`complexity:${ck}`, result);
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Error calculating complexity: ${msg}`;
  }
}

function getComplexityRating(complexity: number, functions: number): string {
  if (functions === 0) return 'N/A';
  const avg = complexity / functions;
  if (avg <= 5) return 'Low (maintainable)';
  if (avg <= 10) return 'Medium (acceptable)';
  if (avg <= 20) return 'High (consider refactoring)';
  return 'Very High (needs refactoring)';
}

/**
 * Run ESLint on a file
 */
export async function executeLint(filePath: string, fix = false): Promise<string> {
  try {
    const absPath = path.resolve(filePath);
    if (!existsSync(absPath)) {
      return `Error: File does not exist: ${filePath}`;
    }

    // ESLint 10: use overrideConfigFile=true to skip project config lookup,
    // and provide inline config via overrideConfig to avoid parserOptions.project issues.
    const eslint = new ESLint({
      fix,
      cwd: path.dirname(absPath),
      overrideConfigFile: true,
      overrideConfig: [
        {
          files: ['**/*.{js,ts}'],
          languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
              window: 'readonly',
              document: 'readonly',
              navigator: 'readonly',
              console: 'readonly',
              process: 'readonly',
              Buffer: 'readonly',
              __dirname: 'readonly',
              __filename: 'readonly',
              require: 'readonly',
              module: 'readonly',
              exports: 'readonly',
            },
          },
          rules: {
            'no-unused-vars': 'warn',
            'no-undef': 'warn',
            'no-console': 'off',
          },
        },
      ],
    });

    const results = await eslint.lintFiles([absPath]);

    if (fix) {
      await ESLint.outputFixes(results);
    }

    const result = results[0];
    if (!result) {
      return 'No linting results';
    }

    if (result.errorCount === 0 && result.warningCount === 0) {
      return `✓ No issues found in ${filePath}`;
    }

    const output = [`File: ${filePath}`, `Errors: ${result.errorCount}, Warnings: ${result.warningCount}`, ``];

    result.messages.forEach((msg) => {
      const severity = msg.severity === 2 ? 'Error' : 'Warning';
      output.push(`${severity} at line ${msg.line}:${msg.column}`);
      output.push(`  ${msg.message}`);
      output.push(`  Rule: ${msg.ruleId || 'unknown'}`);
      output.push('');
    });

    if (fix) {
      output.push('✓ Auto-fixable issues have been fixed');
    }

    return output.join('\n');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Error running lint: ${msg}`;
  }
}

/**
 * Find dependencies in package.json
 */
export async function executeFindDeps(projectDir: string): Promise<string> {
  try {
    const pkgPath = path.join(path.resolve(projectDir), 'package.json');

    if (!existsSync(pkgPath)) {
      return `Error: package.json not found in ${projectDir}`;
    }
    const ck = cacheKey(pkgPath);
    if (ck) {
      const cached = getCached(`findDeps:${ck}`);
      if (cached) return cached;
    }

    const content = await fs.readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(content);

    const deps = pkg.dependencies || {};
    const devDeps = pkg.devDependencies || {};
    const peerDeps = pkg.peerDependencies || {};

    const output = [
      `Project: ${pkg.name || 'unnamed'}`,
      `Version: ${pkg.version || 'unknown'}`,
      ``,
      `Dependencies: ${Object.keys(deps).length}`,
      ...Object.entries(deps).map(([name, version]) => `  - ${name}: ${version}`),
      ``,
      `Dev Dependencies: ${Object.keys(devDeps).length}`,
      ...Object.entries(devDeps).map(([name, version]) => `  - ${name}: ${version}`),
    ];

    if (Object.keys(peerDeps).length > 0) {
      output.push(``);
      output.push(`Peer Dependencies: ${Object.keys(peerDeps).length}`);
      output.push(...Object.entries(peerDeps).map(([name, version]) => `  - ${name}: ${version}`));
    }

    const result = output.join('\n');
    if (ck) setCached(`findDeps:${ck}`, result);
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Error finding dependencies: ${msg}`;
  }
}

/**
 * Count lines of code
 */
export async function executeCountLines(filePath: string): Promise<string> {
  try {
    const absPath = path.resolve(filePath);
    if (!existsSync(absPath)) {
      return `Error: File does not exist: ${filePath}`;
    }
    const ck = cacheKey(absPath);
    if (ck) {
      const cached = getCached(`countLines:${ck}`);
      if (cached) return cached;
    }

    const content = await fs.readFile(absPath, 'utf-8');
    const lines = content.split('\n');

    const totalLines = lines.length;
    let codeLines = 0;
    let commentLines = 0;
    let blankLines = 0;

    let inBlockComment = false;

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed === '') {
        blankLines++;
        continue;
      }

      // Check for block comments
      if (trimmed.startsWith('/*')) {
        inBlockComment = true;
      }

      if (inBlockComment) {
        commentLines++;
        if (trimmed.endsWith('*/')) {
          inBlockComment = false;
        }
        continue;
      }

      // Check for line comments
      if (trimmed.startsWith('//') || trimmed.startsWith('#')) {
        commentLines++;
        continue;
      }

      codeLines++;
    }

    const result = [
      `File: ${filePath}`,
      `Total Lines: ${totalLines}`,
      `Code Lines: ${codeLines} (${((codeLines / totalLines) * 100).toFixed(1)}%)`,
      `Comment Lines: ${commentLines} (${((commentLines / totalLines) * 100).toFixed(1)}%)`,
      `Blank Lines: ${blankLines} (${((blankLines / totalLines) * 100).toFixed(1)}%)`,
    ].join('\n');
    if (ck) setCached(`countLines:${ck}`, result);
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Error counting lines: ${msg}`;
  }
}
