const MIN = 18;

export function checkNodeVersion(): void {
  const major = Number(process.versions.node.split('.')[0]) || 0;
  if (major < MIN) {
    console.error(`\n  ❌ Node.js v${process.versions.node} is not supported.`);
    console.error(`  📋 CodeYang requires Node.js >= ${MIN}.0.0`);
    console.error(`  🔄 Upgrade: https://nodejs.org/en/download/\n`);
    process.exit(1);
  }
  if (process.env['CODEX_DEBUG']) {
    console.log(`[Node] v${process.versions.node} (ok)`);
  }
}
