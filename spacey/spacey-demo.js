#!/usr/bin/env node
/**
 * SpaceY Demo - JavaScript implementation for quick testing
 * This simulates the C++ version's functionality using Node.js
 */

import readline from 'readline';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('\x1b[36m╔══════════════════════════════════════╗\x1b[0m');
console.log('\x1b[36m║      SpaceY - AI Coding Agent      ║\x1b[0m');
console.log('\x1b[36m║    (Demo Mode - JavaScript)        ║\x1b[0m');
console.log('\x1b[36m╚══════════════════════════════════════╝\x1b[0m\n');

const apiKey = process.env.SPACEY_API_KEY || process.env.CODEYANG_API_KEY || process.env.DEEPSEEK_API_KEY;

if (!apiKey) {
    console.log('\x1b[33m⚠️  SPACEY_API_KEY not set\x1b[0m');
    console.log('Set it with: set SPACEY_API_KEY=your-key\n');
}

console.log('\x1b[32m✅ SpaceY initialized\x1b[0m');
console.log('\x1b[90mSimulating C++ native performance...\x1b[0m\n');

// Available tools
const tools = [
    { name: 'Read', desc: 'Read file contents' },
    { name: 'Write', desc: 'Write to file' },
    { name: 'List', desc: 'List directory' },
    { name: 'Bash', desc: 'Execute shell command' },
    { name: 'Git', desc: 'Git operations' },
    { name: 'Search', desc: 'Search files' }
];

console.log('\x1b[36m📦 Available Tools:\x1b[0m');
tools.forEach(t => console.log(`   • ${t.name.padEnd(10)} - ${t.desc}`));
console.log();

console.log('\x1b[35m💡 Examples:\x1b[0m');
console.log('   • "Read the package.json file"');
console.log('   • "List files in current directory"');
console.log('   • "Show git status"');
console.log('   • "What files are in src folder?"\n');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\x1b[32mYou>\x1b[0m '
});

rl.prompt();

rl.on('line', (input) => {
    const cmd = input.trim().toLowerCase();

    if (!cmd) {
        rl.prompt();
        return;
    }

    if (cmd === 'exit' || cmd === 'quit') {
        console.log('\x1b[36m👋 Goodbye!\x1b[0m');
        process.exit(0);
    }

    console.log('\x1b[33m🤖 SpaceY>\x1b[0m Analyzing request...\n');

    // Simple command detection
    try {
        if (cmd.includes('read') && cmd.includes('package.json')) {
            console.log('\x1b[90m[Tool: Read] Reading package.json...\x1b[0m');
            const content = fs.readFileSync('package.json', 'utf-8');
            const pkg = JSON.parse(content);
            console.log(`\x1b[32m✅ Found:\x1b[0m ${pkg.name} v${pkg.version}`);
            console.log(`   Description: ${pkg.description}`);
        } else if (cmd.includes('list') || cmd.includes('files')) {
            console.log('\x1b[90m[Tool: List] Listing files...\x1b[0m');
            const files = fs.readdirSync('.');
            console.log('\x1b[32m✅ Files:\x1b[0m');
            files.slice(0, 10).forEach(f => {
                const stat = fs.statSync(f);
                const type = stat.isDirectory() ? '📁' : '📄';
                console.log(`   ${type} ${f}`);
            });
            if (files.length > 10) console.log(`   ... and ${files.length - 10} more`);
        } else if (cmd.includes('git') && cmd.includes('status')) {
            console.log('\x1b[90m[Tool: Bash] Running git status...\x1b[0m');
            const output = execSync('git status --short', { encoding: 'utf-8' });
            console.log('\x1b[32m✅ Git status:\x1b[0m');
            console.log(output || '   Working tree clean');
        } else if (cmd.includes('src') || cmd.includes('folder')) {
            console.log('\x1b[90m[Tool: List] Checking src folder...\x1b[0m');
            if (fs.existsSync('src')) {
                const files = fs.readdirSync('src');
                console.log('\x1b[32m✅ src/ contents:\x1b[0m');
                files.slice(0, 10).forEach(f => console.log(`   📄 ${f}`));
            } else {
                console.log('\x1b[33m⚠️  src folder not found\x1b[0m');
            }
        } else {
            console.log('\x1b[36mℹ️  I can help with:\x1b[0m');
            console.log('   • Reading files (e.g., "read package.json")');
            console.log('   • Listing directories (e.g., "list files")');
            console.log('   • Git operations (e.g., "git status")');
            console.log('   • Exploring folders (e.g., "what\'s in src?")\n');
            console.log('\x1b[90m   Note: Full AI integration requires SPACEY_API_KEY\x1b[0m');
        }
    } catch (error) {
        console.log(`\x1b[31m❌ Error: ${error.message}\x1b[0m`);
    }

    console.log();
    rl.prompt();
});

rl.on('close', () => {
    console.log('\n\x1b[36m👋 SpaceY terminated\x1b[0m');
    process.exit(0);
});
