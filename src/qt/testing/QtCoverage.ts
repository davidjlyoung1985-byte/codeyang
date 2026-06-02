/**
 * QtCoverage — Analyze test coverage gaps for a Qt project.
 * Cross-references:
 *   - Declared signals/slots/properties (from headers)
 *   - Existing test files (matching tst_*.cpp convention)
 *   - Signal-slot connections (from QtSignals tool logic)
 *
 * Reports untested: classes, signals, slots, properties, and connections.
 */
import { readdir, readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join, extname, basename } from 'node:path';

interface CoverableItem {
  className: string;
  itemType: 'class' | 'signal' | 'slot' | 'property' | 'connection';
  itemName: string;
  tested: boolean;
  testFile?: string;
}

interface CoverageReport {
  classes: string[];
  items: CoverableItem[];
  totalItems: number;
  coveredItems: number;
}

export async function executeQtCoverage(cwd?: string): Promise<string> {
  const base = cwd || process.cwd();
  const headers = await findQtHeaders(base);
  const testFiles = await findTestFiles(base);

  const report: CoverageReport = {
    classes: [],
    items: [],
    totalItems: 0,
    coveredItems: 0,
  };

  // Parse headers and check against test files
  for (const header of headers) {
    try {
      const content = await readFile(header, 'utf-8');
      const classes = extractClassNames(content, header);

      for (const ci of classes) {
        report.classes.push(ci.className);

        // Check if a test file exists for this class
        const testFile = findMatchingTest(ci.className, testFiles);
        report.items.push({
          className: ci.className,
          itemType: 'class',
          itemName: ci.className,
          tested: !!testFile,
          testFile,
        });
        report.totalItems++;

        // Check each signal
        for (const sig of ci.signals) {
          const sigTested = testFile ? hasSignalTest(testFile, ci.className, sig) : false;
          report.items.push({
            className: ci.className,
            itemType: 'signal',
            itemName: sig,
            tested: sigTested,
            testFile,
          });
          report.totalItems++;
          if (sigTested) report.coveredItems++;
        }

        // Check each slot
        for (const slot of ci.slots) {
          const slotTested = testFile ? hasSlotTest(testFile, ci.className, slot) : false;
          report.items.push({
            className: ci.className,
            itemType: 'slot',
            itemName: slot,
            tested: slotTested,
            testFile,
          });
          report.totalItems++;
          if (slotTested) report.coveredItems++;
        }

        // Check each property
        for (const prop of ci.properties) {
          const propTested = testFile ? hasPropertyTest(testFile, prop) : false;
          report.items.push({
            className: ci.className,
            itemType: 'property',
            itemName: prop,
            tested: propTested,
            testFile,
          });
          report.totalItems++;
          if (propTested) report.coveredItems++;
        }
      }
    } catch {
      // skip
    }
  }

  // Check connections coverage
  const srcFiles = await findSourceFiles(base);
  const connections = await extractConnections(srcFiles);
  for (const conn of connections) {
    const connTested = testFiles.some((tf) => {
      try {
        const tc = readFileSync(tf, 'utf-8');
        return tc.includes(conn.sender) && tc.includes(conn.signal);
      } catch {
        return false;
      }
    });
    report.items.push({
      className: conn.sender.split('::')[0] || conn.sender,
      itemType: 'connection',
      itemName: `${conn.sender}::${conn.signal} → ${conn.receiver}::${conn.slot}`,
      tested: connTested,
    });
    report.totalItems++;
    if (connTested) report.coveredItems++;
  }

  // Class-level coverage
  for (const item of report.items) {
    if (item.tested) report.coveredItems++;
  }

  return formatCoverageReport(report, base);
}

interface ParsedClass {
  className: string;
  signals: string[];
  slots: string[];
  properties: string[];
}

function extractClassNames(content: string, _filePath: string): ParsedClass[] {
  const classes: ParsedClass[] = [];
  const classRegex = /class\s+(\w+)\s*(?::\s*public\s+\w+)?\s*\{/g;
  let cm;
  while ((cm = classRegex.exec(content)) !== null) {
    const name = cm[1];
    const startIdx = cm.index + cm[0].length;

    // Find matching closing brace
    let depth = 1;
    let endIdx = startIdx;
    for (let i = startIdx; i < content.length && depth > 0; i++) {
      if (content[i] === '{') depth++;
      else if (content[i] === '}') depth--;
      if (depth === 0) endIdx = i;
    }
    const body = content.slice(startIdx, endIdx);

    if (!body.includes('Q_OBJECT')) continue;

    // Extract signals — stop at next access level or class end
    const sigSection = body.match(
      /signals\s*:([\s\S]*?)(?=\n\s*(?:(?:public|private|protected)(?:\s+slots)?\s*:)|\s*$)/,
    );
    const signals: string[] = [];
    if (sigSection) {
      const sigRegex = /void\s+(\w+)\s*\(/g;
      let sm;
      while ((sm = sigRegex.exec(sigSection[1])) !== null) {
        signals.push(sm[1]);
      }
    }

    // Extract slots
    const slotSection = body.match(
      /(?:public|protected|private)\s+slots\s*:([\s\S]*?)(?=\n\s*(?:(?:public|private|protected)(?:\s+slots)?\s*:|signals\s*:|\}))/,
    );
    const slots: string[] = [];
    if (slotSection) {
      const slotRegex = /void\s+(\w+)\s*\(/g;
      let slm;
      while ((slm = slotRegex.exec(slotSection[1])) !== null) {
        slots.push(slm[1]);
      }
    }

    // Extract properties
    const properties: string[] = [];
    const propRegex = /Q_PROPERTY\s*\([^)]*\s+(\w+)\s*[^)]*\)/g;
    let pm;
    while ((pm = propRegex.exec(body)) !== null) {
      properties.push(pm[1]);
    }

    classes.push({ className: name, signals, slots, properties });
  }
  return classes;
}

async function findQtHeaders(dir: string): Promise<string[]> {
  const results: string[] = [];
  const skip = new Set(['node_modules', '.git', 'build', 'dist', 'moc_', 'ui_', 'qrc_']);
  async function walk(d: string) {
    let entries;
    try { entries = await readdir(d, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && !skip.has(entry.name) && !entry.name.startsWith('moc_') && !entry.name.startsWith('ui_')) {
          await walk(full);
        }
      } else if (entry.isFile() && ['.h', '.hpp'].includes(extname(entry.name).toLowerCase()) && !entry.name.startsWith('moc_') && !entry.name.startsWith('ui_')) {
        results.push(full);
      }
    }
  }
  await walk(dir);
  return results;
}

async function findTestFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  const skip = new Set(['node_modules', '.git', 'build', 'dist']);
  async function walk(d: string) {
    let entries;
    try { entries = await readdir(d, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && !skip.has(entry.name)) await walk(full);
      } else if (entry.isFile() && (entry.name.startsWith('tst_') || entry.name.endsWith('_test.cpp') || entry.name.endsWith('Test.cpp'))) {
        results.push(full);
      }
    }
  }
  await walk(dir);
  return results;
}

async function findSourceFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  const skip = new Set(['node_modules', '.git', 'build', 'dist']);
  async function walk(d: string) {
    let entries;
    try { entries = await readdir(d, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && !skip.has(entry.name)) await walk(full);
      } else if (entry.isFile() && ['.cpp', '.h', '.hpp', '.cxx'].includes(extname(entry.name).toLowerCase())) {
        results.push(full);
      }
    }
  }
  await walk(dir);
  return results;
}

function findMatchingTest(className: string, testFiles: string[]): string | undefined {
  const lower = className.toLowerCase();
  return testFiles.find((f) => {
    const b = basename(f).toLowerCase();
    return b.includes(`tst_${lower}`) || b.includes(`${lower}_test`) || b.includes(`${lower}test`);
  });
}

function hasSignalTest(testFile: string, className: string, signal: string): boolean {
  try {
    const content = readFileSync(testFile, 'utf-8');
    return content.includes(`test_signal_${signal}`) || content.includes(`QSignalSpy`) && content.includes(signal);
  } catch {
    return false;
  }
}

function hasSlotTest(testFile: string, className: string, slot: string): boolean {
  try {
    const content = readFileSync(testFile, 'utf-8');
    return content.includes(`test_slot_${slot}`) || content.includes(`test_${slot}`);
  } catch {
    return false;
  }
}

function hasPropertyTest(testFile: string, propName: string): boolean {
  try {
    const content = readFileSync(testFile, 'utf-8');
    return content.includes(`test_property_${propName}`) || content.includes(`"${propName}"`) && content.includes('QCOMPARE');
  } catch {
    return false;
  }
}

interface Connection {
  sender: string;
  signal: string;
  receiver: string;
  slot: string;
}

async function extractConnections(files: string[]): Promise<Connection[]> {
  const results: Connection[] = [];
  for (const file of files.slice(0, 50)) {
    try {
      const content = await readFile(file, 'utf-8');
      const regex = /connect\s*\(\s*(\w+)\s*,\s*&(\w+)::(\w+)\s*,\s*(\w+)\s*,\s*&(\w+)::(\w+)/g;
      let m;
      while ((m = regex.exec(content)) !== null) {
        results.push({
          sender: m[1],
          signal: `${m[2]}::${m[3]}`,
          receiver: m[4],
          slot: `${m[5]}::${m[6]}`,
        });
      }
    } catch { /* skip */ }
  }
  return results;
}

function formatCoverageReport(report: CoverageReport, _base: string): string {
  const lines: string[] = [];
  const coverageRate = report.totalItems > 0 ? Math.round((report.coveredItems / report.totalItems) * 100) : 0;

  lines.push(`## Qt Test Coverage Report\n`);
  lines.push(`**Overall**: ${coverageRate}% (${report.coveredItems}/${report.totalItems} items)\n`);

  // Group by class
  const classGroups = new Map<string, CoverableItem[]>();
  for (const item of report.items) {
    if (!classGroups.has(item.className)) classGroups.set(item.className, []);
    classGroups.get(item.className)!.push(item);
  }

  for (const [className, items] of classGroups) {
    const covered = items.filter((i) => i.tested).length;
    const total = items.length;
    const pct = total > 0 ? Math.round((covered / total) * 100) : 0;
    const hasTest = items.some((i) => i.testFile);

    lines.push(`### ${className}`);
    lines.push(`Coverage: ${pct}% (${covered}/${total})`);
    if (!hasTest) lines.push(':warning: No test file found for this class');
    lines.push('');

    // Untested items
    const untested = items.filter((i) => !i.tested && i.itemType !== 'class');
    if (untested.length > 0) {
      lines.push('**Untested items:**');
      for (const item of untested) {
        lines.push(`  - [ ] ${item.itemType}: \`${item.itemName}\``);
      }
      lines.push('');
    }
  }

  if (coverageRate < 50) {
    lines.push('> :warning: Low coverage. Use **QtTestGen** to generate test stubs for untested classes.');
  }

  return lines.join('\n');
}
