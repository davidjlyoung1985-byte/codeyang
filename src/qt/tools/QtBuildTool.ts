/**
 * QtBuildTool — Run Qt build commands (qmake/make or cmake) and parse output.
 */
import { execa } from 'execa';

export type QtBuildSystem = 'qmake' | 'cmake' | 'auto';

const KNOWN_QT_ERRORS: Array<{ pattern: RegExp; explanation: string }> = [
  {
    pattern: /undefined reference to `vtable for (\w+)/,
    explanation: 'Missing Q_OBJECT macro in class "$1", or header not listed in build file for MOC processing.',
  },
  {
    pattern: /undefined reference to `(.+)::metaObject/,
    explanation: 'Class "$1" is missing Q_OBJECT macro or its header is not processed by MOC.',
  },
  {
    pattern: /undefined reference to `(.+)::qt_metacast/,
    explanation: 'MOC not generating code for "$1". Ensure Q_OBJECT is in the class declaration (in .h file).',
  },
  {
    pattern: /No such file or directory.*ui_(\w+)\.h/,
    explanation:
      'Missing UIC-generated header. The .ui file must be listed in FORMS (qmake) or processed by AUTOUIC (cmake).',
  },
  {
    pattern: /moc: .* No such file/,
    explanation: "MOC can't find a header file. Check the header path in the build file.",
  },
  {
    pattern: /collect2: error: ld returned/,
    explanation: 'Linker error — likely missing library. Check LIBS (qmake) or target_link_libraries (cmake).',
  },
  {
    pattern: /cannot find -l(\w+)/,
    explanation: 'Linker can\'t find library "$1". Add it to LIBS (qmake) or target_link_libraries (cmake).',
  },
];

export async function executeQtBuild(buildSystem: QtBuildSystem, target: string, cwd?: string): Promise<string> {
  const workDir = cwd || process.cwd();
  const parts: string[] = [];
  const system = buildSystem === 'auto' ? 'cmake' : buildSystem;

  if (system === 'qmake') {
    parts.push('## Qt Build (qmake)');
    try {
      const qmake = await execa('qmake', target ? [target] : [], {
        cwd: workDir,
        timeout: 60_000,
        reject: false,
        shell: process.platform === 'win32' ? 'powershell.exe' : true,
      });
      if (qmake.exitCode !== 0) {
        parts.push('qmake failed:\n' + (qmake.stderr || qmake.stdout));
        return parts.join('\n');
      }
      parts.push('qmake: OK');

      const makeCmd = process.platform === 'win32' ? 'nmake' : 'make';
      const make = await execa(makeCmd, [], {
        cwd: workDir,
        timeout: 300_000,
        reject: false,
        shell: process.platform === 'win32' ? 'powershell.exe' : true,
      });
      parts.push(buildResult(make.stdout, make.stderr, make.exitCode ?? 1));
    } catch (err) {
      parts.push(`qmake not found: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    parts.push('## Qt Build (cmake)');
    try {
      const cmake = await execa('cmake', ['--build', '.', '--target', target || 'all'], {
        cwd: workDir,
        timeout: 300_000,
        reject: false,
        shell: process.platform === 'win32' ? 'powershell.exe' : true,
      });
      parts.push(buildResult(cmake.stdout, cmake.stderr, cmake.exitCode ?? 1));
    } catch (err) {
      parts.push(`cmake not found: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return parts.join('\n\n');
}

function buildResult(stdout: string, stderr: string, exitCode: number): string {
  // Extract only the last 50 lines of build output — focus on errors
  const cliOutput = (stdout + '\n' + stderr).trim();
  const lines = cliOutput.split('\n');
  const lastLines = lines.slice(-50);
  const output = lastLines.join('\n') || '(no output)';

  // Scan for known Qt errors
  const diagnostics: string[] = [];
  for (const diag of KNOWN_QT_ERRORS) {
    const match = cliOutput.match(diag.pattern);
    if (match) {
      diagnostics.push(`  - ${diag.explanation.replace(/\$(\d+)/g, (_, n) => match[parseInt(n)] || '')}`);
    }
  }

  const header = exitCode === 0 ? 'Build: SUCCESS' : `Build: FAILED (exit ${exitCode})`;
  let result = header + '\n\n```\n' + output + '\n```';
  if (diagnostics.length > 0) {
    result += '\n\n### Qt-Specific Diagnostics\n' + diagnostics.join('\n');
  }
  return result;
}
