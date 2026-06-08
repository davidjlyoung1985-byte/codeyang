/**
 * CodeYangX — Desktop Tool Implementations
 * All tools run in Electron's main process (Node.js CJS).
 * Invoked via IPC from the renderer process.
 */
const { spawn } = require('child_process');
const { readdir, readFile, writeFile, stat } = require('fs/promises');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.next', 'build', '.turbo', 'coverage', '__pycache__']);

function resolvePath(fp, cwd) {
  return path.isAbsolute(fp) ? fp : path.join(cwd || process.cwd(), fp);
}

/** Glob-to-regex conversion (supports **, *, ?, [chars], [!chars]) */
function globToRegex(pattern) {
  let regexStr = '';
  let i = 0;
  while (i < pattern.length) {
    switch (pattern[i]) {
      case '*':
        if (pattern[i + 1] === '*') {
          i += 2;
          if (i < pattern.length && pattern[i] === '/') i++;
          regexStr += i < pattern.length ? '(.*/)?' : '.*';
        } else {
          i++;
          regexStr += '[^/]*';
        }
        break;
      case '?': i++; regexStr += '[^/]'; break;
      case '.': case '^': case '$': case '+': case '{': case '}': case '(': case ')': case '|': case '\\':
        regexStr += '\\' + pattern[i]; i++; break;
      default: regexStr += pattern[i]; i++;
    }
  }
  if (regexStr.endsWith('/')) regexStr = regexStr.slice(0, -1) + '(/.*)?';
  return new RegExp('^' + regexStr + '$');
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ═══════════════════════════════════════════════════════════════════════════════
// Bash Tool
// ═══════════════════════════════════════════════════════════════════════════════

async function executeBash(command, cwd) {
  return new Promise((resolve) => {
    const shell = process.platform === 'win32' ? 'powershell.exe' : (process.env.SHELL || '/bin/sh');
    const child = spawn(command, {
      shell,
      cwd: cwd || process.cwd(),
      timeout: 30000,
      env: { ...process.env, CI: undefined },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('close', (code) => {
      const out = stdout.trim();
      const err = stderr.trim();
      if (code === 0) {
        const output = out || '(no output)';
        resolve(err ? `${output}\n\n(stderr):\n${err}` : output);
      } else {
        const parts = [];
        if (out) parts.push('stdout:\n' + out);
        if (err) parts.push('stderr:\n' + err);
        parts.push('exit code: ' + code);
        resolve(parts.join('\n\n'));
      }
    });

    child.on('error', (err) => {
      resolve('Error: ' + err.message);
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Read Tool — file reading + directory listing
// ═══════════════════════════════════════════════════════════════════════════════

async function executeRead(filePath, offset, limit, cwd) {
  const resolved = resolvePath(filePath, cwd);
  let stats;
  try { stats = await stat(resolved); }
  catch { throw new Error('File or directory not found: ' + filePath); }

  if (stats.isDirectory()) {
    const entries = await readdir(resolved, { withFileTypes: true });
    const sorted = [...entries].sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    const lines = sorted.map(e => e.name + (e.isDirectory() ? '/' : ''));
    const dirs = entries.filter(e => e.isDirectory()).length;
    const files = entries.length - dirs;
    return (lines.length > 0 ? lines.join('\n') : '(empty directory)') +
      '\n\n' + dirs + ' director' + (dirs === 1 ? 'y' : 'ies') +
      ', ' + files + ' file' + (files === 1 ? '' : 's');
  }

  const content = await readFile(resolved, 'utf-8');
  const lines = content.split('\n');
  if (offset !== undefined && offset !== null) {
    const start = offset;
    const end = limit !== undefined ? start + limit : lines.length;
    const selected = lines.slice(start, end);
    return '(Lines ' + (start + 1) + '-' + (start + selected.length) + ' of ' + lines.length + ')\n' +
      selected.map((l, i) => (start + i + 1) + ': ' + l).join('\n');
  }
  return content;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Write Tool
// ═══════════════════════════════════════════════════════════════════════════════

async function executeWrite(filePath, content, cwd) {
  const resolved = resolvePath(filePath, cwd);
  const dir = path.dirname(resolved);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(resolved, content, 'utf-8');
  return 'Written ' + content.length + ' bytes to ' + filePath;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Edit Tool
// ═══════════════════════════════════════════════════════════════════════════════

async function executeEdit(filePath, oldString, newString, replaceAll, cwd) {
  const resolved = resolvePath(filePath, cwd);
  const content = await readFile(resolved, 'utf-8');
  if (replaceAll) {
    if (!content.includes(oldString)) throw new Error('oldString not found in content');
    const count = (content.match(new RegExp(escapeRegex(oldString), 'g')) || []).length;
    await writeFile(resolved, content.replaceAll(oldString, newString), 'utf-8');
    return 'Replaced ' + count + ' occurrence(s)';
  }
  const idx = content.indexOf(oldString);
  if (idx === -1) throw new Error('oldString not found in content');
  if (content.indexOf(oldString, idx + 1) !== -1) throw new Error('Multiple matches — provide more context or use replaceAll');
  await writeFile(resolved, content.replace(oldString, newString), 'utf-8');
  return 'Replaced 1 occurrence';
}

// ═══════════════════════════════════════════════════════════════════════════════
// Glob Tool — recursive file matching
// ═══════════════════════════════════════════════════════════════════════════════

async function executeGlob(pattern, root, cwd) {
  const base = root ? resolvePath(root, cwd) : (cwd || process.cwd());
  const results = [];
  const regex = globToRegex(pattern);

  async function walk(dir) {
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); }
    catch { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(base, full).replace(/\\/g, '/');
      if (regex.test(rel)) results.push(rel);
      if (entry.isDirectory() && !entry.name.startsWith('.') && !SKIP_DIRS.has(entry.name)) {
        if (pattern.includes('**')) await walk(full);
        else if (pattern.includes('/')) {
          const depth = rel.split('/').length;
          const patDepth = pattern.split('/').length;
          if (depth < patDepth) await walk(full);
        }
      }
    }
  }
  await walk(base);
  return results.length > 0 ? results.join('\n') : '(no matches)';
}

// ═══════════════════════════════════════════════════════════════════════════════
// Grep Tool — regex content search
// ═══════════════════════════════════════════════════════════════════════════════

async function executeGrep(pattern, include, searchPath, cwd) {
  const base = searchPath ? resolvePath(searchPath, cwd) : (cwd || process.cwd());
  const regex = new RegExp(pattern, 'i');
  const includeRegex = include ? globToRegex(include) : null;
  const results = [];

  async function walk(dir) {
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); }
    catch { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && !SKIP_DIRS.has(entry.name)) await walk(full);
      } else if (entry.isFile()) {
        if (includeRegex && !includeRegex.test(entry.name)) continue;
        let content;
        try { content = await readFile(full, 'utf-8'); }
        catch { continue; }
        if (content.includes('\x00')) continue; // skip binary
        const lines = content.split('\n');
        const matches = [];
        for (let i = 0; i < lines.length && matches.length < 20; i++) {
          if (regex.test(lines[i])) matches.push((i + 1) + ': ' + lines[i].trim());
        }
        if (matches.length > 0) {
          const relPath = path.relative(base, full).replace(/\\/g, '/');
          results.push(relPath + '\n' + matches.join('\n'));
        }
      }
    }
  }
  await walk(base);
  return results.length > 0 ? results.join('\n\n') : '(no matches)';
}

// ═══════════════════════════════════════════════════════════════════════════════
// TodoWrite Tool
// ═══════════════════════════════════════════════════════════════════════════════

function executeTodoWrite(todos) {
  if (!todos || todos.length === 0) return 'Usage: Provide a non-empty array of todo items.';
  const icons = { pending: '[ ]', in_progress: '[~]', completed: '[x]', cancelled: '[-]' };
  return todos.map(t => (icons[t.status] || '?') + ' [' + (t.priority || '') + '] ' + t.content).join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════════
// WebFetch Tool
// ═══════════════════════════════════════════════════════════════════════════════

async function executeWebFetch(url) {
  if (!url.startsWith('http')) throw new Error('Invalid URL: ' + url);
  const http = url.startsWith('https') ? require('https') : require('http');
  return new Promise((resolve, reject) => {
    http.get(url, { headers: { 'User-Agent': 'CodeYangX/0.3.0' } }, (res) => {
      if (res.statusCode >= 400) return reject(new Error('HTTP ' + res.statusCode));
      let data = '';
      res.on('data', (c) => { data += c; if (data.length > 100000) res.destroy(); });
      res.on('end', () => {
        const text = data.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 50000);
        resolve(text || '(empty response)');
      });
    }).on('error', reject);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// MathSolve — Middle school math problem solver
// ═══════════════════════════════════════════════════════════════════════════════

async function executeMathSolve(problem, type) {
  const p = (problem || '').trim();

  if (type === 'linear' || (p.match(/^[\d\sxX+\-*/.()=]+$/) && p.includes('=') && !p.includes('^'))) {
    return solveLinear(p);
  }
  if (type === 'quadratic' || /\bx\s*(?:\*\*\s*2|\^2|²)/.test(p) || /\bx²\b/.test(p)) {
    return solveQuadratic(p);
  }
  if (type === 'system' || (p.includes('\n') && p.match(/=.*\n.*=/))) {
    return solveSystem(p);
  }
  if (type === 'pythagorean' || /(?:勾股|pythagorean|直角|\(a=\d|\(b=\d|\(c=\d)/i.test(p) || /a\s*=\s*\d.*b\s*=\s*\d|a\s*=\s*\d.*c\s*=\s*\d|b\s*=\s*\d.*c\s*=\s*\d/i.test(p)) {
    return solvePythagorean(p);
  }
  if (type === 'circle' || /\b(?:circle|圆|半径|直径|radius|diameter|周长|面积|circumference|area)\b/i.test(p)) {
    return solveCircle(p);
  }
  if (type === 'stats' || /\b(?:平均|中位|众数|方差|mean|median|mode|variance|range|std)\b/i.test(p)) {
    return solveStats(p);
  }
  if (type === 'percent' || /[%％]/.test(p)) {
    return solvePercent(p);
  }
  if (type === 'trig' || /\b(?:sin|cos|tan|sine|cosine|正弦|余弦|正切|角度|triangle|三角|deg|rad|degree)\b/i.test(p)) {
    return solveTrig(p);
  }
  if (type === 'sequence' || /\b(?:等差|等比|数列|sequence|通项|求和|a1|Sn|d=|q=)\b/i.test(p)) {
    return solveSequence(p);
  }
  if (type === 'coord' || /\b(?:坐标|距离|中点|斜率|distance|midpoint|slope|点.*[，,]\s*\d)\b/i.test(p)) {
    return solveCoordinate(p);
  }

  return 'Unknown problem type. Please specify a type:\n' +
    '- **linear**: 一元一次方程, e.g. "3x + 5 = 20"\n' +
    '- **quadratic**: 一元二次方程, e.g. "x² + 3x - 4 = 0"\n' +
    '- **system**: 二元一次方程组\n' +
    '- **pythagorean**: 勾股定理, e.g. "a=3 b=4 c=?"\n' +
    '- **circle**: 圆的计算, e.g. "radius=5"\n' +
    '- **stats**: 统计, e.g. "mean [2,5,8,3,7]" or "中位数 2 5 8 3 7"\n' +
    '- **percent**: 百分比, e.g. "80% of 250"\n' +
    '- **trig**: 三角函数, e.g. "sin A=0.5"\n' +
    '- **sequence**: 数列, e.g. "arithmetic a1=3 d=2 n=10"\n' +
    '- **coord**: 坐标几何, e.g. "distance (1,2) (4,6)"';
}

// ─── Linear Equations ─────────────────────────────────────────────────────────

function solveLinear(expr) {
  const lines = ['## 解一元一次方程', '\n方程: `' + expr + '`\n'];
  const cleaned = expr.replace(/\s+/g, '').replace(/[xX]/g, 'x');

  // Try "ax + b = c" pattern
  let m = cleaned.match(/^([+-]?\d*\.?\d*)x([+-]\d+\.?\d*)=([+-]?\d+\.?\d*)$/);
  if (m) {
    const a = parseFloat(m[1]) || 1;
    const b = parseFloat(m[2]);
    const c = parseFloat(m[3]);
    lines.push('### 步骤');
    lines.push('1. 移项: ' + a + 'x = ' + c + ' - (' + b + ')');
    const rhs = c - b;
    lines.push('   ' + a + 'x = ' + rhs);
    lines.push('2. 两边除以' + a + ': x = ' + rhs + ' \u00f7 ' + a);
    const x = rhs / a;
    lines.push('   **x = ' + x + '**');
    lines.push('\n### 检验');
    const check = a * x + b;
    lines.push('左边 = ' + a + '\u00d7' + x + ' + (' + b + ') = ' + check);
    lines.push('右边 = ' + c);
    lines.push(Math.abs(check - c) < 1e-10 ? '  ✓ 左边 = 右边' : '  ✗ 不相等');
    return lines.join('\n');
  }

  // Try "x + b = c" pattern
  m = cleaned.match(/^x([+-]\d+\.?\d*)=([+-]?\d+\.?\d*)$/);
  if (m) {
    const b = parseFloat(m[1]);
    const c = parseFloat(m[2]);
    const x = c - b;
    lines.push('### 步骤');
    lines.push('1. 移项: x = ' + c + ' - (' + b + ')');
    lines.push('   **x = ' + x + '**');
    lines.push('\n### 检验');
    lines.push('左边 = ' + x + ' + (' + b + ') = ' + (x + b));
    lines.push('右边 = ' + c);
    lines.push(Math.abs(x + b - c) < 1e-10 ? '  ✓ 左边 = 右边' : '  ✗ 不相等');
    return lines.join('\n');
  }

  return 'Could not parse equation format. Expected format: "ax + b = c" or "x + b = c". Try: `3x + 5 = 20`';
}

// ─── Quadratic Equations ──────────────────────────────────────────────────────

function solveQuadratic(expr) {
  const lines = ['## 解一元二次方程', '\n方程: `' + expr + '`\n'];
  const cleaned = expr.replace(/\s+/g, '').replace(/[²^2]/g, '\xB2').replace(/\*\*/g, '').replace(/[xX]/g, 'x');

  // Parse: "ax² + bx + c = 0"
  const m = cleaned.match(/([-+]?\d*\.?\d*)x\xB2([-+]\d*\.?\d*)x([-+]\d*\.?\d*)=([-+]?\d*\.?\d*)/);
  if (!m) return 'Could not parse. Expected format: "ax\u00B2 + bx + c = 0". Try: `x\u00B2 - 3x + 2 = 0`';

  const a = parseFloat(m[1]) || 1;
  const b = parseFloat(m[2]) || 0;
  const c = parseFloat(m[3]) - parseFloat(m[4]);
  const disc = b * b - 4 * a * c;

  lines.push('a = ' + a + ', b = ' + b + ', c = ' + c);
  lines.push('\n### 步骤');
  lines.push('1. 判别式 \u0394 = b\u00B2 - 4ac = ' + b + '\u00B2 - 4\u00d7' + a + '\u00d7(' + c + ') = ' + disc);

  if (disc < 0) {
    lines.push('   无实数解');
  } else if (disc === 0) {
    const x = -b / (2 * a);
    lines.push('2. 两个相等实根: x = -b/(2a) = **x = ' + x + '**');
  } else {
    const sqrtD = Math.sqrt(disc);
    const x1 = (-b + sqrtD) / (2 * a);
    const x2 = (-b - sqrtD) / (2 * a);
    lines.push('2. 两个不等实根:');
    lines.push('   x\u2081 = (-b + \u221A\u0394)/(2a) = (' + (-b) + ' + ' + sqrtD.toFixed(4) + ')/(' + (2 * a) + ') = **' + x1 + '**');
    lines.push('   x\u2082 = (-b - \u221A\u0394)/(2a) = (' + (-b) + ' - ' + sqrtD.toFixed(4) + ')/(' + (2 * a) + ') = **' + x2 + '**');
  }
  return lines.join('\n');
}

// ─── System of Equations ──────────────────────────────────────────────────────

function solveSystem(expr) {
  const lines = ['## 解二元一次方程组', '\n方程组:\n' + expr.trim() + '\n'];
  const eqs = expr.trim().split('\n').filter(l => l.trim());

  if (eqs.length < 2) return 'Need two equations. Format: each equation on a separate line.';

  try {
    // Parse both equations into ax + by = c form
    const parsed = eqs.map(eq => parseLinearEq(eq));
    const [e1, e2] = parsed;

    lines.push('整理得:');
    lines.push(e1.a + 'x + ' + e1.b + 'y = ' + e1.c);
    lines.push(e2.a + 'x + ' + e2.b + 'y = ' + e2.c);

    const det = e1.a * e2.b - e2.a * e1.b;
    if (Math.abs(det) < 1e-10) return lines.join('\n') + '\n方程组有无穷多解或无解（系数行列式为0）';

    const x = (e1.c * e2.b - e2.c * e1.b) / det;
    const y = (e1.a * e2.c - e2.a * e1.c) / det;

    lines.push('\n### 解');
    lines.push('x = **' + x + '**');
    lines.push('y = **' + y + '**');
  } catch (e) {
    lines.push('解析错误: ' + (e.message || 'Please check format. Each line should be: ax + by = c'));
  }

  return lines.join('\n');
}

function parseLinearEq(eq) {
  const cleaned = eq.replace(/\s+/g, '').replace(/[xX]/g, 'x').replace(/[yY]/g, 'y');
  // Match: "ax + by = c" or "x + y = c" (with implicit 1 coefficients)
  const m = cleaned.match(/^([+-]?\d*\.?\d*)x([+-]\d*\.?\d*)y=([+-]?\d*\.?\d*)$/);
  if (!m) throw new Error('Expected format: "ax + by = c"');
  const a = parseFloat(m[1]) || (m[1] === '-' ? -1 : 1);
  const b = parseFloat(m[2]) || (m[2] === '-' ? -1 : (m[2] === '+' ? 1 : 1));
  const c = parseFloat(m[3]);
  return { a, b, c };
}

// ─── Pythagorean Theorem ──────────────────────────────────────────────────────

function solvePythagorean(expr) {
  const lines = ['## 勾股定理', '\n' + expr + '\n'];
  const av = /a\s*[=＝]\s*([\d.]+)/.exec(expr);
  const bv = /b\s*[=＝]\s*([\d.]+)/.exec(expr);
  const cv = /c\s*[=＝]\s*([\d.]+)/.exec(expr);
  const a = av ? parseFloat(av[1]) : null;
  const b = bv ? parseFloat(bv[1]) : null;
  const c = cv ? parseFloat(cv[1]) : null;

  lines.push('公式: a\u00B2 + b\u00B2 = c\u00B2');

  if (a !== null && b !== null && c === null) {
    const result = Math.sqrt(a * a + b * b);
    lines.push('\nc = \u221A(' + a + '\u00B2 + ' + b + '\u00B2) = \u221A(' + (a * a + b * b) + ') = **' + result.toFixed(4) + '**');
    lines.push('\n判断: ' + a + '\u00B2 + ' + b + '\u00B2 = ' + (a * a) + ' + ' + (b * b) + ' = ' + (a * a + b * b));
    lines.push('c\u00B2 = ' + (result * result).toFixed(4));
  } else if (a !== null && c !== null && b === null) {
    const result = Math.sqrt(c * c - a * a);
    lines.push('\nb = \u221A(' + c + '\u00B2 - ' + a + '\u00B2) = \u221A(' + (c * c - a * a) + ') = **' + result.toFixed(4) + '**');
  } else if (b !== null && c !== null && a === null) {
    const result = Math.sqrt(c * c - b * b);
    lines.push('\na = \u221A(' + c + '\u00B2 - ' + b + '\u00B2) = \u221A(' + (c * c - b * b) + ') = **' + result.toFixed(4) + '**');
  } else {
    lines.push('\nUsage: provide two sides, e.g. `a=3 b=4 c=?` or `a=3 c=5`');
  }

  return lines.join('\n');
}

// ─── Circle ───────────────────────────────────────────────────────────────────

function solveCircle(expr) {
  const lines = ['## 圆的计算'];
  const rv = /(?:radius|r)\s*[=＝]\s*([\d.]+)/i.exec(expr);
  const dv = /(?:diameter|d)\s*[=＝]\s*([\d.]+)/i.exec(expr);
  let r;

  if (rv) r = parseFloat(rv[1]);
  else if (dv) r = parseFloat(dv[1]) / 2;
  else {
    lines.push('\nUsage: `radius=5` or `diameter=10`');
    return lines.join('\n');
  }

  lines.push('\n半径 r = ' + r + ', 直径 d = ' + (2 * r));
  lines.push('\n周长 C = 2\u03C0r = 2 \u00d7 3.14159 \u00d7 ' + r + ' = **' + (2 * Math.PI * r).toFixed(3) + '**');
  lines.push('面积 A = \u03C0r\u00B2 = 3.14159 \u00d7 ' + r + '\u00B2 = **' + (Math.PI * r * r).toFixed(3) + '**');
  return lines.join('\n');
}

// ─── Statistics ───────────────────────────────────────────────────────────────

function solveStats(expr) {
  const lines = ['## 统计计算'];
  const nums = expr.match(/-?[\d.]+/g);
  if (!nums || nums.length === 0) {
    lines.push('\nUsage: `mean [2,5,8,3,7]` or `平均数 2 5 8 3 7`');
    return lines.join('\n');
  }

  const data = nums.map(Number).sort((a, b) => a - b);
  const n = data.length;
  const sum = data.reduce((s, v) => s + v, 0);
  const mean = sum / n;

  let median, mode;
  if (n % 2 === 0) median = (data[n / 2 - 1] + data[n / 2]) / 2;
  else median = data[Math.floor(n / 2)];

  const freq = {};
  data.forEach(v => freq[v] = (freq[v] || 0) + 1);
  const maxFreq = Math.max(...Object.values(freq));
  mode = Object.entries(freq).filter(([, v]) => v === maxFreq).map(([k]) => Number(k));

  const variance = data.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);

  lines.push('\n数据: ' + data.join(', '));
  lines.push('个数 n = ' + n);
  lines.push('总和 = ' + sum);
  lines.push('平均数 (mean) = ' + sum + ' / ' + n + ' = **' + mean.toFixed(4) + '**');
  lines.push('中位数 (median) = **' + median + '**');
  lines.push('众数 (mode) = **' + mode.join(', ') + '**');
  lines.push('方差 (variance) = **' + variance.toFixed(4) + '**');
  lines.push('标准差 (std dev.) = **' + std.toFixed(4) + '**');

  return lines.join('\n');
}

// ─── Percent ─────────────────────────────────────────────────────────────────

function solvePercent(expr) {
  const lines = ['## 百分比计算', '\n' + expr + '\n'];
  // "X% of Y" or "百分之X of Y"
  const m1 = /([\d.]+)\s*%\s*(?:of|的)\s*([\d.]+)/.exec(expr);
  // "X is what % of Y" or "X是Y的百分之几"
  const m2 = /([\d.]+)\s*(?:是|is)\s*([\d.]+)\s*(?:的|of)?\s*(?:百分之|%)?\s*(?:几|多少|what)/.exec(expr);

  if (m1) {
    const pct = parseFloat(m1[1]);
    const val = parseFloat(m1[2]);
    const result = val * pct / 100;
    lines.push(pct + '% of ' + val + ' = ' + val + ' \u00d7 ' + pct + ' / 100 = **' + result.toFixed(2) + '**');
  } else if (m2) {
    const a = parseFloat(m2[1]);
    const b = parseFloat(m2[2]);
    const pct = a / b * 100;
    lines.push(a + ' is ' + pct.toFixed(2) + '% of ' + b);
    lines.push('计算: ' + a + ' / ' + b + ' \u00d7 100% = **' + pct.toFixed(2) + '%**');
  } else {
    lines.push('Usage: `80% of 250` or `30 is what % of 120`');
  }

  return lines.join('\n');
}

// ─── Trigonometry ─────────────────────────────────────────────────────────────

function solveTrig(expr) {
  const lines = ['## 三角函数'];
  // "sin A = value" pattern
  const sm = /(?:sin|正弦)\s*[A-Ca-c]\s*[=＝]\s*([\d.]+)/.exec(expr);
  const cm = /(?:cos|余弦)\s*[A-Ca-c]\s*[=＝]\s*([\d.]+)/.exec(expr);
  const tm = /(?:tan|正切)\s*[A-Ca-c]\s*[=＝]\s*([\d.]+)/.exec(expr);

  if (sm) {
    const val = parseFloat(sm[1]);
    if (val < -1 || val > 1) return lines.join('\n') + '\nValues outside [-1, 1] have no real angle';
    const rad = Math.asin(val);
    const deg = rad * 180 / Math.PI;
    lines.push('sin A = ' + val);
    lines.push('A = arcsin(' + val + ') = **' + rad.toFixed(4) + ' rad = ' + deg.toFixed(2) + '\u00B0**');
  } else if (cm) {
    const val = parseFloat(cm[1]);
    if (val < -1 || val > 1) return lines.join('\n') + '\nValues outside [-1, 1] have no real angle';
    const rad = Math.acos(val);
    const deg = rad * 180 / Math.PI;
    lines.push('cos A = ' + val);
    lines.push('A = arccos(' + val + ') = **' + rad.toFixed(4) + ' rad = ' + deg.toFixed(2) + '\u00B0**');
  } else if (tm) {
    const val = parseFloat(tm[1]);
    const rad = Math.atan(val);
    const deg = rad * 180 / Math.PI;
    lines.push('tan A = ' + val);
    lines.push('A = arctan(' + val + ') = **' + rad.toFixed(4) + ' rad = ' + deg.toFixed(2) + '\u00B0**');
  } else {
    lines.push('\nUsage: `sin A=0.5` or `cos A=0.866` or `tan A=1`');
  }

  return lines.join('\n');
}

// ─── Sequences ────────────────────────────────────────────────────────────────

function solveSequence(expr) {
  const lines = ['## 数列计算', '\n' + expr + '\n'];
  const av = /a1\s*[=＝]\s*([\d.]+)/.exec(expr);
  const a1 = av ? parseFloat(av[1]) : null;
  const dv = /d\s*[=＝]\s*([\d.]+)/.exec(expr);
  const qv = /q\s*[=＝]\s*([\d.]+)/.exec(expr);
  const nv = /n\s*[=＝]\s*([\d.]+)/.exec(expr);
  const n = nv ? parseInt(nv[1]) : 10;

  if (dv && a1 !== null) {
    // Arithmetic
    const d = parseFloat(dv[1]);
    const an = a1 + (n - 1) * d;
    const Sn = n * (a1 + an) / 2;
    lines.push('**等差数列** (a1=' + a1 + ', d=' + d + ', n=' + n + ')');
    lines.push('通项 a_n = a1 + (n-1)d');
    lines.push('a_' + n + ' = ' + a1 + ' + ' + (n - 1) + '\u00d7' + d + ' = **' + an + '**');
    lines.push('求和 S_n = n(a1+an)/2');
    lines.push('S_' + n + ' = ' + n + '\u00d7(' + a1 + '+' + an + ')/2 = **' + Sn + '**');
  } else if (qv && a1 !== null) {
    // Geometric
    const q = parseFloat(qv[1]);
    const an = a1 * Math.pow(q, n - 1);
    const Sn = Math.abs(q - 1) < 1e-10 ? n * a1 : a1 * (1 - Math.pow(q, n)) / (1 - q);
    lines.push('**等比数列** (a1=' + a1 + ', q=' + q + ', n=' + n + ')');
    lines.push('通项 a_n = a1 \u00d7 q^(n-1)');
    lines.push('a_' + n + ' = ' + a1 + ' \u00d7 ' + q + '^' + (n - 1) + ' = **' + an + '**');
    lines.push('求和 S_n = a1(1-q^n)/(1-q)');
    lines.push('S_' + n + ' = **' + Sn + '**');
  } else {
    lines.push('Usage: `arithmetic a1=3 d=2 n=10` or `geometric a1=2 q=3 n=5`');
  }

  return lines.join('\n');
}

// ─── Coordinate Geometry ──────────────────────────────────────────────────────

function solveCoordinate(expr) {
  const lines = ['## 坐标几何', '\n' + expr + '\n'];
  const pts = expr.match(/\((-?[\d.]+)\s*[,，]\s*(-?[\d.]+)\)/g);
  if (!pts || pts.length < 2) {
    const distM = /(?:distance|距离).*?\((-?[\d.]+)\s*[,，]\s*(-?[\d.]+)\).*?\((-?[\d.]+)\s*[,，]\s*(-?[\d.]+)\)/.exec(expr);
    if (distM) {
      const x1 = +distM[1], y1 = +distM[2], x2 = +distM[3], y2 = +distM[4];
      const d = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
      lines.push('距离 d = \u221A[(' + x2 + '-' + x1 + ')\u00B2 + (' + y2 + '-' + y1 + ')\u00B2]');
      lines.push('= \u221A(' + (x2 - x1) ** 2 + ' + ' + (y2 - y1) ** 2 + ') = \u221A' + ((x2 - x1) ** 2 + (y2 - y1) ** 2).toFixed(4));
      lines.push('= **' + d.toFixed(4) + '**');
      return lines.join('\n');
    }
    lines.push('Usage: `distance (1,2) (4,6)` or `midpoint (0,0) (6,8)`');
    return lines.join('\n');
  }

  const nums = [];
  for (const p of pts) {
    const m = /\((-?[\d.]+)\s*[,，]\s*(-?[\d.]+)\)/.exec(p);
    if (m) nums.push({ x: +m[1], y: +m[2] });
  }

  if (nums.length >= 2) {
    const p1 = nums[0], p2 = nums[1];
    const d = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
    const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
    const slope = p2.x === p1.x ? '\u221E (垂直)' : ((p2.y - p1.y) / (p2.x - p1.x)).toFixed(4);

    lines.push('点A(' + p1.x + ', ' + p1.y + '), 点B(' + p2.x + ', ' + p2.y + ')');
    lines.push('距离 |AB| = **' + d.toFixed(4) + '**');
    lines.push('中点 = **(' + mx + ', ' + my + ')**');
    lines.push('斜率 k = **' + slope + '**');
  }

  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════════
// MathPlot — SVG chart generation
// ═══════════════════════════════════════════════════════════════════════════════

async function executeMathPlot(kind, outputPath, cwd) {
  const k = (kind || '').toLowerCase();
  const base = cwd || process.cwd();

  // Coordinate plane
  if (k === 'coordinate' || k === 'grid') {
    const svg = generateCoordinateSVG();
    const fp = outputPath || path.join(base, 'coordinate-plane.svg');
    await writeFile(fp, svg);
    return 'SVG coordinate plane saved to: **' + fp + '**\nOpen in browser to view.';
  }

  // Function graph
  if (k.startsWith('func:') || k.startsWith('f:')) {
    const fn = k.split(':').slice(1).join(':');
    return generateFunctionGraph(fn, outputPath, base);
  }

  // Bar chart
  if (k.startsWith('bar:')) {
    const dataStr = k.split(':')[1] || '';
    return generateBarChart(dataStr, outputPath, base);
  }

  // Pie chart
  if (k.startsWith('pie:')) {
    const dataStr = k.split(':')[1] || '';
    return generatePieChart(dataStr, outputPath, base);
  }

  // Scatter plot
  if (k.startsWith('scatter:')) {
    const dataStr = k.split(':')[1] || '';
    return generateScatterPlot(dataStr, outputPath, base);
  }

  return '## MathPlot — SVG \u6570\u5B66\u56FE\u8868\u751F\u6210\n\n' +
    'Usage: `MathPlot <kind>`\n\n' +
    'Available kinds:\n' +
    '- **coordinate** — \u5750\u6807\u7CFB\n' +
    '- **func:<expr>** — \u51FD\u6570\u56FE\u50CF, e.g. `func:x*2+1`\n' +
    '- **bar:<data>** — \u6761\u5F62\u7EDF\u8BA1\u56FE, e.g. `bar:A=5,B=8,C=3`\n' +
    '- **pie:<data>** — \u997C\u56FE, e.g. `pie:A=30,B=20,C=50`\n' +
    '- **scatter:<data>** — \u6563\u70B9\u56FE, e.g. `scatter:(1,2),(3,5),(5,3)`';
}

function generateCoordinateSVG() {
  const w = 400, h = 400, cx = 200, cy = 200, scale = 40;
  let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '">\n';
  svg += '<rect width="' + w + '" height="' + h + '" fill="#fafafa"/>\n';

  // Grid
  for (let i = -5; i <= 5; i++) {
    const x = cx + i * scale;
    svg += '<line x1="' + x + '" y1="0" x2="' + x + '" y2="' + h + '" stroke="' + (i === 0 ? '#333' : '#e0e0e0') + '" stroke-width="' + (i === 0 ? 2 : 1) + '"/>\n';
  }
  for (let i = -5; i <= 5; i++) {
    const y = cy + i * scale;
    svg += '<line x1="0" y1="' + y + '" x2="' + w + '" y2="' + y + '" stroke="' + (i === 0 ? '#333' : '#e0e0e0') + '" stroke-width="' + (i === 0 ? 2 : 1) + '"/>\n';
  }

  // Labels
  svg += '<text x="' + (cx + 5 * scale + 4) + '" y="' + (cy + 16) + '" font-size="12" fill="#333">x</text>\n';
  svg += '<text x="' + (cx + 4) + '" y="' + (cy - 5 * scale - 4) + '" font-size="12" fill="#333">y</text>\n';
  svg += '<text x="' + (cx + 4) + '" y="' + (cy + 4) + '" font-size="12" fill="#333">O</text>\n';

  // Tick marks
  for (let i = -5; i <= 5; i++) {
    if (i === 0) continue;
    svg += '<text x="' + (cx + i * scale - 4) + '" y="' + (cy + 16) + '" font-size="10" fill="#666">' + i + '</text>\n';
    svg += '<text x="' + (cx + 4) + '" y="' + (cy - i * scale + 4) + '" font-size="10" fill="#666">' + i + '</text>\n';
  }

  svg += '</svg>';
  return svg;
}

function generateFunctionGraph(fn, outputPath, base) {
  const w = 500, h = 500, cx = 250, cy = 250, scale = 50;
  // Evaluate function
  const fnClean = fn.replace(/\^/g, '**').replace(/²/g, '**2').replace(/x/g, '(x)');
  let func;
  try { func = new Function('x', 'return ' + fnClean); }
  catch { return 'Invalid function expression: ' + fn; }

  // Test evaluate
  try { func(0); } catch { return 'Error evaluating function at x=0. Check expression: ' + fn; }

  let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '">\n';
  svg += '<rect width="' + w + '" height="' + h + '" fill="#fafafa"/>\n';

  // Grid + axes (same as coordinate)
  for (let i = -5; i <= 5; i++) {
    const x = cx + i * scale;
    svg += '<line x1="' + x + '" y1="0" x2="' + x + '" y2="' + h + '" stroke="' + (i === 0 ? '#333' : '#e0e0e0') + '" stroke-width="' + (i === 0 ? 2 : 1) + '"/>\n';
  }
  for (let i = -5; i <= 5; i++) {
    const y = cy + i * scale;
    svg += '<line x1="0" y1="' + y + '" x2="' + w + '" y2="' + y + '" stroke="' + (i === 0 ? '#333' : '#e0e0e0') + '" stroke-width="' + (i === 0 ? 2 : 1) + '"/>\n';
  }

  // Function line — sample every 0.5 pixels
  let pathData = '';
  const range = 5;
  const steps = w * 2;
  for (let i = 0; i <= steps; i++) {
    const px = i / steps * w;
    const mx = (px - cx) / scale;
    let my;
    try { my = func(mx); } catch { continue; }
    if (!isFinite(my)) continue;
    const py = cy - my * scale;
    if (py < -200 || py > h + 200) continue;
    pathData += (i === 0 ? 'M' : 'L') + ' ' + px + ' ' + py;
  }

  svg += '<path d="' + pathData + '" fill="none" stroke="#e74c3c" stroke-width="2"/>\n';

  // Labels
  svg += '<text x="' + (cx + 5 * scale + 4) + '" y="' + (cy + 16) + '" font-size="12" fill="#333">x</text>\n';
  svg += '<text x="' + (cx + 4) + '" y="' + (cy - 5 * scale - 4) + '" font-size="12" fill="#333">y</text>\n';

  svg += '</svg>';

  const fp = outputPath || path.join(base, 'function-graph.svg');
  fs.writeFileSync(fp, svg);
  return 'Function graph y = ' + fn + ' saved to: **' + fp + '**';
}

function generateBarChart(dataStr, outputPath, base) {
  const pairs = dataStr.split(',').map(s => {
    const [label, val] = s.split('=');
    return { label: (label || '').trim(), value: parseFloat(val) || 0 };
  }).filter(p => p.label);

  if (pairs.length === 0) return 'No data. Format: `bar:A=5,B=8,C=3`';

  const w = 400, h = 300;
  const maxVal = Math.max(...pairs.map(p => p.value), 1);
  const barW = (w - 80) / pairs.length;
  const chartH = h - 60;

  let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '">\n';
  svg += '<rect width="' + w + '" height="' + h + '" fill="#fafafa"/>\n';

  // Axes
  svg += '<line x1="40" y1="10" x2="40" y2="' + (h - 20) + '" stroke="#333" stroke-width="2"/>\n';
  svg += '<line x1="40" y1="' + (h - 20) + '" x2="' + (w - 20) + '" y2="' + (h - 20) + '" stroke="#333" stroke-width="2"/>\n';

  const colors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c'];

  pairs.forEach((p, i) => {
    const x = 45 + i * barW;
    const bh = (p.value / maxVal) * chartH;
    const y = h - 20 - bh;
    svg += '<rect x="' + x + '" y="' + y + '" width="' + (barW - 4) + '" height="' + bh + '" fill="' + colors[i % colors.length] + '"/>\n';
    svg += '<text x="' + (x + barW / 2 - 5) + '" y="' + (y - 4) + '" font-size="11" fill="#333">' + p.value + '</text>\n';
    svg += '<text x="' + (x + barW / 2 - 5) + '" y="' + (h - 4) + '" font-size="11" fill="#333">' + p.label + '</text>\n';
  });

  svg += '</svg>';

  const fp = outputPath || path.join(base, 'bar-chart.svg');
  fs.writeFileSync(fp, svg);
  return 'Bar chart saved to: **' + fp + '**';
}

function generatePieChart(dataStr, outputPath, base) {
  const pairs = dataStr.split(',').map(s => {
    const [label, val] = s.split('=');
    return { label: (label || '').trim(), value: parseFloat(val) || 0 };
  }).filter(p => p.label && p.value > 0);

  if (pairs.length === 0) return 'No data. Format: `pie:A=30,B=20,C=50`';

  const total = pairs.reduce((s, p) => s + p.value, 0);
  const w = 400, h = 400, cx = 200, cy = 200, r = 150;
  const colors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#34495e', '#e67e22'];

  let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '">\n';
  svg += '<rect width="' + w + '" height="' + h + '" fill="#fafafa"/>\n';

  let startAngle = -Math.PI / 2;
  pairs.forEach((p, i) => {
    const angle = (p.value / total) * 2 * Math.PI;
    const endAngle = startAngle + angle;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const largeArc = angle > Math.PI ? 1 : 0;
    const midAngle = startAngle + angle / 2;
    const lx = cx + (r * 0.7) * Math.cos(midAngle);
    const ly = cy + (r * 0.7) * Math.sin(midAngle);

    svg += '<path d="M' + cx + ',' + cy + ' L' + x1 + ',' + y1 + ' A' + r + ',' + r + ' 0 ' + largeArc + ',1 ' + x2 + ',' + y2 + ' Z" fill="' + colors[i % colors.length] + '"/>\n';
    svg += '<text x="' + lx + '" y="' + (ly + 5) + '" font-size="12" fill="#fff" text-anchor="middle">' + p.label + '</text>\n';

    startAngle = endAngle;
  });

  // Legend
  pairs.forEach((p, i) => {
    svg += '<rect x="' + (w - 120) + '" y="' + (20 + i * 22) + '" width="12" height="12" fill="' + colors[i % colors.length] + '"/>\n';
    svg += '<text x="' + (w - 104) + '" y="' + (20 + i * 22 + 11) + '" font-size="11" fill="#333">' + p.label + ': ' + p.value + ' (' + (p.value / total * 100).toFixed(1) + '%)</text>\n';
  });

  svg += '</svg>';

  const fp = outputPath || path.join(base, 'pie-chart.svg');
  fs.writeFileSync(fp, svg);
  return 'Pie chart saved to: **' + fp + '**';
}

function generateScatterPlot(dataStr, outputPath, base) {
  const points = dataStr.match(/\((-?[\d.]+)\s*[,，]\s*(-?[\d.]+)\)/g);
  if (!points || points.length === 0) return 'No data. Format: `scatter:(1,2),(3,5),(5,3),(7,8)`';

  const nums = points.map(p => {
    const m = /\((-?[\d.]+)\s*[,，]\s*(-?[\d.]+)\)/.exec(p);
    return { x: m ? +m[1] : 0, y: m ? +m[2] : 0 };
  });

  const w = 400, h = 400, margin = 50;
  const allX = nums.map(p => p.x), allY = nums.map(p => p.y);
  const minX = Math.min(...allX), maxX = Math.max(...allX);
  const minY = Math.min(...allY), maxY = Math.max(...allY);

  let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '">\n';
  svg += '<rect width="' + w + '" height="' + h + '" fill="#fafafa"/>\n';

  // Axes
  svg += '<line x1="' + margin + '" y1="' + (h - margin) + '" x2="' + (w - margin) + '" y2="' + (h - margin) + '" stroke="#333" stroke-width="2"/>\n';
  svg += '<line x1="' + margin + '" y1="' + margin + '" x2="' + margin + '" y2="' + (h - margin) + '" stroke="#333" stroke-width="2"/>\n';

  // Points
  nums.forEach(p => {
    const px = margin + (p.x - minX) / (maxX - minX || 1) * (w - 2 * margin);
    const py = h - margin - (p.y - minY) / (maxY - minY || 1) * (h - 2 * margin);
    svg += '<circle cx="' + px + '" cy="' + py + '" r="4" fill="#e74c3c"/>\n';
  });

  svg += '</svg>';

  const fp = outputPath || path.join(base, 'scatter-plot.svg');
  fs.writeFileSync(fp, svg);
  return 'Scatter plot (' + nums.length + ' points) saved to: **' + fp + '**';
}

// ═══════════════════════════════════════════════════════════════════════════════
// MathExplain — Chinese middle school math knowledge base
// ═══════════════════════════════════════════════════════════════════════════════

function executeMathExplain(topic) {
  const topicList = [
    { name: '一元一次方程', aliases: ['linear', 'linear equation'], emoji: '📐',
      content: '形式: ax + b = c (a ≠ 0)\n\n解法:\n1. 移项: 将含未知数的项移到左边，常数项移到右边\n2. 合并同类项\n3. 未知数系数化为1\n\n关键: 等式两边同时加上或减去同一个数，等式仍成立。',
      example: '3x + 5 = 20\n解: 3x = 20 - 5 = 15\nx = 15 ÷ 3 = 5\n检验: 3×5 + 5 = 15 + 5 = 20 ✓',
      tips: '- 移项时注意变号 (正变负，负变正)\n- 不要忘记最后检验' },
    { name: '一元二次方程', aliases: ['quadratic', 'quadratic equation'], emoji: '📈',
      content: '形式: ax² + bx + c = 0 (a ≠ 0)\n\n求根公式: x = (-b ± √(b²-4ac)) / (2a)\n\nΔ = b² - 4ac\n- Δ > 0: 两个不等实根\n- Δ = 0: 两个相等实根\n- Δ < 0: 无实数根',
      example: 'x² - 3x + 2 = 0\na=1, b=-3, c=2\nΔ = 9 - 8 = 1 > 0\nx₁ = (3+1)/2 = 2\nx₂ = (3-1)/2 = 1',
      tips: '- 求根公式必须牢记\n- 判断 Δ 的符号确定根的情况\n- 注意 a 的正负号' },
    { name: '勾股定理', aliases: ['pythagorean'], emoji: '📐',
      content: '直角三角形中: a² + b² = c²\n其中 a, b 是直角边，c 是斜边\n\n常见勾股数: (3,4,5), (5,12,13), (8,15,17), (7,24,25)',
      example: '一直角边=3, 另一直角边=4, 求斜边\nc = √(3² + 4²) = √25 = 5',
      tips: '- 斜边总是最长边\n- 勾股数须牢记，可以快速判断直角三角形' },
    { name: '一次函数', aliases: ['linear function', '线性函数'], emoji: '📊',
      content: '形式: y = kx + b (k ≠ 0)\n\nk: 斜率 (表示直线的倾斜程度)\nb: 截距 (与y轴交点的纵坐标)\n\n图像特征:\n- k > 0: 上升 (y随x增大而增大)\n- k < 0: 下降 (y随x增大而减小)\n- k = 0: 水平线',
      example: 'y = 2x + 1\n斜率 k = 2 (上升趋势)\ny轴截距 b = 1 (过点(0,1))\nx轴截距: 令y=0, x = -0.5',
      tips: '- k越大，线越陡\n- 截距是直线与坐标轴的交点\n- 求交点: 联立解方程组' },
    { name: '二次函数', aliases: ['quadratic function'], emoji: '📈',
      content: '形式: y = ax² + bx + c (a ≠ 0)\n\n顶点坐标: (-b/(2a), (4ac-b²)/(4a))\n对称轴: x = -b/(2a)\n\n图像(抛物线):\n- a > 0: 开口向上 (最小值在顶点)\n- a < 0: 开口向下 (最大值在顶点)',
      example: 'y = x² - 4x + 3\na=1, b=-4, c=3\n对称轴 x = 4/2 = 2\n顶点 (2, -1)\n与x轴交点: (1,0) 和 (3,0)',
      tips: '- 画出对称轴是关键\n- 开口方向由 a 决定\n- 配方法求顶点' },
    { name: '圆', aliases: ['circle'], emoji: '⭕',
      content: '定义: 平面上到定点(圆心)距离等于定长(半径)的点的集合\n\n周长 C = 2πr\n面积 S = πr²\n\n弦、弧、圆心角关系:\n等弧⇔等弦⇔等圆心角\n直径是最大的弦',
      example: '半径 r = 5cm\n直径 d = 10cm\n周长 C = 2π×5 ≈ 31.42cm\n面积 S = π×5² ≈ 78.54cm²',
      tips: '- π ≈ 3.14\n- 注意周长与面积的单位\n- 圆心角=弧长/半径 (弧度)' },
    { name: '统计', aliases: ['statistics', 'stats'], emoji: '📊',
      content: '平均数 (Mean): x̄ = Σxi / n\n中位数 (Median): 排序后中间的数\n众数 (Mode): 出现次数最多的数\n\n方差: s² = Σ(xi - x̄)² / n\n标准差: s = √(方差)',
      example: '数据: 2, 5, 8, 3, 7\n排序: 2, 3, 5, 7, 8\n平均数 = (2+5+8+3+7)/5 = 5\n中位数 = 5\n众数: 无重复',
      tips: '- 均值受异常值影响大\n- 中位数对有异常值的数据更适合\n- 标准差反映数据离散程度' },
    { name: '概率', aliases: ['probability'], emoji: '🎲',
      content: 'P(事件) = 事件包含的结果数 / 所有可能的结果数\n\n必然事件: P = 1\n不可能事件: P = 0\n随机事件: 0 < P < 1\n\n对立事件: P(A) + P(非A) = 1',
      example: '掷一个骰子\nP(偶数) = 3/6 = 1/2\nP(大于4) = 2/6 = 1/3\nP(不大于2) = 2/6 = 1/3',
      tips: '- 等可能条件下才能直接数个数\n- 注意"至少""至多"的表述\n- 学会列出所有可能情况' }
  ];

  const lines = ['## 初中数学知识库\n'];

  if (!topic) {
    lines.push('Available topics:');
    lines.push('');
    for (const t of topicList) {
      lines.push('- **' + t.name + '** — ' + t.content.split('\n')[0]);
    }
    lines.push('\nUse `MathExplain <topic>` for detailed reference.');
    return lines.join('\n');
  }

  const t = topic.toLowerCase().trim();
  for (const entry of topicList) {
    if (entry.name === t || entry.aliases.some(a => a.toLowerCase() === t)) {
      lines.push('## ' + entry.emoji + '  ' + entry.name);
      lines.push('');
      lines.push(entry.content);
      lines.push('');
      lines.push('### 例题');
      lines.push(entry.example);
      lines.push('');
      lines.push('### 易错提醒');
      lines.push(entry.tips);
      return lines.join('\n');
    }
  }

  return 'Unknown topic: "' + topic + '". Use `MathExplain` without arguments to see available topics.';
}

// ═══════════════════════════════════════════════════════════════════════════════
// Qt Tools — Simplified implementations for desktop mode
// ═══════════════════════════════════════════════════════════════════════════════

async function executeQtBuild(buildSystem, target, cwd) {
  const base = cwd || process.cwd();
  const proFiles = fs.readdirSync(base).filter(f => f.endsWith('.pro'));
  const cmakeFiles = fs.readdirSync(base).filter(f => f === 'CMakeLists.txt');

  let lines = ['## Qt Build Tool\n'];
  lines.push('Detected: ' + (proFiles.length > 0 ? proFiles.join(', ') : cmakeFiles.length > 0 ? 'CMakeLists.txt' : 'No Qt project found'));

  if (buildSystem === 'qmake' || (buildSystem === 'auto' && proFiles.length > 0)) {
    lines.push('\nRunning qmake...');
    try {
      const output = await executeBash('qmake ' + (proFiles[0] || ''), base);
      lines.push('\n```\n' + output.slice(0, 2000) + '\n```');
      lines.push('\nRunning make ' + (target || '') + '...');
      const makeOutput = await executeBash('make ' + (target || ''), base);
      lines.push('\n```\n' + makeOutput.slice(0, 3000) + '\n```');
    } catch { lines.push('\nError: qmake or make failed.'); }
  } else if (buildSystem === 'cmake' || (buildSystem === 'auto' && cmakeFiles.length > 0)) {
    lines.push('\nRunning cmake...');
    try {
      const output = await executeBash('cmake --build . --target ' + (target || 'all'), base);
      lines.push('\n```\n' + output.slice(0, 3000) + '\n```');
    } catch { lines.push('\nError: cmake build failed.'); }
  }

  return lines.join('\n');
}

async function executeQtSignals(cwd) {
  const base = cwd || process.cwd();
  const lines = ['## Qt Signal-Slot Analysis\n'];

  // Search for connect() calls in .cpp/.h files
  const cppFiles = [];
  async function walk(dir) {
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory() && !e.name.startsWith('.') && !SKIP_DIRS.has(e.name)) await walk(full);
      else if (e.name.endsWith('.cpp') || e.name.endsWith('.h') || e.name.endsWith('.hpp')) cppFiles.push(full);
    }
  }
  await walk(base);

  let total = 0, oldStyle = 0, newStyle = 0;
  for (const fp of cppFiles.slice(0, 50)) {
    let content;
    try { content = await readFile(fp, 'utf-8'); } catch { continue; }
    const connLines = content.split('\n').filter(l => l.includes('connect('));
    for (const l of connLines) {
      total++;
      if (l.includes('SIGNAL(') || l.includes('SLOT(')) oldStyle++;
      else newStyle++;
    }
  }

  lines.push('Scanned ' + cppFiles.length + ' files, found ' + total + ' connect() calls');
  lines.push('- Old-style (SIGNAL/SLOT macros): **' + oldStyle + '**' + (oldStyle > 0 ? ' (consider migrating to Qt5 syntax)' : ''));
  lines.push('- New-style (function pointers): **' + newStyle + '**\n');

  if (oldStyle > 0) {
    lines.push('### Migration Guide');
    lines.push('Old: `connect(sender, SIGNAL(clicked()), receiver, SLOT(onClicked()));`');
    lines.push('New: `connect(sender, &Sender::clicked, receiver, &Receiver::onClicked);`');
    lines.push('New with lambda: `connect(sender, &Sender::clicked, this, [this]() { ... });`');
  }

  return lines.join('\n');
}

async function executeQtProFile(proPath, cwd) {
  const resolved = proPath ? resolvePath(proPath, cwd) : path.join(cwd || process.cwd(), fs.readdirSync(cwd || process.cwd()).find(f => f.endsWith('.pro')) || '');
  if (!fs.existsSync(resolved)) return 'No .pro file found. Specify path or run from a Qt project directory.';

  const content = fs.readFileSync(resolved, 'utf-8');
  const lines = ['## Qt .pro File Analysis: ' + path.basename(resolved), ''];

  // Parse Qt modules
  const qtMod = content.match(/QT\s*\+=\s*(.+)/);
  if (qtMod) lines.push('**Qt Modules**: ' + qtMod[1].trim());

  const config = content.match(/CONFIG\s*\+=\s*(.+)/);
  if (config) lines.push('**Config**: ' + config[1].trim());

  const target = content.match(/TARGET\s*=\s*(.+)/);
  if (target) lines.push('**Target**: ' + target[1].trim());

  const template = content.match(/TEMPLATE\s*=\s*(.+)/);
  if (template) lines.push('**Template**: ' + template[1].trim());

  // Source/header counts
  const sources = (content.match(/\.cpp\b/g) || []).length;
  const headers = (content.match(/\.h\b/g) || []).length;
  const forms = (content.match(/\.ui\b/g) || []).length;
  lines.push('\n**Files**: ~' + sources + ' sources, ~' + headers + ' headers, ~' + forms + ' UI forms');

  lines.push('\n```\n' + content.slice(0, 3000) + '\n```');
  return lines.join('\n');
}

async function executeQtMigration(cwd) {
  const base = cwd || process.cwd();
  const lines = ['## Qt5 → Qt6 Migration Guide', '', 'Checking project at: ' + base, ''];

  const rules = [
    { rule: 'Deprecated types', qt5: 'QTextCodec', qt6: 'Removed. Use QStringConverter / QTextCodec::availableCodecs() removed' },
    { rule: 'QDesktopWidget', qt5: 'QDesktopWidget', qt6: 'Removed. Use QScreen instead: QGuiApplication::primaryScreen()' },
    { rule: 'QRegExp', qt5: 'QRegExp', qt6: 'Deprecated. Use QRegularExpression (in QtCore)' },
    { rule: 'QString::SkipEmptyParts', qt5: 'QString::SkipEmptyParts', qt6: 'Renamed to Qt::SkipEmptyParts' },
    { rule: 'High-DPI', qt5: 'AA_EnableHighDpiScaling', qt6: 'Always enabled by default. Remove manual scaling code.' },
    { rule: 'QDateTime', qt5: 'QDateTime::fromString()', qt6: 'Stricter date parsing. Check format string compatibility.' },
    { rule: 'Containers', qt5: 'QLinkedList, QVector', qt6: 'QLinkedList removed. QVector = QList. Use std::vector or QList.' },
    { rule: 'OpenGL', qt5: 'QOpenGLWidget', qt6: 'Use QRhi + QQuickWindow or QOpenGLWidget (still available with Qt::OpenGL)' },
    { rule: 'QTextStream', qt5: 'setCodec()', qt6: 'Removed. QStringConverter handles encoding conversion.' },
    { rule: 'QProcess', qt5: 'QProcess::start()', qt6: 'Deprecated overloads removed. Use start(QString, QStringList) or startCommand().' },
    { rule: 'qrand() / qsrand()', qt5: 'qrand() / qsrand()', qt6: 'Removed. Use QRandomGenerator.' },
    { rule: 'QMap/QHash', qt5: 'QHash::unite()', qt6: 'Renamed to QHash::insert(). QMultiMap → QMultiHash preferred.' },
  ];

  for (const r of rules) {
    lines.push('### ' + r.rule);
    lines.push('- Qt5: `' + r.qt5 + '`');
    lines.push('- Qt6: `' + r.qt6 + '`');
    lines.push('');
  }

  // Scan for usage
  lines.push('### Scan Results');
  try {
    const grepOut = await executeGrep('QDesktopWidget|QRegExp|QTextCodec|SkipEmptyParts|qrand|qsrand|QMatrix', '*.{cpp,h,hpp}', base, base);
    lines.push('\n```\n' + grepOut.slice(0, 5000) + '\n```');
  } catch { /* ignore */ }

  return lines.join('\n');
}

function executeQtUi(filePath, cwd) {
  const resolved = filePath ? resolvePath(filePath, cwd) : '';
  if (!resolved || !fs.existsSync(resolved)) return '## Qt UI Analysis\n\nUsage: `QtUi <.ui file path>`\n\nProvide the path to a .ui form file to analyze.';

  const content = fs.readFileSync(resolved, 'utf-8');
  const lines = ['## Qt UI Form Analysis: ' + path.basename(resolved), ''];

  // Count widgets
  const widgetCount = (content.match(/<widget\b/g) || []).length;
  const layoutCount = (content.match(/<layout\b/g) || []).length;
  const connectionCount = (content.match(/<connection>/g) || []).length;
  const propertyCount = (content.match(/<property\b/g) || []).length;

  lines.push('**Widgets**: ' + widgetCount);
  lines.push('**Layouts**: ' + layoutCount);
  lines.push('**Signal-slot connections**: ' + connectionCount);
  lines.push('**Properties**: ' + propertyCount);
  lines.push('');

  // Extract widget names
  const names = content.match(/<widget[^>]*name="([^"]+)"/g);
  if (names) {
    lines.push('### Widget Tree');
    const uniqueNames = [...new Set(names.map(n => n.match(/name="([^"]+)"/)[1]))];
    for (const n of uniqueNames.slice(0, 50)) {
      lines.push('- ' + n);
    }
    if (uniqueNames.length > 50) lines.push('... and ' + (uniqueNames.length - 50) + ' more');
  }

  lines.push('\n### Raw XML');
  lines.push('```xml\n' + content.slice(0, 5000) + '\n```');
  return lines.join('\n');
}

function executeQtQml(filePath, cwd) {
  const resolved = filePath ? resolvePath(filePath, cwd) : '';
  if (!resolved || !fs.existsSync(resolved)) return '## Qt QML Analysis\n\nUsage: `QtQml <.qml file path>`\n\nProvide the path to a QML file to analyze.';

  const content = fs.readFileSync(resolved, 'utf-8');
  const lines = ['## Qt QML Analysis: ' + path.basename(resolved), ''];

  const importCount = (content.match(/^import\b/gm) || []).length;
  const componentCount = (content.match(/\b[A-Z]\w+\s*\{/g) || []).length;
  const idCount = (content.match(/\bid:\s*\w+/g) || []).length;
  const signalCount = (content.match(/\bsignal\b/g) || []).length;
  const propertyCount = (content.match(/\bproperty\b/g) || []).length;

  lines.push('**Imports**: ' + importCount);
  lines.push('**Components**: ' + componentCount);
  lines.push('**IDs**: ' + idCount);
  lines.push('**Signals**: ' + signalCount);
  lines.push('**Properties**: ' + propertyCount);

  // List imports
  const imports = content.match(/^import\b.*$/gm);
  if (imports) {
    lines.push('\n### Imports');
    for (const imp of imports) lines.push('- `' + imp.trim() + '`');
  }

  lines.push('\n```qml\n' + content.slice(0, 5000) + '\n```');
  return lines.join('\n');
}

function executeQtTestGen(filePath, cwd) {
  return '## Qt Test Generator (Desktop)\n\n' +
    'This tool generates QTest boilerplate from C++ headers.\n' +
    'In desktop mode, the tool analyzes source files and creates test skeletons.\n\n' +
    'Usage: `QtTestGen <source header or directory>`\n\n' +
    'Example generated test:\n' +
    '```cpp\n' +
    '#include <QtTest>\n' +
    '#include "myclass.h"\n\n' +
    'class TestMyClass : public QObject {\n' +
    '    Q_OBJECT\n' +
    'private slots:\n' +
    '    void testConstructor();\n' +
    '    void testMethodName();\n' +
    '};\n```';
}

function executeQtTestRunner(target, cwd) {
  return '## Qt Test Runner (Desktop)\n\n' +
    'In CLI mode, the test runner executes QTest binaries and parses XML output.\n\n' +
    'To run tests in desktop mode:\n' +
    '- Build your test target with QtTest\n' +
    '- Run it manually and check the output\n' +
    '- Use the Makefile target: `make check` or `make test`\n\n' +
    'Target: ' + (target || '(none specified)');
}

function executeQtCoverage(cwd) {
  return '## Qt Coverage Analysis\n\n' +
    'Coverage analysis for Qt test files.\n' +
    'Analyzes test file coverage against source files.\n' +
    'In desktop mode, use gcov/lcov for C++ coverage analysis.\n\n' +
    'Recommended: `lcov --capture --directory . --output-file coverage.info`';
}

function executeQtGraphics(cwd) {
  return '## Qt Graphics Guide\n\n' +
    '### QPainter Best Practices\n' +
    '- Only use QPainter inside paintEvent() or paint()\n' +
    '- Save/restore painter state with QPainter::save() / restore()\n' +
    '- Use QPainterPath for complex shapes\n' +
    '- Enable antialiasing: `painter.setRenderHint(QPainter::Antialiasing)`\n' +
    '- Use QPixmap for drawing, QImage for pixel manipulation\n\n' +
    '### Common Anti-patterns\n' +
    '- **Don\'t** use QPainter outside of paint events\n' +
    '- **Don\'t** forget to call begin()/end() on QPainter outside paintEvent\n' +
    '- **Don\'t** create QPixmap/QImage in a tight loop - cache them\n' +
    '- **Do** use QPixmapCache for frequently used pixmaps';
}

function executeQtCharts(kind, cwd) {
  const lines = ['## Qt Charts Reference', ''];

  if (kind === 'line') {
    lines.push('### QLineSeries', '```cpp', '#include <QtCharts>', '', 'QLineSeries *series = new QLineSeries();', 'series->append(0, 6);', 'series->append(2, 4);', 'series->append(3, 8);', '', 'QChart *chart = new QChart();', 'chart->addSeries(series);', 'chart->createDefaultAxes();', '', 'QChartView *view = new QChartView(chart);', 'view->setRenderHint(QPainter::Antialiasing);', '```');
  } else if (kind === 'bar') {
    lines.push('### QBarSeries', '```cpp', 'QBarSet *set0 = new QBarSet("Data");', '*set0 << 5 << 8 << 3 << 6;', '', 'QBarSeries *series = new QBarSeries();', 'series->append(set0);', '', 'QChart *chart = new QChart();', 'chart->addSeries(series);', 'QBarCategoryAxis *axisX = new QBarCategoryAxis();', 'axisX->append({"A","B","C","D"});', 'chart->addAxis(axisX, Qt::AlignBottom);', '', 'QChartView *view = new QChartView(chart);', '```');
  } else {
    lines.push('Usage: `QtCharts <kind>` — line, bar, pie, scatter');
  }

  return lines.join('\n');
}

function executeQtMath(expr, cwd) {
  const lines = ['## Qt Math Utilities', ''];
  lines.push('### Common Qt Math Functions');
  lines.push('```cpp');
  lines.push('#include <QtMath>');
  lines.push('');
  lines.push('// Constants');
  lines.push('qreal pi = M_PI;          // \u03C0');
  lines.push('qreal e = M_E;            // e');
  lines.push('');
  lines.push('// Basic');
  lines.push('double abs  = qAbs(-5.2);   // 5.2');
  lines.push('double max  = qMax(a, b);   // maximum');
  lines.push('double min  = qMin(a, b);   // minimum');
  lines.push('double bound = qBound(min, val, max); // clamped');
  lines.push('');
  lines.push('// Trigonometry (radians)');
  lines.push('double s = qSin(angle);     // sine');
  lines.push('double c = qCos(angle);     // cosine');
  lines.push('double t = qTan(angle);     // tangent');
  lines.push('double a = qAtan2(y, x);   // arc tangent');
  lines.push('');
  lines.push('// Rounding');
  lines.push('int r = qRound(3.7);       // 4');
  lines.push('int f = qFloor(3.7);       // 3');
  lines.push('int c = qCeil(3.2);        // 4');
  lines.push('');
  lines.push('// Power and root');
  lines.push('double p = qPow(x, y);     // x^y');
  lines.push('double s = qSqrt(16.0);    // 4');
  lines.push('double c = qCbrt(27.0);    // 3');
  lines.push('```');

  if (expr) {
    lines.push('\n### Evaluation: `' + expr + '`');
    try {
      const safe = expr.replace(/([^+\-*/.%\d\s()])/g, '');
      const result = eval(safe);
      lines.push('Result: **' + result + '**');
    } catch {
      lines.push('Could not evaluate expression.');
    }
  }

  return lines.join('\n');
}

function executeQtModelView(cwd) {
  return '## Qt Model/View Guide\n\n' +
    '### Architecture\n' +
    '- **Model**: Provides data (QAbstractItemModel)\n' +
    '- **View**: Displays data (QListView, QTreeView, QTableView)\n' +
    '- **Delegate**: Renders items (QStyledItemDelegate)\n\n' +
    '### Common Models\n' +
    '- QStringListModel — simple string lists\n' +
    '- QStandardItemModel — tree/list/table of QStandardItem\n' +
    '- QFileSystemModel — local filesystem\n' +
    '- QSqlTableModel — SQL database table\n\n' +
    '### Anti-patterns\n' +
    '- Don\'t call model->index() in the UI thread from a worker\n' +
    '- Don\'t modify model data from non-GUI threads\n' +
    '- Use beginInsertRows()/endInsertRows() for batch inserts\n' +
    '- Don\'t subclass QAbstractItemModel unless needed — try QStandardItemModel first';
}

function executeQtThread(cwd) {
  return '## Qt Threading Guide\n\n' +
    '### Thread-safe patterns\n' +
    '- **Signals/slots across threads**: Qt manages queueing automatically when sender and receiver are in different threads.\n' +
    '- **QThread**: Subclass QThread or use moveToThread(). Prefer moveToThread() — it\'s cleaner.\n' +
    '- **QtConcurrent**: High-level API for map/reduce/filter operations.\n\n' +
    '### moveToThread() Pattern (Recommended)\n' +
    '```cpp\n' +
    'QThread *thread = new QThread();\n' +
    'Worker *worker = new Worker();\n' +
    'worker->moveToThread(thread);\n\n' +
    'connect(thread, &QThread::started, worker, &Worker::doWork);\n' +
    'connect(worker, &Worker::finished, thread, &QThread::quit);\n' +
    'connect(worker, &Worker::finished, worker, &QObject::deleteLater);\n' +
    'connect(thread, &QThread::finished, thread, &QObject::deleteLater);\n' +
    'thread->start();\n' +
    '```\n\n' +
    '### Anti-patterns\n' +
    '- Don\'t call GUI methods directly from worker threads\n' +
    '- Don\'t subclass QThread unless you really need to\n' +
    '- Don\'t use QMutex without QMutexLocker (RAII pattern)\n' +
    '- Don\'t forget to stop threads before the main event loop exits';
}

// ═══════════════════════════════════════════════════════════════════════════════
// Memory
// ═══════════════════════════════════════════════════════════════════════════════

const MEMORY_DIR = path.join(os.homedir(), '.codeyang', 'memory');

async function ensureMemoryDir() {
  await fs.promises.mkdir(MEMORY_DIR, { recursive: true });
}

function sanitizeKey(key) {
  return key.toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 100);
}

const crypto = require('crypto');

async function executeMemoryTool(name, args) {
  await ensureMemoryDir();

  const tools_ = {
    Remember: async () => {
      const key = String(args.key || '').trim();
      const value = String(args.value || '').trim();
      const type = ['fact', 'preference', 'project', 'instruction', 'context'].includes(args.type) ? args.type : 'fact';
      if (!key || !value) return '{"error":"key and value are required"}';
      const id = Date.now().toString(36) + '-' + crypto.randomUUID().slice(0, 8);
      const now = new Date().toISOString();
      const mem = { id, key: sanitizeKey(key), value, type, createdAt: now, updatedAt: now };
      await fs.promises.writeFile(path.join(MEMORY_DIR, id + '.json'), JSON.stringify(mem, null, 2));
      return JSON.stringify({ id: mem.id, key: mem.key, type: mem.type });
    },
    Recall: async () => {
      await ensureMemoryDir();
      const id = String(args.id || '').trim();
      const query = String(args.query || '').trim();
      let files;
      try { files = await fs.promises.readdir(MEMORY_DIR); } catch { return '[]'; }
      const all = [];
      for (const f of files) {
        if (!f.endsWith('.json')) continue;
        try {
          const data = JSON.parse(await fs.promises.readFile(path.join(MEMORY_DIR, f), 'utf-8'));
          all.push(data);
        } catch {}
      }

      if (id) {
        const found = all.find(function (m) { return m.id === id; });
        return found ? JSON.stringify(found) : '{"error":"memory not found"}';
      }
      if (query) {
        const q = query.toLowerCase();
        const filtered = all.filter(function (m) { return m.key.includes(q) || m.value.toLowerCase().includes(q); });
        return JSON.stringify(filtered);
      }
      return JSON.stringify(all);
    },
    Forget: async () => {
      const key = String(args.key || args.id || '').trim();
      if (!key) return '{"error":"key or id is required"}';
      try {
        await fs.promises.unlink(path.join(MEMORY_DIR, key + '.json'));
        return JSON.stringify({ deleted: true });
      } catch {}
      // Try to find by key
      let files;
      try { files = await fs.promises.readdir(MEMORY_DIR); } catch { return '{"deleted":false}'; }
      for (const f of files) {
        if (!f.endsWith('.json')) continue;
        try {
          const data = JSON.parse(await fs.promises.readFile(path.join(MEMORY_DIR, f), 'utf-8'));
          if (data.key === sanitizeKey(key)) {
            await fs.promises.unlink(path.join(MEMORY_DIR, f));
            return JSON.stringify({ deleted: true, key: data.key });
          }
        } catch {}
      }
      return '{"deleted":false}';
    },
    ListMemories: async () => {
      await ensureMemoryDir();
      const type = String(args.type || '').trim();
      let files;
      try { files = await fs.promises.readdir(MEMORY_DIR); } catch { return '[]'; }
      const all = [];
      for (const f of files) {
        if (!f.endsWith('.json')) continue;
        try {
          const data = JSON.parse(await fs.promises.readFile(path.join(MEMORY_DIR, f), 'utf-8'));
          all.push(data);
        } catch {}
      }
      const filtered = type ? all.filter(function (m) { return m.type === type; }) : all;
      return JSON.stringify(filtered);
    },
  };

  const fn = tools_[name];
  if (!fn) return '{"error":"unknown memory tool: ' + name + '"}';
  return await fn();
}

// ═══════════════════════════════════════════════════════════════════════════════
// Task Sub-Agent
// ═══════════════════════════════════════════════════════════════════════════════

const https = require('https');
const http = require('http');

function getToolSchemasForAgent(isAnthropic) {
  const schemas = [
    { name: 'Bash', description: 'Execute a shell command.', input_schema: { type: 'object', properties: { command: { type: 'string' }, cwd: { type: 'string' } }, required: ['command'] } },
    { name: 'Read', description: 'Read a file or list a directory.', input_schema: { type: 'object', properties: { filePath: { type: 'string' }, offset: { type: 'number' }, limit: { type: 'number' } }, required: ['filePath'] } },
    { name: 'Write', description: 'Write content to a file.', input_schema: { type: 'object', properties: { filePath: { type: 'string' }, content: { type: 'string' } }, required: ['filePath', 'content'] } },
    { name: 'Edit', description: 'Replace exact text in a file.', input_schema: { type: 'object', properties: { filePath: { type: 'string' }, oldString: { type: 'string' }, newString: { type: 'string' }, replaceAll: { type: 'boolean' } }, required: ['filePath', 'oldString', 'newString'] } },
    { name: 'Glob', description: 'Search for files matching a glob pattern.', input_schema: { type: 'object', properties: { pattern: { type: 'string' }, root: { type: 'string' } }, required: ['pattern'] } },
    { name: 'Grep', description: 'Search file contents for a regex pattern.', input_schema: { type: 'object', properties: { pattern: { type: 'string' }, include: { type: 'string' }, path: { type: 'string' } }, required: ['pattern'] } },
  ];

  // Anthropic uses a different tool format
  if (!isAnthropic) {
    return schemas;
  }

  return schemas.map(function (t) {
    return {
      name: t.name,
      description: t.description,
      input_schema: t.input_schema,
    };
  });
}

const SUBAGENT_SYSTEM =
  'You are a sub-agent in an AI coding tool. Execute the assigned task using available tools. ' +
  'Stay focused. Return a concise, structured result. Maximum 10 turns.';

async function executeSubAgent(apiKey, model, description, prompt, cwd) {
  const dir = cwd || process.cwd();
  const isAnthropic = model && model.includes('claude');

  const msg = 'Task: ' + prompt + '\n\nWorking directory: ' + dir + '\n\nUse tools to read files, search, and run commands. Return findings concisely.';
  const messages = isAnthropic
    ? [{ role: 'user', content: msg }]
    : [{ role: 'system', content: SUBAGENT_SYSTEM }, { role: 'user', content: msg }];

  const results = [];
  results.push('## Sub-Agent: ' + description + '\n');
  results.push('Working directory: ' + dir + '\n');

  const maxTurns = 10;

  for (let turn = 0; turn < maxTurns; turn++) {
    let resp;
    if (isAnthropic) {
      resp = await anthropicRequest(apiKey, model, SUBAGENT_SYSTEM, messages, getToolSchemasForAgent(true));
    } else {
      resp = await openaiRequest(apiKey, model, messages, getToolSchemasForAgent(false));
    }

    let textOutput = '';
    const toolCalls = [];

    if (isAnthropic) {
      const blocks = resp.content || [];
      for (const b of blocks) {
        if (b.type === 'text') textOutput += (b.text || '');
        else if (b.type === 'tool_use') toolCalls.push({ id: b.id, name: b.name, input: b.input || {} });
      }
    } else {
      const choice = resp.choices && resp.choices[0];
      if (choice) {
        textOutput = choice.message.content || '';
        if (choice.message.tool_calls) {
          for (const tc of choice.message.tool_calls) {
            let input = {};
            try { input = JSON.parse(tc.function.arguments || '{}'); } catch {}
            toolCalls.push({ id: tc.id, name: tc.function.name, input });
          }
        }
      }
    }

    // Build assistant content
    const assistantContent = isAnthropic
      ? resp.content.filter((b) => b.type === 'text' || b.type === 'tool_use')
      : [];

    if (!isAnthropic) {
      const ac = [];
      if (textOutput) ac.push({ type: 'text', text: textOutput });
      for (const tc of toolCalls) {
        ac.push({ type: 'tool_use', id: tc.id, name: tc.name, input: JSON.parse(JSON.stringify(tc.input)) });
      }
      messages.push({ role: 'assistant', content: ac });
    } else {
      messages.push({ role: 'assistant', content: assistantContent });
    }

    if (textOutput) results.push(textOutput);

    if (toolCalls.length === 0) break;

    const toolResults = [];
    for (const tc of toolCalls) {
      const tName = tc.name;
      let output;

      try {
        switch (tName) {
          case 'Bash': output = await executeBash(String(tc.input.command || ''), tc.input.cwd || dir); break;
          case 'Read': output = await executeRead(String(tc.input.filePath || ''), tc.input.offset, tc.input.limit, dir); break;
          case 'Write': output = await executeWrite(String(tc.input.filePath || ''), String(tc.input.content || ''), dir); break;
          case 'Edit': output = await executeEdit(String(tc.input.filePath || ''), String(tc.input.oldString || ''), String(tc.input.newString || ''), tc.input.replaceAll === true, dir); break;
          case 'Glob': output = await executeGlob(String(tc.input.pattern || ''), tc.input.root, dir); break;
          case 'Grep': output = await executeGrep(String(tc.input.pattern || ''), tc.input.include, tc.input.path, dir); break;
          default: output = 'Sub-agent: tool "' + tName + '" not available. Use Bash/Read/Write/Edit/Glob/Grep.';
        }
      } catch (err) {
        output = 'Error: ' + (err.message || String(err));
      }

      results.push('[Tool: ' + tName + '] ' + output.slice(0, 500));
      toolResults.push({ type: 'tool_result', tool_use_id: tc.id, content: output });
    }

    messages.push({ role: 'user', content: toolResults });
  }

  results.push('\n---\nSub-agent complete.');
  return results.join('\n');
}

function anthropicRequest(apiKey, model, system, messages, tools) {
  return new Promise(function (resolve, reject) {
    const body = JSON.stringify({
      model,
      max_tokens: 4096,
      temperature: 0.5,
      system,
      messages,
      tools,
    });

    const url = new URL('https://api.anthropic.com/v1/messages');
    const opts = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'tools-2024-04-04',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(opts, function (res) {
      var data = '';
      res.on('data', function (c) { data += c; });
      res.on('end', function () {
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error('Sub-agent API error: HTTP ' + res.statusCode + ' — ' + (json.error && json.error.message ? json.error.message : 'unknown')));
          } else {
            resolve(json);
          }
        } catch (e) {
          reject(new Error('Sub-agent: failed to parse API response'));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function openaiRequest(apiKey, model, messages, tools) {
  return new Promise(function (resolve, reject) {
    const body = JSON.stringify({
      model,
      max_tokens: 4096,
      temperature: 0.5,
      messages,
      tools: tools,
    });

    const url = new URL('https://api.deepseek.com/v1/chat/completions');
    const opts = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(opts, function (res) {
      var data = '';
      res.on('data', function (c) { data += c; });
      res.on('end', function () {
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error('Sub-agent API error: HTTP ' + res.statusCode + ' — ' + (json.error && json.error.message ? json.error.message : 'unknown')));
          } else {
            resolve(json);
          }
        } catch (e) {
          reject(new Error('Sub-agent: failed to parse API response'));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = {
  executeBash,
  executeRead,
  executeWrite,
  executeEdit,
  executeGlob,
  executeGrep,
  executeTodoWrite,
  executeWebFetch,
  executeMemoryTool,
  executeMathSolve,
  executeMathPlot,
  executeMathExplain,
  executeQtBuild,
  executeQtSignals,
  executeQtProFile,
  executeQtMigration,
  executeQtUi,
  executeQtQml,
  executeQtTestGen,
  executeQtTestRunner,
  executeQtCoverage,
  executeQtGraphics,
  executeQtCharts,
  executeQtMath,
  executeQtModelView,
  executeQtThread,
  executeSubAgent,
};
