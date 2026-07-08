const { execSync } = require('child_process');
const fs = require('fs');
const out = execSync('npx vitest run', { cwd: 'e:/Qt/ai-code-agent', encoding: 'utf-8', timeout: 180000 });
const lines = out.split('\n').filter(l => l.includes('Test Files') || l.includes('Tests '));
console.log(lines.join('\n'));
