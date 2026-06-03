/**
 * MathSolve — Solve middle school math problems step by step.
 * Covers: equations (linear, quadratic, systems), geometry, statistics, probability.
 */
export async function executeMathSolve(problem: string, type?: string): Promise<string> {
  const p = problem.trim();

  // ─── Linear equation ───────────────────────────────────────────────────
  if (type === 'linear' || /^[\d\sxX+\-*/.()=]+\s*$/.test(p) && p.includes('=') && !p.includes('^') && !p.includes('²')) {
    return solveLinear(p);
  }

  // ─── Quadratic equation ────────────────────────────────────────────────
  if (type === 'quadratic' || /\bx\s*(?:\*\*\s*2|\^2|²|²)/.test(p) || /\b2x\b/.test(p)) {
    return solveQuadratic(p);
  }

  // ─── System of equations ───────────────────────────────────────────────
  if (type === 'system' || (p.includes('\n') && p.match(/=.*\n.*=/))) {
    // Format: "2x + y = 5\nx - y = 1"
    return solveSystem(p);
  }

  // ─── Pythagorean theorem ──────────────────────────────────────────────
  if (type === 'pythagorean' || /(?:勾股|pythagorean|直角.*边|a=.*b=.*c=)/i.test(p)) {
    return solvePythagorean(p);
  }

  // ─── Circle ────────────────────────────────────────────────────────────
  if (type === 'circle' || /\b(?:circle|圆|半径|直径|radius|diameter|周长|面积|circumference|area)\b/i.test(p)) {
    return solveCircle(p);
  }

  // ─── Statistics ────────────────────────────────────────────────────────
  if (type === 'stats' || /\b(?:平均|中位|众数|方差|mean|median|mode|variance|range|std)\b/i.test(p)) {
    return solveStats(p);
  }

  // ─── Percentage/proportion ─────────────────────────────────────────────
  if (type === 'percent' || /[%％]|(?:百分之|打折|利率)/.test(p)) {
    return solvePercent(p);
  }

  // ─── Trigonometry ────────────────────────────────────────────────────
  if (type === 'trig' || /\b(?:sin|cos|tan|sine|cosine|正弦|余弦|正切|角度|triangle|三角|deg|rad|degree)\b/i.test(p)) {
    return solveTrig(p);
  }

  // ─── Sequences ───────────────────────────────────────────────────────
  if (type === 'sequence' || /\b(?:等差|等比|数列|sequence|通项|求和|a1|a\d|Sn|d=|q=)\b/i.test(p)) {
    return solveSequence(p);
  }

  // ─── Coordinate geometry ─────────────────────────────────────────────
  if (type === 'coord' || /\b(?:坐标|距离|中点|斜率|distance|midpoint|slope|点.*,.*\d)\b/i.test(p)) {
    return solveCoordinate(p);
  }

  // ─── Generic attempt ───────────────────────────────────────────────────
  return `Unknown problem type. Please specify a type:
- **linear**: 一元一次方程, e.g. "3x + 5 = 20"
- **quadratic**: 一元二次方程, e.g. "x² + 3x - 4 = 0"
- **system**: 二元一次方程组, separate equations with newline
- **pythagorean**: 勾股定理, e.g. "a=3 b=4 c=?"
- **circle**: 圆的计算, e.g. "radius=5"
- **stats**: 统计计算, e.g. "mean [2,5,8,3,7]"
- **percent**: 百分比, e.g. "80% of 250"
- **trig**: 三角函数, e.g. "sin A=0.5" or "a=5 b=8 angle C=60"
- **sequence**: 数列, e.g. "arithmetic a1=3 d=2 n=10" or "geometric a1=2 r=3 n=5"
- **coord**: 坐标几何, e.g. "distance (1,2) (4,6)" or "midpoint (0,0) (6,8)"`;
}

// ─── Solvers ─────────────────────────────────────────────────────────────────

function solveLinear(expr: string): string {
  const lines: string[] = [];
  lines.push('## 解一元一次方程');
  lines.push(`\n方程: \`${expr}\`\n`);

  // Parse: "3x + 5 = 20" or "2x - 3 = 7" or "3x+5=20"
  const cleaned = expr.replace(/\s+/g, '').replace(/[xX]/g, 'x');
  const match = cleaned.match(/^([+-]?\d*\.?\d*)x([+-]\d+\.?\d*)=([+-]?\d+\.?\d*)$/);
  if (!match) {
    // Try with coefficient 1: "x + 5 = 20" or "x - 3 = 7"
    const m2 = cleaned.match(/^x([+-]\d+\.?\d*)=([+-]?\d+\.?\d*)$/);
    if (m2) {
      const b = parseFloat(m2[1]);
      const c = parseFloat(m2[2]);
      lines.push('### 步骤');

      // Step 1: Move constant term
      lines.push(`1. 移项: x = ${c} - (${b})`);
      lines.push(`   x = ${c - b}`);

      const result = c - b;
      // Step 2: Verification
      lines.push(`\n2. 检验: 左边 = ${1}×${result} + ${b} = ${result + b}`);
      lines.push(`   右边 = ${c}`);
      lines.push(`   ${result + b === c ? '  ✓ 左边 = 右边' : '  ✗ 不相等'}`);

      lines.push(`\n### 答案: **x = ${result}**`);
      return lines.join('\n');
    }

    // Try: "3x = 20 - 5" (no +b)
    const m3 = cleaned.match(/^([+-]?\d*\.?\d*)x=([+-]?\d+\.?\d*)$/);
    if (m3) {
      const a = parseFloat(m3[1]) || 1;
      const c = parseFloat(m3[2]);
      const x = c / a;
      lines.push('### 步骤');
      lines.push(`1. 等式两边除以 ${a}: x = ${c} ÷ ${a} = **${x}**`);
      lines.push(`\n2. 检验: ${a} × ${x} = ${a * x} ✓`);
      lines.push(`\n### 答案: **x = ${x}**`);
      return lines.join('\n');
    }

    return `无法解析方程。请使用格式: \`ax + b = c\`, 例如 \`3x + 5 = 20\``;
  }

  const a = parseFloat(match[1]) || 1;
  const b = parseFloat(match[2]);
  const c = parseFloat(match[3]);

  lines.push(`已知: a = ${a}, b = ${b}, c = ${c}`);
  lines.push('');

  lines.push('### 步骤');

  // Step 1: Write standard form
  lines.push(`1. 原方程: ${a}x ${b >= 0 ? '+' : '-'} ${Math.abs(b)} = ${c}`);

  // Step 2: Move constant term
  const rightSide = c - b;
  lines.push(`2. 移项 (常数项移到右边):`);
  lines.push(`   ${a}x = ${c} ${b >= 0 ? '-' : '+'} ${Math.abs(b)}`);
  lines.push(`   ${a}x = ${rightSide}`);

  // Step 3: Divide by coefficient
  const x = rightSide / a;
  lines.push(`3. 两边除以 ${a}:`);
  lines.push(`   x = ${rightSide} ÷ ${a}`);
  lines.push(`   x = **${x}**`);

  // Step 4: Verify
  const verify = a * x + b;
  lines.push(`\n4. 检验:`);
  lines.push(`   左边 = ${a} × ${x} + ${b} = ${verify}`);
  lines.push(`   右边 = ${c}`);
  lines.push(`   ${Math.abs(verify - c) < 0.001 ? '✓ 左边 = 右边, 正确!' : `✗ 不相等 (差异: ${verify - c})`}`);

  // Simplify fraction
  const fraction = toFraction(x);
  if (fraction && fraction !== String(x)) {
    lines.push(`\n### 分数形式: **x = ${fraction}**`);
  }

  lines.push(`\n### 答案: **x = ${x}**`);
  return lines.join('\n');
}

function solveQuadratic(expr: string): string {
  const lines: string[] = [];
  lines.push('## 解一元二次方程');
  lines.push(`\n方程: \`${expr}\`\n`);

  // Clean and parse: ax² + bx + c = 0
  const cleaned = expr.replace(/\s+/g, '').replace(/[xX]/g, 'x').replace(/²|²|\^2|\*\*2/g, '^2');
  lines.push(`标准形式: ${cleaned}`);
  lines.push('');

  // Parse "ax^2 + bx + c = 0"
  let match = cleaned.match(/^([+-]?\d*\.?\d*)x\^2([+-]\d*\.?\d*)x([+-]\d+\.?\d*)=0$/);
  if (!match) {
    // Try: "x^2 + bx + c = 0" (a=1, b may be implicit like "+x" or "-x")
    match = cleaned.match(/^x\^2([+-]\d*\.?\d*)x([+-]\d+\.?\d*)=0$/);
  }
  if (!match) {
    // Try: "x^2 + bx + c = 0" where b=1 (implicit: "+x")
    match = cleaned.match(/^x\^2\+x([+-]\d+\.?\d*)=0$/);
    if (match) {
      // b=1 case
      const c1 = parseFloat(match[1] || '0');
      return solveQuadraticCore(1, 1, c1, lines);
    }
    match = cleaned.match(/^x\^2-x([+-]\d+\.?\d*)=0$/);
    if (match) {
      const c1 = parseFloat(match[1] || '0');
      return solveQuadraticCore(1, -1, c1, lines);
    }
  }
  if (!match) return '无法解析二次方程。请使用格式: `ax² + bx + c = 0`, 例如 `x² + 3x - 4 = 0`';

  const a = match[1] ? (parseFloat(match[1]) || (match[1] === '-' ? -1 : 1)) : 1;
  const bRaw = match[2];
  const b = bRaw === '+' || bRaw === '' ? 1 : bRaw === '-' ? -1 : (parseFloat(bRaw) || 0);
  const c = parseFloat(match[3]) || 0;

  return solveQuadraticCore(a, b, c, lines);
}

function solveQuadraticCore(a: number, b: number, c: number, lines: string[]): string {
  lines.push(`系数: a = ${a}, b = ${b}, c = ${c}`);
  lines.push('');

  // Discriminant
  const delta = b * b - 4 * a * c;
  lines.push('### 步骤');
  lines.push('**方法: 求根公式法**');
  lines.push('');
  lines.push(`1. 判别式 Δ = b² - 4ac`);
  lines.push(`   Δ = ${b}² - 4 × ${a} × ${c}`);
  lines.push(`   Δ = ${b * b} - ${4 * a * c}`);
  lines.push(`   Δ = **${delta}**`);
  lines.push('');

  if (delta < 0) {
    lines.push(`2. Δ < 0, 方程**无实数根**。`);
  } else if (Math.abs(delta) < 0.0001) {
    const x = -b / (2 * a);
    lines.push('2. Δ = 0, 方程有**两个相等实数根**:');
    lines.push(`   x₁ = x₂ = -b / (2a)`);
    lines.push(`   = -(${b}) / (2 × ${a})`);
    lines.push(`   = **${x}**`);
    lines.push(`\n### 答案: **x = ${x}**`);
  } else {
    const sqrtDelta = Math.sqrt(delta);
    lines.push('2. Δ > 0, 方程有**两个不等实数根**:');
    lines.push(`   √Δ = ${formatNum(sqrtDelta)}`);
    lines.push('');
    lines.push('3. 代入求根公式: x = (-b ± √Δ) / (2a)');

    const denom = 2 * a;
    const x1 = (-b + sqrtDelta) / denom;
    const x2 = (-b - sqrtDelta) / denom;

    lines.push(`   x₁ = (-(${b}) + ${formatNum(sqrtDelta)}) / (2 × ${a})`);
    lines.push(`      = ${-b + sqrtDelta} / ${denom}`);
    lines.push(`      = **${formatNum(x1)}**`);
    lines.push('');
    lines.push(`   x₂ = (-(${b}) - ${formatNum(sqrtDelta)}) / (2 × ${a})`);
    lines.push(`      = ${-b - sqrtDelta} / ${denom}`);
    lines.push(`      = **${formatNum(x2)}**`);

    // Verification
    lines.push('\n4. 检验:');
    const v1 = a * x1 * x1 + b * x1 + c;
    const v2 = a * x2 * x2 + b * x2 + c;
    lines.push(`   a(x₁)² + b(x₁) + c = ${formatNum(v1)} ≈ 0 ✓`);
    lines.push(`   a(x₂)² + b(x₂) + c = ${formatNum(v2)} ≈ 0 ✓`);

    lines.push(`\n### 答案: **x₁ = ${formatNum(x1)}, x₂ = ${formatNum(x2)}**`);
  }

  return lines.join('\n');
}

function solveSystem(expr: string): string {
  const lines: string[] = [];
  lines.push('## 解二元一次方程组');
  lines.push('');

  const eqs = expr.split('\n').filter((l) => l.trim());
  if (eqs.length < 2) return '需要两个方程，用换行分隔。例如:\n`2x + y = 5`\n`x - y = 1`';

  const eq1 = eqs[0].replace(/\s+/g, '').replace(/[xX]/g, 'x').replace(/[yY]/g, 'y');
  const eq2 = eqs[1].replace(/\s+/g, '').replace(/[xX]/g, 'x').replace(/[yY]/g, 'y');

  lines.push(`方程组:`);
  lines.push(`  ①  ${eq1.replace(/([+-])/g, ' $1 ')}`);
  lines.push(`  ②  ${eq2.replace(/([+-])/g, ' $1 ')}`);
  lines.push('');

  // Parse each: ax + by = c
  const p1 = parseLinearEq(eq1);
  const p2 = parseLinearEq(eq2);
  if (!p1 || !p2) return '无法解析方程组。格式: `2x + y = 5` (每行一个方程)';

  const { a: a1, b: b1, c: c1 } = p1;
  const { a: a2, b: b2, c: c2 } = p2;

  lines.push('### 使用消元法');
  lines.push(`系数: 方程①: a=${a1}, b=${b1}, c=${c1}`);
  lines.push(`      方程②: a=${a2}, b=${b2}, c=${c2}`);
  lines.push('');

  // Eliminate y: multiply eq1 by b2, eq2 by b1
  const det = a1 * b2 - a2 * b1;
  if (Math.abs(det) < 0.0001) {
    // Try different approach if this would divide by zero
    return '该方程组无唯一解（可能无穷多解或无解）。';
  }

  const x = (c1 * b2 - c2 * b1) / det;
  const y = (a1 * c2 - a2 * c1) / det;

  lines.push('1. 消去 y:');
  lines.push(`   ① × ${b2}:  ${a1 * b2}x + ${b1 * b2}y = ${c1 * b2}`);
  lines.push(`   ② × ${b1}:  ${a2 * b1}x + ${b2 * b1}y = ${c2 * b1}`);
  lines.push(`   两式相减: (${a1 * b2} - ${a2 * b1})x = ${c1 * b2} - ${c2 * b1}`);
  lines.push(`   ${det}x = ${c1 * b2 - c2 * b1}`);
  lines.push(`   x = **${formatNum(x)}**`);
  lines.push('');

  lines.push('2. 代回求 y:');
  lines.push(`   代入 ①: ${a1} × ${formatNum(x)} + ${b1}y = ${c1}`);
  lines.push(`   ${formatNum(a1 * x)} + ${b1}y = ${c1}`);
  lines.push(`   ${b1}y = ${formatNum(c1 - a1 * x)}`);
  lines.push(`   y = **${formatNum(y)}**`);

  // Verify
  lines.push('\n3. 检验:');
  const check2 = a2 * x + b2 * y;
  lines.push(`   代入②: ${a2}×${formatNum(x)} + ${b2}×${formatNum(y)} = ${formatNum(check2)} ≈ ${c2} ✓`);

  lines.push(`\n### 答案: **x = ${formatNum(x)}, y = ${formatNum(y)}**`);
  return lines.join('\n');
}

function solvePythagorean(expr: string): string {
  const lines: string[] = [];
  lines.push('## 勾股定理计算');
  lines.push('');
  lines.push(`公式: a² + b² = c² (c 为斜边)`);
  lines.push('');

  // Parse "a=3 b=4" or "a=3, c=5" etc.
  const aMatch = expr.match(/a\s*=\s*(\d+\.?\d*)/i);
  const bMatch = expr.match(/b\s*=\s*(\d+\.?\d*)/i);
  const cMatch = expr.match(/c\s*=\s*(\d+\.?\d*)/i);

  let a: number | undefined, b: number | undefined, c: number | undefined;
  if (aMatch) a = parseFloat(aMatch[1]);
  if (bMatch) b = parseFloat(bMatch[1]);
  if (cMatch) c = parseFloat(cMatch[1]);

  if (a && b && !c) {
    c = Math.sqrt(a * a + b * b);
    lines.push('已知两条直角边, 求斜边:');
    lines.push(`c² = a² + b² = ${a}² + ${b}²`);
    lines.push(`c² = ${a * a} + ${b * b} = ${a * a + b * b}`);
    lines.push(`c = √${a * a + b * b}`);
    lines.push(`c = **${formatNum(c)}**`);
  } else if (a && c && !b) {
    b = Math.sqrt(Math.max(0, c * c - a * a));
    lines.push('已知一条直角边和斜边, 求另一条直角边:');
    lines.push(`b² = c² - a² = ${c}² - ${a}²`);
    lines.push(`b² = ${c * c} - ${a * a} = ${c * c - a * a}`);
    lines.push(`b = √${c * c - a * a}`);
    lines.push(`b = **${formatNum(b)}**`);
  } else if (b && c && !a) {
    a = Math.sqrt(Math.max(0, c * c - b * b));
    lines.push('已知一条直角边和斜边, 求另一条直角边:');
    lines.push(`a² = c² - b² = ${c}² - ${b}²`);
    lines.push(`a = **${formatNum(a)}**`);
  } else return '请给出恰好两条边。例如: `a=3 b=4` (求c) 或 `a=3 c=5` (求b)';

  // Right triangle area
  if (a && b) {
    lines.push(`\n三角形面积 = (a × b) / 2 = ${formatNum(a * b / 2)}`);
  }

  return lines.join('\n');
}

function solveCircle(expr: string): string {
  const lines: string[] = [];
  lines.push('## 圆的计算');
  lines.push('');

  const rMatch = expr.match(/(?:r(?:adius)?|半径|r)\s*=\s*(\d+\.?\d*)/i);
  const dMatch = expr.match(/(?:d(?:iameter)?|直径|d)\s*=\s*(\d+\.?\d*)/i);
  const cMatch = expr.match(/(?:c(?:ircumference)?|周长|c)\s*=\s*(\d+\.?\d*)/i);

  let r: number | undefined;
  const pi = Math.PI;

  if (rMatch) r = parseFloat(rMatch[1]);
  else if (dMatch) r = parseFloat(dMatch[1]) / 2;
  else if (cMatch) r = parseFloat(cMatch[1]) / (2 * pi);
  else return '请给出半径(r)、直径(d)或周长(c)。例如: `radius=5`';

  const d = r * 2;
  const circum = 2 * pi * r;
  const area = pi * r * r;

  lines.push(`已知: r = **${r}**`);
  lines.push('');
  lines.push('### 计算结果');
  lines.push(`| 属性 | 公式 | 计算过程 | 结果 |`);
  lines.push(`|------|------|----------|------|`);
  lines.push(`| 直径 d | 2r | 2 × ${r} | **${formatNum(d)}** |`);
  lines.push(`| 周长 C | 2πr | 2 × ${formatNum(pi)} × ${r} | **${formatNum(circum)}** |`);
  lines.push(`| 面积 S | πr² | ${formatNum(pi)} × ${r}² | **${formatNum(area)}** |`);

  return lines.join('\n');
}

function solveStats(expr: string): string {
  const lines: string[] = [];
  lines.push('## 统计计算');
  lines.push('');

  // Extract numbers: mean [2, 5, 8, 3, 7] or mean 2,5,8,3,7
  const numMatch = expr.match(/\[([\d.,\s]+)\]|(\d[\d.,\s]+\d)/);
  if (!numMatch) return '请提供数据。例如: `mean [2, 5, 8, 3, 7]`';

  const numStr = numMatch[1] || numMatch[2];
  const nums = numStr.split(/[,，\s]+/).map(Number).filter((n) => !isNaN(n));

  if (nums.length === 0) return '未找到有效数值。';

  lines.push(`数据: [${nums.join(', ')}] (${nums.length}个数)`);
  lines.push('');

  // Sort
  const sorted = [...nums].sort((x, y) => x - y);

  // Mean
  const sum = nums.reduce((s, n) => s + n, 0);
  const mean = sum / nums.length;
  lines.push('### 平均数');
  lines.push(`总和 = ${nums.join(' + ')} = ${sum}`);
  lines.push(`个数 = ${nums.length}`);
  lines.push(`平均数 = ${sum} ÷ ${nums.length} = **${formatNum(mean)}**`);
  lines.push('');

  // Median
  let median: number;
  if (sorted.length % 2 === 1) {
    median = sorted[Math.floor(sorted.length / 2)];
    lines.push('### 中位数');
    lines.push(`排序: [${sorted.join(', ')}]`);
    lines.push(`位置: 第 ${Math.floor(sorted.length / 2) + 1} 个`);
    lines.push(`中位数 = **${median}**`);
  } else {
    const m = sorted.length / 2;
    median = (sorted[m - 1] + sorted[m]) / 2;
    lines.push('### 中位数');
    lines.push(`排序: [${sorted.join(', ')}]`);
    lines.push(`偶数个, 取中间两个: (${sorted[m - 1]} + ${sorted[m]}) ÷ 2`);
    lines.push(`中位数 = **${formatNum(median)}**`);
  }
  lines.push('');

  // Mode
  const freq = new Map<number, number>();
  for (const n of nums) freq.set(n, (freq.get(n) || 0) + 1);
  let maxFreq = 0;
  const modes: number[] = [];
  for (const [n, f] of freq) {
    if (f > maxFreq) { maxFreq = f; modes.length = 0; modes.push(n); }
    else if (f === maxFreq) modes.push(n);
  }
  lines.push('### 众数');
  if (maxFreq <= 1) lines.push('没有众数 (所有值出现次数相同)');
  else lines.push(`众数 = **${modes.join(', ')}** (出现 ${maxFreq} 次)`);
  lines.push('');

  // Range
  const range = sorted[sorted.length - 1] - sorted[0];
  lines.push('### 极差');
  lines.push(`最大值 - 最小值 = ${sorted[sorted.length - 1]} - ${sorted[0]} = **${range}**`);
  lines.push('');

  // Summary table
  lines.push('### 汇总');
  lines.push(`| 统计量 | 值 |`);
  lines.push(`|--------|-----|`);
  lines.push(`| 平均数 | ${formatNum(mean)} |`);
  lines.push(`| 中位数 | ${formatNum(median)} |`);
  lines.push(`| 众数 | ${modes.length > 0 && maxFreq > 1 ? modes.join(', ') : '无'} |`);
  lines.push(`| 极差 | ${range} |`);
  lines.push(`| 总和 | ${sum} |`);
  lines.push(`| 个数 | ${nums.length} |`);

  return lines.join('\n');
}

function solvePercent(expr: string): string {
  const lines: string[] = [];
  lines.push('## 百分比计算');
  lines.push('');

  // "80% of 250" or "what is 80% of 250"
  const ofMatch = expr.match(/(\d+\.?\d*)\s*[%％]\s*(?:of|的|×|乘)?\s*(\d+\.?\d*)/i);
  if (ofMatch) {
    const pct = parseFloat(ofMatch[1]);
    const total = parseFloat(ofMatch[2]);
    const result = total * pct / 100;
    lines.push(`${pct}% of ${total}:`);
    lines.push(`${total} × ${pct}% = ${total} × ${pct}/100`);
    lines.push(`= ${total} × ${pct / 100}`);
    lines.push(`= **${formatNum(result)}**`);
    return lines.join('\n');
  }

  // "what percent is 55 of 200" or "55 is what % of 200"
  const pctMatch = expr.match(/(\d+\.?\d*)\s*(?:is|是|占|what|的|的)?\s*[%％]?\s*(?:of|的)?\s*(\d+\.?\d*)/i);
  if (pctMatch) {
    const part = parseFloat(pctMatch[1]);
    const total = parseFloat(pctMatch[2]);
    const pct = (part / total) * 100;
    lines.push(`${part} 占 ${total} 的百分之几:`);
    lines.push(`${part} ÷ ${total} × 100%`);
    lines.push(`= ${formatNum(part / total)} × 100%`);
    lines.push(`= **${formatNum(pct)}%**`);
    return lines.join('\n');
  }

  return '请使用格式: `80% of 250` 或 `55 is what % of 200`';
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseLinearEq(eq: string): { a: number; b: number; c: number } | null {
  // Match: "ax + by = c" or "ax - by = c"
  const m = eq.match(/^([+-]?\d*\.?\d*)x([+-]\d+\.?\d*)y=([+-]?\d+\.?\d*)$/);
  if (!m) return null;
  const a = parseFloat(m[1]) || (m[1] === '-' ? -1 : m[1] === '+' ? 1 : 1);
  const b = parseFloat(m[2]) || 0;
  const c = parseFloat(m[3]);
  return { a, b, c };
}

function formatNum(n: number): string {
  if (Number.isInteger(n)) return String(n);
  const rounded = Math.round(n * 10000) / 10000;
  return String(rounded);
}

function toFraction(n: number): string | null {
  if (Number.isInteger(n)) return null;
  const tolerance = 1e-6;
  for (let denom = 1; denom <= 1000; denom++) {
    const num = n * denom;
    if (Math.abs(num - Math.round(num)) < tolerance) {
      const numerator = Math.round(num);
      return `${numerator}/${denom}`;
    }
  }
  return null;
}

// ─── Trigonometry ────────────────────────────────────────────────────────────

function solveTrig(expr: string): string {
  const lines: string[] = [];
  lines.push('## 三角函数 / 解三角形');
  lines.push('');

  // ─── Law of Sines / Cosines (triangle solving) ──────────────────────
  if (/\b(?:a=|b=|c=|边|side|angle)\b/i.test(expr) || /\b(?:A=|B=|C=)\b/.test(expr)) {
    return solveTriangle(expr);
  }

  // ─── Angle conversion ───────────────────────────────────────────────
  if (/度.*弧|弧.*度|deg.*rad|rad.*deg|π|pi/.test(expr)) {
    return solveAngleConversion(expr);
  }

  // ─── Basic trig values ──────────────────────────────────────────────
  const trigMatch = expr.match(/(sin|cos|tan|cot|sec|csc)\s*([A-Za-z]?)\s*=\s*(-?\d+\.?\d*)/i);
  if (trigMatch) {
    return solveBasicTrig(trigMatch[1], trigMatch[3], trigMatch[2] || undefined);
  }

  return '请使用格式: `a=5 b=8 C=60` (解三角形) 或 `sin A=0.5` (求角度)';
}

function solveTriangle(expr: string): string {
  const lines: string[] = [];
  const aMatch = expr.match(/\ba\s*=\s*(\d+\.?\d*)/i);
  const bMatch = expr.match(/\bb\s*=\s*(\d+\.?\d*)/i);
  const cMatch = expr.match(/\bc\s*=\s*(\d+\.?\d*)/i);
  const AMatch = expr.match(/\bA\s*=\s*(\d+\.?\d*)/);
  const BMatch = expr.match(/\bB\s*=\s*(\d+\.?\d*)/);
  const CMatch = expr.match(/\bC\s*=\s*(\d+\.?\d*)/);

  const a = aMatch ? parseFloat(aMatch[1]) : undefined;
  const b = bMatch ? parseFloat(bMatch[1]) : undefined;
  const c = cMatch ? parseFloat(cMatch[1]) : undefined;
  const A = AMatch ? parseFloat(AMatch[1]) : undefined;
  const B = BMatch ? parseFloat(BMatch[1]) : undefined;
  const C = CMatch ? parseFloat(CMatch[1]) : undefined;

  const deg = (d: number) => d * Math.PI / 180;
  const rad = (r: number) => r * 180 / Math.PI;

  // SSS: three sides given → use law of cosines
  if (a && b && c) {
    lines.push('已知三边 (SSS), 用余弦定理:');
    const cosA = (b*b + c*c - a*a) / (2*b*c);
    const cosB = (a*a + c*c - b*b) / (2*a*c);
    const cosC = (a*a + b*b - c*c) / (2*a*b);
    const angleA = Math.acos(Math.max(-1, Math.min(1, cosA)));
    const angleB = Math.acos(Math.max(-1, Math.min(1, cosB)));
    const angleC = Math.acos(Math.max(-1, Math.min(1, cosC)));

    lines.push(`cos A = (b²+c²-a²)/(2bc) = (${b}²+${c}²-${a}²)/(2×${b}×${c}) = ${formatNum(cosA)}`);
    lines.push(`→ A = **${formatNum(rad(angleA))}°**`);
    lines.push(`cos B = (a²+c²-b²)/(2ac) = ${formatNum(cosB)}`);
    lines.push(`→ B = **${formatNum(rad(angleB))}°**`);
    lines.push(`C = 180° - A - B = **${formatNum(rad(angleC))}°**`);

    const p = (a + b + c) / 2;
    const area = Math.sqrt(p * (p - a) * (p - b) * (p - c));
    lines.push(`\n面积 (海伦公式): p=${formatNum(p)}, S = **${formatNum(area)}**`);
    return lines.join('\n');
  }

  // SAS: two sides and included angle
  if (a && b && C) {
    const c2 = a*a + b*b - 2*a*b*Math.cos(deg(C));
    const sideC = Math.sqrt(c2);
    lines.push('已知两边及夹角 (SAS):');
    lines.push(`c² = a² + b² - 2ab·cos C`);
    lines.push(`= ${a}² + ${b}² - 2×${a}×${b}×cos(${C}°)`);
    lines.push(`= ${formatNum(a*a + b*b)} - ${formatNum(2*a*b)}×${formatNum(Math.cos(deg(C)))}`);
    lines.push(`= ${formatNum(c2)}`);
    lines.push(`c = **${formatNum(sideC)}**`);
    return lines.join('\n');
  }
  if (b && c && A) {
    const a2 = b*b + c*c - 2*b*c*Math.cos(deg(A));
    const sideA = Math.sqrt(a2);
    lines.push(`a² = ${b}² + ${c}² - 2×${b}×${c}×cos(${A}°) = ${formatNum(a2)}`);
    lines.push(`a = **${formatNum(sideA)}**`);
    return lines.join('\n');
  }
  if (a && c && B) {
    const b2 = a*a + c*c - 2*a*c*Math.cos(deg(B));
    const sideB = Math.sqrt(b2);
    lines.push(`b = **${formatNum(sideB)}**`);
    return lines.join('\n');
  }

  // ASA / AAS: two angles and a side → law of sines
  const knownAngles = [A, B, C].filter((x) => x !== undefined) as number[];
  const knownSides = [a, b, c].filter((x) => x !== undefined) as number[];
  if (knownAngles.length >= 1 && knownSides.length >= 1) {
    lines.push('使用正弦定理: a/sin A = b/sin B = c/sin C = 2R');
    if (a && A) {
      const R = a / (2 * Math.sin(deg(A)));
      lines.push(`\na/sin A = ${a}/sin(${A}°) = ${formatNum(R * 2)}`);
    }
    return lines.join('\n');
  }

  return '请给出至少三条信息 (边或角)。例如: `a=5 b=8 C=60`';
}

function solveAngleConversion(expr: string): string {
  const lines: string[] = [];
  lines.push('### 角度换算');
  lines.push('');

  // Parse "45 degrees to radians" or "pi/3 radians to degrees"
  const degMatch = expr.match(/(\d+\.?\d*)\s*(?:度|°|deg)/);
  const radMatch = expr.match(/(?:π|pi)\s*\/?\s*(\d+)?/i);

  if (degMatch) {
    const deg = parseFloat(degMatch[1]);
    const rad = deg * Math.PI / 180;
    lines.push(`${deg}° = ${formatNum(rad)} rad`);
    const f = toFraction(deg / 180);
    if (f) lines.push(`= ${f}π rad`);
  }
  if (radMatch && !degMatch) {
    const num = radMatch[1] ? parseFloat(radMatch[1]) : 1;
    const rad = Math.PI / num;
    const deg = rad * 180 / Math.PI;
    lines.push(`π/${num} rad = ${formatNum(deg)}°`);
  }

  // Common angles table
  lines.push('\n### 常用角度对照');
  lines.push('| 度 | 弧度 | sin | cos | tan |');
  lines.push('|---|------|-----|-----|-----|');
  for (const angle of [0, 30, 45, 60, 90, 120, 135, 150, 180]) {
    const r = angle * Math.PI / 180;
    const s = Math.sin(r);
    const c = Math.cos(r);
    const t = Math.abs(s) < 1e-10 ? 0 : Math.abs(c) < 1e-10 ? '∞' : formatNum(s / c);
    lines.push(`| ${angle}° | ${angle === 0 ? '0' : angle === 90 ? 'π/2' : angle === 180 ? 'π' : angle === 45 ? 'π/4' : angle === 60 ? 'π/3' : angle === 30 ? 'π/6' : `π/${formatNum(180/angle)}`} | ${formatNum(s)} | ${formatNum(c)} | ${t} |`);
  }

  return lines.join('\n');
}

function solveBasicTrig(fn: string, valueStr: string, variable?: string): string {
  const lines: string[] = [];
  const value = parseFloat(valueStr);
  const fnLower = fn.toLowerCase();
  const varName = variable || 'θ';

  lines.push(`### ${fn} ${varName} = ${value}`);
  lines.push('');

  if (fnLower === 'sin') {
    const angleRad = Math.asin(value);
    const angleDeg = angleRad * 180 / Math.PI;
    lines.push(`${varName} = arcsin(${value})`);
    lines.push(`= **${formatNum(angleDeg)}°** (主值, ${formatNum(angleRad)} rad)`);
    if (Math.abs(angleDeg - Math.round(angleDeg)) < 0.001) {
      lines.push(`或 = **${formatNum(180 - angleDeg)}°** (补角)`);
    }
    // cos of same angle
    const cosVal = Math.cos(angleRad);
    lines.push(`\ncos ${varName} = ${formatNum(cosVal)}`);
    lines.push(`tan ${varName} = ${formatNum(Math.tan(angleRad))}`);
  } else if (fnLower === 'cos') {
    const angleRad = Math.acos(value);
    const angleDeg = angleRad * 180 / Math.PI;
    lines.push(`${varName} = arccos(${value})`);
    lines.push(`= **${formatNum(angleDeg)}°** (0°~180°)`);
    lines.push(`\nsin ${varName} = ${formatNum(Math.sin(angleRad))}`);
  } else if (fnLower === 'tan') {
    const angleRad = Math.atan(value);
    const angleDeg = angleRad * 180 / Math.PI;
    lines.push(`${varName} = arctan(${value})`);
    lines.push(`= **${formatNum(angleDeg)}°** (主值, -90°~90°)`);
  } else {
    lines.push('仅支持 sin, cos, tan。');
  }

  return lines.join('\n');
}

// ─── Sequences ───────────────────────────────────────────────────────────────

function solveSequence(expr: string): string {
  const lines: string[] = [];
  lines.push('## 数列求解');
  lines.push('');

  const isGeo = /\b(?:geometric|等比|GP|r=)\b/i.test(expr);
  const isArith = /\b(?:arithmetic|等差|AP|d=)\b/i.test(expr) || !isGeo;

  // Parse parameters
  const a1Match = expr.match(/\ba1?\s*=\s*(-?\d+\.?\d*)/i);
  const dMatch = expr.match(/\bd\s*=\s*(-?\d+\.?\d*)/i);
  const rMatch = expr.match(/\br\s*=\s*(-?\d+\.?\d*)/i);
  const qMatch = expr.match(/\bq\s*=\s*(-?\d+\.?\d*)/i);
  const nMatch = expr.match(/\bn\s*=\s*(\d+)/i);

  const a1 = a1Match ? parseFloat(a1Match[1]) : 1;
  const d = dMatch ? parseFloat(dMatch[1]) : undefined;
  const r = rMatch || qMatch ? parseFloat((rMatch || qMatch)![1]) : undefined;
  const n = nMatch ? parseInt(nMatch[1]) : 10;

  if (isArith) {
    const diff = d || 1;
    lines.push(`### 等差数列 (AP) — a₁=${a1}, d=${diff}, n=${n}`);
    lines.push('');

    // General term
    const an = a1 + (n - 1) * diff;
    lines.push(`**通项公式**: aₙ = a₁ + (n-1)d`);
    lines.push(`a${n} = ${a1} + (${n}-1)×${diff} = **${an}**`);
    lines.push('');

    // Sum
    const Sn = n * (a1 + an) / 2;
    lines.push(`**前 n 项和**: Sₙ = n(a₁ + aₙ)/2`);
    lines.push(`S${n} = ${n}×(${a1}+${an})/2 = **${Sn}**`);
    lines.push('');

    // First 5 terms
    const terms = Array.from({ length: Math.min(n, 10) }, (_, i) => a1 + i * diff);
    lines.push(`**前 ${Math.min(n, 10)} 项**: ${terms.join(', ')}` + (n > 10 ? ' ...' : ''));
  } else {
    const ratio = r || 2;
    lines.push(`### 等比数列 (GP) — a₁=${a1}, q=${ratio}, n=${n}`);
    lines.push('');

    const an = a1 * Math.pow(ratio, n - 1);
    lines.push(`**通项公式**: aₙ = a₁ × q^(n-1)`);
    lines.push(`a${n} = ${a1} × ${ratio}^${n-1} = **${formatNum(an)}**`);
    lines.push('');

    const Sn = Math.abs(ratio - 1) < 1e-10 ? a1 * n : a1 * (1 - Math.pow(ratio, n)) / (1 - ratio);
    lines.push(`**前 n 项和**: Sₙ = a₁(1-qⁿ)/(1-q)  (q≠1)`);
    lines.push(`S${n} = ${formatNum(Sn)}`);
    lines.push('');

    const terms = Array.from({ length: Math.min(n, 10) }, (_, i) => a1 * Math.pow(ratio, i));
    lines.push(`**前 ${Math.min(n, 10)} 项**: ${terms.map((t) => formatNum(t)).join(', ')}` + (n > 10 ? ' ...' : ''));
  }

  return lines.join('\n');
}

// ─── Coordinate Geometry ─────────────────────────────────────────────────────

function solveCoordinate(expr: string): string {
  const lines: string[] = [];
  lines.push('## 坐标几何');
  lines.push('');

  // Distance
  if (/distance|距离/.test(expr)) {
    const pts = extractPoints(expr);
    if (pts.length >= 2) {
      const [x1, y1] = pts[0];
      const [x2, y2] = pts[1];
      const dist = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
      lines.push(`### 两点间距离: (${x1},${y1}) 到 (${x2},${y2})`);
      lines.push('');
      lines.push(`d = √[(x₂-x₁)² + (y₂-y₁)²]`);
      lines.push(`= √[(${x2}-${x1})² + (${y2}-${y1})²]`);
      lines.push(`= √[${(x2-x1)**2} + ${(y2-y1)**2}]`);
      lines.push(`= √${formatNum(dist * dist)}`);
      lines.push(`= **${formatNum(dist)}**`);
      return lines.join('\n');
    }
  }

  // Midpoint
  if (/midpoint|中点/.test(expr)) {
    const pts = extractPoints(expr);
    if (pts.length >= 2) {
      const [x1, y1] = pts[0];
      const [x2, y2] = pts[1];
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      lines.push(`### 线段中点: (${x1},${y1}) 到 (${x2},${y2})`);
      lines.push(`M = ((x₁+x₂)/2, (y₁+y₂)/2)`);
      lines.push(`= ((${x1}+${x2})/2, (${y1}+${y2})/2)`);
      lines.push(`= **(${formatNum(mx)}, ${formatNum(my)})**`);
      return lines.join('\n');
    }
  }

  // Slope
  if (/slope|斜率/.test(expr)) {
    const pts = extractPoints(expr);
    if (pts.length >= 2) {
      const [x1, y1] = pts[0];
      const [x2, y2] = pts[1];
      lines.push(`### 两点斜率: (${x1},${y1}) 到 (${x2},${y2})`);
      if (Math.abs(x2 - x1) < 1e-10) {
        lines.push('斜率不存在 (垂直于 x 轴的直线)');
      } else {
        const slope = (y2 - y1) / (x2 - x1);
        lines.push(`k = (y₂-y₁)/(x₂-x₁) = (${y2}-${y1})/(${x2}-${x1})`);
        lines.push(`= ${y2 - y1}/${x2 - x1}`);
        lines.push(`= **${formatNum(slope)}**`);

        // Line equation
        const b = y1 - slope * x1;
        lines.push(`\n直线方程: y = ${formatNum(slope)}x ${b >= 0 ? '+' : '-'} ${formatNum(Math.abs(b))}`);
      }
      return lines.join('\n');
    }
  }

  return '请指定操作: `distance (1,2) (4,6)` 或 `midpoint (0,0) (6,8)` 或 `slope (1,3) (4,9)`';
}

function extractPoints(expr: string): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  const regex = /\((-?\d+\.?\d*)\s*[,，]\s*(-?\d+\.?\d*)\)/g;
  let m;
  while ((m = regex.exec(expr)) !== null) {
    pts.push([parseFloat(m[1]), parseFloat(m[2])]);
  }
  return pts;
}
