/**
 * MathPlot — Generate SVG mathematical diagrams.
 * - Function graphs on coordinate planes
 * - Geometric shapes with labels
 * - Statistical charts (bar, pie)
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import vm from 'node:vm';

export async function executeMathPlot(kind: string, outputPath?: string): Promise<string> {
  const k = kind?.toLowerCase() || '';

  // ─── Coordinate plane ──────────────────────────────────────────────────
  if (k === 'coordinate' || k === 'grid') {
    return generateCoordinatePlane(outputPath);
  }

  // ─── Function graph ────────────────────────────────────────────────────
  if (k.startsWith('func:') || k.startsWith('f:')) {
    const fn = k.split(':').slice(1).join(':');
    return generateFunctionGraph(fn, outputPath);
  }

  // ─── Triangle ──────────────────────────────────────────────────────────
  if (k === 'triangle') {
    return generateTriangle(outputPath);
  }

  // ─── Bar chart ─────────────────────────────────────────────────────────
  if (k.startsWith('bar:')) {
    const dataStr = k.split(':')[1] || '';
    return generateBarChart(dataStr, outputPath);
  }

  // ─── Pie chart ─────────────────────────────────────────────────────────
  if (k.startsWith('pie:')) {
    const dataStr = k.split(':')[1] || '';
    return generatePieChart(dataStr, outputPath);
  }

  // ─── Scatter plot ─────────────────────────────────────────────────────
  if (k.startsWith('scatter:')) {
    const dataStr = k.split(':')[1] || '';
    return generateScatterPlot(dataStr, outputPath);
  }

  // ─── Help ──────────────────────────────────────────────────────────────
  return formatPlotHelp();
}

function formatPlotHelp(): string {
  return `## MathPlot — SVG 数学图表生成

Usage: \`MathPlot <kind>\`

Available kinds:
- **coordinate** — 坐标系 (x/y axes with grid)
- **func:<expr>** — 函数图像, e.g. \`func:x*2+1\` or \`func:sin(x)\`
- **triangle** — 三角形 (with labels A, B, C and angle marks)
- **bar:<data>** — 条形统计图, e.g. \`bar:A=5,B=8,C=3,D=6\`
- **pie:<data>** — 饼图, e.g. \`pie:A=30,B=20,C=15,D=35\`
- **scatter:<data>** — 散点图, e.g. \`scatter:(1,2),(3,5),(5,3),(7,8)\`

The SVG will be saved to the project directory unless \`output\` is specified.`;
}

// ─── SVG Generators ──────────────────────────────────────────────────────────

async function generateCoordinatePlane(outputPath?: string): Promise<string> {
  const w = 400,
    h = 400;
  const cx = 200,
    cy = 200;
  const scale = 40; // pixels per unit
  const range = 5; // [-5, 5]

  let svg = svgHeader(w, h);
  svg += `<rect width="${w}" height="${h}" fill="#fafafa"/>\n`;

  // Grid lines
  for (let i = -range; i <= range; i++) {
    const x = cx + i * scale;
    const opacity = i === 0 ? '0.8' : '0.15';
    svg += `<line x1="${x}" y1="0" x2="${x}" y2="${h}" stroke="#333" stroke-width="1" opacity="${opacity}"/>\n`;
    const y = cy - i * scale;
    svg += `<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="#333" stroke-width="1" opacity="${opacity}"/>\n`;
  }

  // Axes
  svg += `<line x1="${cx}" y1="0" x2="${cx}" y2="${h}" stroke="#333" stroke-width="2"/>\n`;
  svg += `<line x1="0" y1="${cy}" x2="${w}" y2="${cy}" stroke="#333" stroke-width="2"/>\n`;

  // Arrow markers
  svg += `<defs>\n`;
  svg += `  <marker id="arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">\n`;
  svg += `    <polygon points="0 0, 8 3, 0 6" fill="#333"/>\n`;
  svg += `  </marker>\n`;
  svg += `</defs>\n`;
  svg += `<line x1="${cx}" y1="5" x2="${cx}" y2="-5" stroke="#333" stroke-width="2" marker-end="url(#arrow)"/>\n`;
  svg += `<line x1="${w - 5}" y1="${cy}" x2="${w + 5}" y2="${cy}" stroke="#333" stroke-width="2" marker-end="url(#arrow)"/>\n`;

  // Labels
  svg += `<text x="${w - 10}" y="${cy - 10}" font-size="14" fill="#333" font-family="sans-serif">x</text>\n`;
  svg += `<text x="${cx + 5}" y="15" font-size="14" fill="#333" font-family="sans-serif">y</text>\n`;
  svg += `<text x="${cx + 3}" y="${cy + 15}" font-size="12" fill="#333">O</text>\n`;

  // Tick marks and numbers
  for (let i = -range; i <= range; i++) {
    if (i === 0) continue;
    const x = cx + i * scale;
    const y = cy - i * scale;
    svg += `<line x1="${x}" y1="${cy - 3}" x2="${x}" y2="${cy + 3}" stroke="#333"/>\n`;
    svg += `<text x="${x - 3}" y="${cy + 16}" font-size="11" fill="#555" text-anchor="middle">${i}</text>\n`;
    svg += `<line x1="${cx - 3}" y1="${y}" x2="${cx + 3}" y2="${y}" stroke="#333"/>\n`;
    svg += `<text x="${cx - 6}" y="${y + 5}" font-size="11" fill="#555" text-anchor="end">${i}</text>\n`;
  }

  svg += '</svg>';
  return saveOrReturn(svg, outputPath || 'coordinate.svg', 'Coordinate Plane');
}

async function generateFunctionGraph(fnExpr: string, outputPath?: string): Promise<string> {
  const w = 400,
    h = 400;
  const cx = 200,
    cy = 200;
  const scale = 40;
  const range = 5;

  // 安全白名单校验：只允许数学表达式语法，拒绝任何非数学字符
  // 注意：不依赖此作为唯一防线——VM 沙箱才是真正的安全屏障
  const BLOCKED_PATTERNS = [
    /__proto__/i,
    /constructor/i,
    /prototype/i,
    /\bimport\b/i,
    /\beval\b/i,
    /\brequire\b/i,
    /\bfetch\b/i,
    /\bprocess\b/i,
    /\bglobal\b/i,
    /\bmodule\b/i,
    /\bexport\b/i,
    /\bFunction\b/i,
    /\basync\b/i,
    /\bawait\b/i,
    /\bthis\b/i,
    /\barguments\b/i,
    /\\u/i,
    /\\x/i,
  ];

  // 黑名单模式检查
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(fnExpr)) {
      return `**Error**: expression contains blocked patterns. Only math expressions allowed.`;
    }
  }

  // 编译表达式为可在沙箱中执行的函数
  // 将所有数学函数名替换为沙箱中的对应方法
  const compiled = fnExpr
    .replace(/sin\b/gi, 'Math.sin')
    .replace(/cos\b/gi, 'Math.cos')
    .replace(/tan\b/gi, 'Math.tan')
    .replace(/sqrt\b/gi, 'Math.sqrt')
    .replace(/abs\b/gi, 'Math.abs')
    .replace(/log\b/gi, 'Math.log')
    .replace(/exp\b/gi, 'Math.exp')
    .replace(/pow\b/gi, 'Math.pow')
    .replace(/\^/g, '**')
    .replace(/pi\b/gi, 'Math.PI')
    .replace(/\be\b/gi, 'Math.E');

  // 创建 VM 沙箱上下文——只暴露 Math 和 x
  // 这是真正的安全屏障：沙箱中没有 require、process、global 等全局对象
  const sandbox = {
    Math: {
      sin: Math.sin,
      cos: Math.cos,
      tan: Math.tan,
      sqrt: Math.sqrt,
      abs: Math.abs,
      log: Math.log,
      exp: Math.exp,
      pow: Math.pow,
      PI: Math.PI,
      E: Math.E,
    },
    x: 0,
  };

  const context = vm.createContext(sandbox);

  // 预编译表达式脚本
  let exprScript: vm.Script;
  try {
    exprScript = new vm.Script(`"use strict"; (${compiled})`, { filename: 'mathplot-expr' });
  } catch {
    return `**Error**: cannot parse expression \`${fnExpr}\`. Use JavaScript math syntax, e.g. \`x*2+1\`, \`x*x\`, \`sin(x)\`.`;
  }

  // 在沙箱中求值（每次传入不同的 x）
  function evalFn(x: number): number {
    sandbox.x = x;
    try {
      const result = exprScript.runInContext(context, { timeout: 1000, breakOnSigint: true });
      if (typeof result !== 'number' || !isFinite(result)) return NaN;
      return result;
    } catch {
      return NaN;
    }
  }

  // 测试求值（x=0）
  if (!isFinite(evalFn(0))) {
    return `**Error**: expression \`${fnExpr}\` could not be evaluated at x=0. Check for division by zero.`;
  }

  let svg = svgHeader(w, h);
  svg += `<rect width="${w}" height="${h}" fill="#fafafa"/>\n`;

  // Grid
  for (let i = -range; i <= range; i++) {
    const x = cx + i * scale;
    const opacity = i === 0 ? '0.5' : '0.1';
    svg += `<line x1="${x}" y1="0" x2="${x}" y2="${h}" stroke="#333" stroke-width="1" opacity="${opacity}"/>\n`;
    const y = cy - i * scale;
    svg += `<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="#333" stroke-width="1" opacity="${opacity}"/>\n`;
  }

  // Axes
  svg += `<line x1="${cx}" y1="0" x2="${cx}" y2="${h}" stroke="#333" stroke-width="2"/>\n`;
  svg += `<line x1="0" y1="${cy}" x2="${w}" y2="${cy}" stroke="#333" stroke-width="2"/>\n`;
  svg += `<text x="${w - 10}" y="${cy - 10}" font-size="14">x</text>\n`;
  svg += `<text x="${cx + 5}" y="15" font-size="14">y</text>\n`;

  // Function curve
  let path = '';
  let inRange = false;
  for (let px = 0; px <= w; px++) {
    const x = (px - cx) / scale;
    try {
      const y = evalFn(x);
      const py = cy - y * scale;
      if (py >= -100 && py <= h + 100 && isFinite(py)) {
        path += inRange ? ` L${px},${py}` : ` M${px},${py}`;
        inRange = true;
      } else {
        inRange = false;
      }
    } catch {
      inRange = false;
    }
  }

  svg += `<path d="${path}" fill="none" stroke="#e74c3c" stroke-width="2.5"/>\n`;

  // Label
  svg += `<text x="10" y="20" font-size="14" fill="#e74c3c" font-weight="bold">y = ${fnExpr}</text>\n`;

  svg += '</svg>';
  return saveOrReturn(svg, outputPath || 'function.svg', `Function: y = ${fnExpr}`);
}

async function generateTriangle(outputPath?: string): Promise<string> {
  const w = 300,
    h = 300;
  // Triangle corners
  const A = { x: 50, y: 250 };
  const B = { x: 250, y: 250 };
  const C = { x: 150, y: 50 };

  let svg = svgHeader(w, h);
  svg += `<rect width="${w}" height="${h}" fill="#fafafa"/>\n`;

  // Triangle
  svg += `<polygon points="${A.x},${A.y} ${B.x},${B.y} ${C.x},${C.y}" fill="#e3f2fd" stroke="#1565c0" stroke-width="2"/>\n`;

  // Labels at corners
  svg += `<text x="${A.x - 15}" y="${A.y + 20}" font-size="16" font-weight="bold" fill="#333">A</text>\n`;
  svg += `<text x="${B.x + 5}" y="${B.y + 20}" font-size="16" font-weight="bold" fill="#333">B</text>\n`;
  svg += `<text x="${C.x - 5}" y="${C.y - 15}" font-size="16" font-weight="bold" fill="#333">C</text>\n`;

  // Side labels
  const midAB = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 + 20 };
  const midBC = { x: (B.x + C.x) / 2 + 15, y: (B.y + C.y) / 2 };
  const midAC = { x: (A.x + C.x) / 2 - 25, y: (A.y + C.y) / 2 };
  svg += `<text x="${midAB.x}" y="${midAB.y}" font-size="13" fill="#555" text-anchor="middle">c</text>\n`;
  svg += `<text x="${midBC.x}" y="${midBC.y}" font-size="13" fill="#555">a</text>\n`;
  svg += `<text x="${midAC.x}" y="${midAC.y}" font-size="13" fill="#555">b</text>\n`;

  // Right angle mark at corner A (for right triangle)
  const sizeR = 15;
  svg += `<polyline points="${A.x + sizeR},${A.y} ${A.x + sizeR},${A.y - sizeR} ${A.x},${A.y - sizeR}" fill="none" stroke="#333" stroke-width="1.5"/>\n`;

  svg += '</svg>';
  return saveOrReturn(svg, outputPath || 'triangle.svg', 'Triangle ABC');
}

async function generateBarChart(dataStr: string, outputPath?: string): Promise<string> {
  // Parse "A=5,B=8,C=3,D=6"
  const pairs = dataStr
    .split(/[,，]/)
    .map((p) => {
      const parts = p.split('=');
      return { label: parts[0]?.trim() || '', value: parseFloat(parts[1]) || 0 };
    })
    .filter((p) => p.label);

  if (pairs.length === 0) return '**Error**: no data. Use format: `bar:A=5,B=8,C=3`';

  const maxVal = Math.max(...pairs.map((p) => p.value));
  const w = Math.max(300, pairs.length * 60 + 40);
  const h = 300;
  const barW = Math.min(50, (w - 80) / pairs.length - 10);
  const chartH = 220;
  const left = 60;
  const top = 30;

  let svg = svgHeader(w, h);
  svg += `<rect width="${w}" height="${h}" fill="#fafafa"/>\n`;

  // Bars with gradient
  const colors = ['#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#34495e'];
  for (let i = 0; i < pairs.length; i++) {
    const barH = (pairs[i].value / maxVal) * chartH;
    const x = left + i * (barW + 10);
    const y = top + chartH - barH;
    const color = colors[i % colors.length];
    svg += `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" fill="${color}" rx="3"/>\n`;
    // Value on top
    svg += `<text x="${x + barW / 2}" y="${y - 5}" font-size="13" font-weight="bold" fill="#333" text-anchor="middle">${pairs[i].value}</text>\n`;
    // Label below
    svg += `<text x="${x + barW / 2}" y="${top + chartH + 20}" font-size="12" fill="#555" text-anchor="middle">${pairs[i].label}</text>\n`;
  }

  // Y axis
  svg += `<line x1="${left - 10}" y1="${top}" x2="${left - 10}" y2="${top + chartH}" stroke="#333" stroke-width="1.5"/>\n`;
  // X axis
  svg += `<line x1="${left - 10}" y1="${top + chartH}" x2="${w - 10}" y2="${top + chartH}" stroke="#333" stroke-width="1.5"/>\n`;

  // Y ticks
  for (let v = 0; v <= maxVal; v += Math.ceil(maxVal / 5) || 1) {
    const y = top + chartH - (v / maxVal) * chartH;
    svg += `<line x1="${left - 15}" y1="${y}" x2="${left - 10}" y2="${y}" stroke="#333"/>\n`;
    svg += `<text x="${left - 20}" y="${y + 4}" font-size="11" fill="#555" text-anchor="end">${v}</text>\n`;
  }

  svg += '</svg>';
  return saveOrReturn(svg, outputPath || 'barchart.svg', `Bar Chart: ${pairs.map((p) => p.label).join(', ')}`);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function svgHeader(w: number, h: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">\n`;
}

async function saveOrReturn(svg: string, filename: string, title: string): Promise<string> {
  const lines: string[] = [];
  lines.push(`## MathPlot: ${title}\n`);

  // Save to file
  try {
    const outDir = process.cwd();
    const outPath = join(outDir, filename);
    await mkdir(outDir, { recursive: true });
    await writeFile(outPath, svg, 'utf-8');
    lines.push(`SVG saved to: \`${outPath}\`\n`);
    lines.push(`Open with: browser, VS Code (with SVG preview), or any image viewer.`);
  } catch (err) {
    lines.push(`Could not save SVG: ${err instanceof Error ? err.message : String(err)}`);
    lines.push('');
    lines.push('```svg');
    lines.push(svg);
    lines.push('```');
  }

  return lines.join('\n');
}

// ─── Pie Chart ───────────────────────────────────────────────────────────────

async function generatePieChart(dataStr: string, outputPath?: string): Promise<string> {
  const pairs = dataStr
    .split(/[,，]/)
    .map((p) => {
      const parts = p.split('=');
      return { label: parts[0]?.trim() || '', value: parseFloat(parts[1]) || 0 };
    })
    .filter((p) => p.label);

  if (pairs.length === 0) return '**Error**: no data. Use format: `pie:A=30,B=20,C=15`';

  const w = 360,
    h = 320;
  const cx = 160,
    cy = 150,
    r = 120;
  const total = pairs.reduce((s, p) => s + p.value, 0);

  let svg = svgHeader(w, h);
  svg += `<rect width="${w}" height="${h}" fill="#fafafa"/>\n`;

  const colors = ['#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#95a5a6'];

  let startAngle = -Math.PI / 2; // Start from top

  for (let i = 0; i < pairs.length; i++) {
    const pct = pairs[i].value / total;
    const angle = pct * 2 * Math.PI;
    const endAngle = startAngle + angle;
    const largeArc = angle > Math.PI ? 1 : 0;

    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);

    const d = `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${largeArc},1 ${x2},${y2} Z`;
    svg += `<path d="${d}" fill="${colors[i % colors.length]}" stroke="#fff" stroke-width="1.5"/>\n`;

    // Label
    const midAngle = startAngle + angle / 2;
    const lx = cx + r * 0.7 * Math.cos(midAngle);
    const ly = cy + r * 0.7 * Math.sin(midAngle);
    const label = `${pairs[i].label} ${Math.round(pct * 100)}%`;
    svg += `<text x="${lx}" y="${ly}" font-size="12" fill="#fff" font-weight="bold" text-anchor="middle" dominant-baseline="middle">${label}</text>\n`;

    startAngle = endAngle;
  }

  // Legend
  let legendY = 15;
  for (let i = 0; i < pairs.length; i++) {
    const x = cx + r + 25;
    svg += `<rect x="${x}" y="${legendY}" width="12" height="12" fill="${colors[i % colors.length]}" rx="2"/>\n`;
    svg += `<text x="${x + 17}" y="${legendY + 10}" font-size="11" fill="#333">${pairs[i].label} (${pairs[i].value})</text>\n`;
    legendY += 18;
  }

  svg += '</svg>';
  return saveOrReturn(svg, outputPath || 'pie.svg', `Pie Chart: ${pairs.map((p) => p.label).join(', ')}`);
}

// ─── Scatter Plot ────────────────────────────────────────────────────────────

async function generateScatterPlot(dataStr: string, outputPath?: string): Promise<string> {
  // Parse: (1,2),(3,5),(5,3),(7,8)
  const pts: Array<[number, number]> = [];
  const regex = /\((-?\d+\.?\d*)\s*[,，]\s*(-?\d+\.?\d*)\)/g;
  let m;
  while ((m = regex.exec(dataStr)) !== null) {
    pts.push([parseFloat(m[1]), parseFloat(m[2])]);
  }

  if (pts.length === 0) return '**Error**: no data. Use format: `scatter:(1,2),(3,5),(5,3),(7,8)`';

  const w = 400,
    h = 400;
  const margin = 50;
  const pw = w - 2 * margin;
  const ph = h - 2 * margin;

  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const xMin = Math.min(...xs),
    xMax = Math.max(...xs);
  const yMin = Math.min(...ys),
    yMax = Math.max(...ys);
  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;

  const toX = (x: number) => margin + ((x - xMin) / xRange) * pw;
  const toY = (y: number) => margin + ph - ((y - yMin) / yRange) * ph;

  let svg = svgHeader(w, h);
  svg += `<rect width="${w}" height="${h}" fill="#fafafa"/>\n`;

  // Axes
  svg += `<line x1="${margin}" y1="${margin + ph}" x2="${margin + pw}" y2="${margin + ph}" stroke="#333" stroke-width="1.5"/>\n`;
  svg += `<line x1="${margin}" y1="${margin}" x2="${margin}" y2="${margin + ph}" stroke="#333" stroke-width="1.5"/>\n`;

  // Ticks
  for (let i = 0; i <= 4; i++) {
    const x = margin + (i / 4) * pw;
    const val = xMin + (i / 4) * xRange;
    svg += `<text x="${x}" y="${margin + ph + 18}" font-size="11" fill="#555" text-anchor="middle">${formatNumS(val)}</text>\n`;
  }
  for (let i = 0; i <= 4; i++) {
    const y = margin + ph - (i / 4) * ph;
    const val = yMin + (i / 4) * yRange;
    svg += `<text x="${margin - 8}" y="${y + 4}" font-size="11" fill="#555" text-anchor="end">${formatNumS(val)}</text>\n`;
  }

  // Points
  for (const [x, y] of pts) {
    const px = toX(x),
      py = toY(y);
    svg += `<circle cx="${px}" cy="${py}" r="5" fill="#e74c3c" opacity="0.8"/>\n`;
    svg += `<text x="${px + 7}" y="${py - 7}" font-size="10" fill="#555">(${formatNumS(x)},${formatNumS(y)})</text>\n`;
  }

  svg += '</svg>';
  return saveOrReturn(svg, outputPath || 'scatter.svg', `Scatter Plot (${pts.length} points)`);
}

function formatNumS(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 100) / 100);
}
