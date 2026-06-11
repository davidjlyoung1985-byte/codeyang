/**
 * QtMath — Qt math utilities reference + simple expression evaluator.
 * Provides instant lookup for Qt's math headers, constants, and common numerical patterns.
 * The `eval` sub-command performs safe expression evaluation for the agent.
 */
export async function executeQtMath(action?: string, expression?: string): Promise<string> {
  // ─── Expression evaluation ────────────────────────────────────────────────
  if (action === 'eval' && expression) {
    return evaluateExpression(expression);
  }

  // ─── API reference ────────────────────────────────────────────────────────
  const lines: string[] = [];
  lines.push('## Qt Math Reference\n');

  lines.push('### Qt Math Headers');
  lines.push('| Header | Purpose |');
  lines.push('|--------|---------|');
  lines.push('| `<QtMath>` | qAbs, qMin, qMax, qBound, qFuzzyCompare, qDegreesToRadians, etc. |');
  lines.push('| `<QtNumeric>` | qIsInf, qIsNaN, qFpClassify, qFloatDistance |');
  lines.push('| `<QMargins>` / `<QMarginsF>` | Margin calculations |');
  lines.push('| `<QPoint>` / `<QPointF>` | 2D point arithmetic |');
  lines.push('| `<QSize>` / `<QSizeF>` | Size operations |');
  lines.push('| `<QRect>` / `<QRectF>` | Rectangle operations |');
  lines.push('| `<QLine>` / `<QLineF>` | Line geometry |');
  lines.push('| `<QVector2D/3D/4D>` | Vector math (dot, cross, normalize, distance) |');
  lines.push('| `<QQuaternion>` | 3D rotation math |');
  lines.push('| `<QMatrix4x4>` | 4x4 transformation matrices |');
  lines.push('');

  lines.push('### Common Math Functions');
  lines.push('```cpp');
  lines.push('#include <QtMath>');
  lines.push('');
  lines.push('// 1. Bounds checking');
  lines.push('int clamped = qBound(min, value, max);');
  lines.push('');
  lines.push('// 2. Floating-point comparison (avoid == for floats)');
  lines.push('if (qFuzzyCompare(a, b)) { ... }  // within 1e-12');
  lines.push('');
  lines.push('// 3. Angle conversion');
  lines.push('double rad = qDegreesToRadians(90.0);');
  lines.push('double deg = qRadiansToDegrees(M_PI);');
  lines.push('');
  lines.push('// 4. Power and sqrt');
  lines.push('double squared = qPow(x, 2);    // prefer x*x for integers');
  lines.push('double root = qSqrt(x);');
  lines.push('');
  lines.push('// 5. Trigonometry');
  lines.push('double s = qSin(angleInRad);');
  lines.push('double c = qCos(angleInRad);');
  lines.push('double t = qTan(angleInRad);');
  lines.push('double angle = qAtan2(y, x);  // quadrant-aware');
  lines.push('```');
  lines.push('');

  lines.push('### QVector2D/3D/4D Quick Reference');
  lines.push('```cpp');
  lines.push('#include <QVector2D>');
  lines.push('#include <QVector3D>');
  lines.push('');
  lines.push('QVector3D a(1, 0, 0);');
  lines.push('QVector3D b(0, 1, 0);');
  lines.push('');
  lines.push('float dot = QVector3D::dotProduct(a, b);   // 0 (perpendicular)');
  lines.push('QVector3D cross = QVector3D::crossProduct(a, b); // (0,0,1)');
  lines.push('QVector3D norm = a.normalized();           // unit vector');
  lines.push('float dist = a.distanceToPoint(b);         // ≈1.414');
  lines.push('float len = a.length();                    // =1.0');
  lines.push('');
  lines.push('QVector3D lerp = a + (b - a) * 0.5f;     // linear interpolation');
  lines.push('QVector3D reflect = a - 2*dot*norm;        // reflection vector');
  lines.push('```');
  lines.push('');

  lines.push('### QMatrix4x4 Quick Start');
  lines.push('```cpp');
  lines.push('#include <QMatrix4x4>');
  lines.push('');
  lines.push('QMatrix4x4 m;');
  lines.push('m.setToIdentity();                         // reset');
  lines.push('m.translate(10, 5, 0);                      // translation');
  lines.push('m.rotate(45, 0, 0, 1);                      // rotate 45 deg around Z');
  lines.push('m.scale(2, 2, 1);                           // uniform scale');
  lines.push('');
  lines.push('QVector3D point(1, 0, 0);');
  lines.push('QVector3D transformed = m.map(point);       // apply transform');
  lines.push('QMatrix4x4 inv = m.inverted();              // inverse (may fail!)');
  lines.push('');
  lines.push('// Perspective projection');
  lines.push('QMatrix4x4 proj;');
  lines.push('proj.perspective(45.0f, aspect, 0.1f, 100.0f);');
  lines.push('```');
  lines.push('');

  lines.push('### QRect/RectF Geometry Operations');
  lines.push('```cpp');
  lines.push('QRect r1(0, 0, 100, 50);');
  lines.push('QRect r2(50, 25, 100, 50);');
  lines.push('');
  lines.push('QRect intersection = r1.intersected(r2);    // overlap region');
  lines.push('QRect union = r1.united(r2);               // bounding rectangle');
  lines.push('bool overlaps = r1.intersects(r2);          // true');
  lines.push('bool contains = r1.contains(QPoint(50,25)); // true');
  lines.push('');
  lines.push('QRect adjusted = r1.adjusted(-5, -5, 5, 5); // grow by margins');
  lines.push('QPoint center = r1.center();                // (50, 25)');
  lines.push('```');
  lines.push('');

  lines.push('### Numerical Constants');
  lines.push('| Constant | Value |');
  lines.push('|----------|-------|');
  lines.push('| `M_PI` | 3.14159... |');
  lines.push('| `M_PI_2` | π/2 |');
  lines.push('| `M_SQRT2` | 1.41421... |');
  lines.push('| `M_E` | 2.71828... |');
  lines.push('| `qQNaN()` | Quiet NaN |');
  lines.push('| `qInf()` | Infinity |');
  lines.push('');

  lines.push('### Safe Numeric Patterns');
  lines.push('```cpp');
  lines.push('// Avoid division by zero');
  lines.push('if (!qFuzzyIsNull(denominator)) { result = numerator / denominator; }');
  lines.push('');
  lines.push('// Safe integer comparison (avoid overflow)');
  lines.push('if (qAddOverflow(a, b, &result)) { /* handle overflow */ }');
  lines.push('');
  lines.push('// Portable byte swapping');
  lines.push('quint32 swapped = qToBigEndian(value);');
  lines.push('');
  lines.push('// CRC / checksum');
  lines.push('#include <QtEndian>');
  lines.push('quint16 crc = qChecksum(QByteArrayView(data));');
  lines.push('```');

  lines.push('\n---');
  lines.push('Use `QtMath eval "expression"` to evaluate a math expression.');

  return lines.join('\n');
}

// ─── Safe expression evaluator ──────────────────────────────────────────────

function evaluateExpression(expr: string): string {
  const lines: string[] = [];
  lines.push('## Math Evaluation\n');

  // Sanitize: only allow numbers, operators, parens, basic math functions, whitespace
  const sanitized = expr.replace(/\s+/g, ' ').trim();

  // Define safe math functions
  const SAFE_MATH_FUNCS = [
    'sin',
    'cos',
    'tan',
    'sqrt',
    'abs',
    'log',
    'log10',
    'exp',
    'floor',
    'ceil',
    'round',
    'pow',
    'min',
    'max',
    'pi',
    'e',
  ];

  // Remove all safe function names temporarily for validation
  let exprForValidation = sanitized.toLowerCase();
  for (const func of SAFE_MATH_FUNCS) {
    exprForValidation = exprForValidation.replace(new RegExp(`\\b${func}\\b`, 'gi'), '');
  }

  // After removing safe functions, only safe chars should remain
  const SAFE_CHAR_PATTERN = /^[0-9+\-*/().%^\s]*$/;
  if (!SAFE_CHAR_PATTERN.test(exprForValidation)) {
    return `**Error**: expression contains unsafe characters or forbidden identifiers.\nExpression: \`${sanitized}\`\nOnly allowed: numbers, operators (+,-,*,/,%,^), parentheses, and functions (${SAFE_MATH_FUNCS.join(', ')}).`;
  }

  // Try native eval with Function constructor (safer than eval)
  try {
    // Map common math function names
    const mapped = sanitized
      .replace(/\bpi\b/gi, 'Math.PI')
      .replace(/\be\b/gi, 'Math.E')
      .replace(/\^/g, '**') // power operator
      .replace(/\b(?:sin|cos|tan|sqrt|abs|log|log10|exp|floor|ceil|round|pow|min|max)\b/gi, (m) => `Math.${m}`);

    const result = new Function(`"use strict"; return (${mapped})`)();

    if (typeof result !== 'number' || !isFinite(result)) {
      return `**Error**: result is not a finite number (got: ${result}).\nExpression: \`${sanitized}\``;
    }

    lines.push(`\`${sanitized}\` = **${result}**`);

    // Also show hex for integers
    if (Number.isInteger(result) && result >= 0 && result <= 0xffffffff) {
      lines.push(`Hex: 0x${result.toString(16).toUpperCase()}`);
    }

    // Binary for small numbers
    if (Number.isInteger(result) && result >= 0 && result <= 255) {
      lines.push(`Binary: 0b${result.toString(2)}`);
    }
  } catch (err) {
    return `**Error**: could not evaluate \`${sanitized}\` — ${err instanceof Error ? err.message : String(err)}`;
  }

  return lines.join('\n');
}
