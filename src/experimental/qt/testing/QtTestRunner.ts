/**
 * QtTestRunner — Run QTest executables and parse results (txt or XML format).
 * Supports -xml output for structured result parsing.
 */
import { execa } from 'execa';
import { stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

export async function executeQtTestRunner(testPath: string, cwd?: string): Promise<string> {
  const base = cwd || process.cwd();
  const resolved = testPath.startsWith('/') || testPath.match(/^[A-Za-z]:/) ? testPath : join(base, testPath);

  // Check if the path exists
  try {
    const st = await stat(resolved);
    if (!st.isFile()) {
      return `Not a valid test executable: ${testPath}\n\nUse QtTestRunner on a compiled QTest binary.\nTip: Run QtBuild first to compile the tests.`;
    }
  } catch {
    return `Test executable not found: ${testPath}\n\nMake sure the test binary is compiled. Use QtBuild first.`;
  }

  const lines: string[] = [];
  lines.push(`## QTest Run: ${relative(base, resolved)}\n`);

  try {
    // Run with -xml for structured output
    const result = await execa(resolved, ['-xml'], {
      cwd: base,
      timeout: 120_000,
      reject: false,
      shell: process.platform === 'win32' ? 'powershell.exe' : true,
      env: { ...process.env, QT_QPA_PLATFORM: 'offscreen' },
    });

    const xmlOutput = result.stdout || '';
    const parsed = parseQTestXml(xmlOutput);

    if (parsed) {
      lines.push(formatTestReport(parsed));
    } else {
      // Fallback: show raw output
      const exitInfo = result.exitCode === 0 ? 'PASS' : `FAIL (exit ${result.exitCode})`;
      lines.push(`**Result**: ${exitInfo}\n`);
      const output = (result.stdout + '\n' + result.stderr).trim();
      lines.push('```');
      lines.push(output.slice(-2000)); // Last 2000 chars
      lines.push('```');
    }
  } catch (err) {
    lines.push(`**Error running test**: ${err instanceof Error ? err.message : String(err)}`);
  }

  return lines.join('\n');
}

interface TestResult {
  name: string;
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  failures: Array<{ test: string; message: string; file: string; line: number }>;
}

function parseQTestXml(xml: string): TestResult | null {
  const nameMatch = xml.match(/<TestCase\s+name="([^"]+)"/);
  if (!nameMatch) return null;

  const name = nameMatch[1];

  // Count test functions
  const testFunctions = xml.match(/<TestFunction\s+name="([^"]+)"/g) || [];

  // Count failures
  const failIncidents = xml.match(/<Incident\s+type="(?:fail|xpass)"[\s\S]*?>/g) || [];
  const skipIncidents = xml.match(/<Incident\s+type="skip"/g) || [];

  const totalTests = testFunctions.length;
  const failed = failIncidents.length;
  const skipped = skipIncidents.length;
  const passed = totalTests - failed - skipped;

  // Parse failures
  const failures: Array<{ test: string; message: string; file: string; line: number }> = [];
  const failureRegex =
    /<Incident\s+type="(?:fail|xpass)"[\s\S]*?<Description>[\s\S]*?<!\[CDATA\[([\s\S]*?)\]\]>[\s\S]*?<\/Description>/g;
  const fileRegex = /<Incident\s+type="(?:fail|xpass)"[\s\S]*?<File>([^<]+)<\/File>[\s\S]*?<Line>(\d+)<\/Line>/g;

  let fm;
  while ((fm = failureRegex.exec(xml)) !== null) {
    const msg = fm[1].trim().split('\n')[0]; // First line only
    failures.push({ test: '', message: msg, file: '', line: 0 });
  }

  // Fill in file/line info
  let flm;
  let flIdx = 0;
  while ((flm = fileRegex.exec(xml)) !== null && flIdx < failures.length) {
    failures[flIdx].file = flm[1];
    failures[flIdx].line = parseInt(flm[2]);
    flIdx++;
  }

  // Duration
  const durMatch = xml.match(/<Duration\s+msecs="(\d+)"/);
  const duration = durMatch ? parseInt(durMatch[1]) : 0;

  return { name, totalTests, passed, failed, skipped, duration, failures };
}

function formatTestReport(result: TestResult): string {
  const lines: string[] = [];

  const passRate = result.totalTests > 0 ? Math.round((result.passed / result.totalTests) * 100) : 0;
  const statusIcon = result.failed === 0 ? 'PASS' : 'FAIL';

  lines.push(`### ${statusIcon}: ${result.name}`);
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total | ${result.totalTests} |`);
  lines.push(`| Passed | ${result.passed} |`);
  lines.push(`| Failed | ${result.failed} |`);
  lines.push(`| Skipped | ${result.skipped} |`);
  lines.push(`| Duration | ${(result.duration / 1000).toFixed(2)}s |`);
  lines.push(`| Pass Rate | ${passRate}% |`);
  lines.push('');

  if (result.failures.length > 0) {
    lines.push('### Failures');
    for (const f of result.failures) {
      lines.push(`  - **${f.file}:${f.line}** — ${f.message}`);
    }
    lines.push('');
  }

  if (result.failed === 0 && result.totalTests > 0) {
    lines.push(':white_check_mark: All tests passing.');
  }

  return lines.join('\n');
}
