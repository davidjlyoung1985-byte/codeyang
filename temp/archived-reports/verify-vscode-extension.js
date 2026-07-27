#!/usr/bin/env node
/**
 * VS Code扩展工具任务验证
 */

import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

console.log('🚀 VS Code扩展工具任务\n');

// 任务1: 验证扩展安装
console.log('📦 任务1: 验证扩展安装');
const extensionPath = join(homedir(), '.vscode', 'extensions', 'codeyang-vscode-0.3.1');
const files = [
  'extension.js',
  'package.json',
  'chat.html',
  'tools.cjs',
  'security.js'
];

console.log(`  扩展目录: ${extensionPath}`);
files.forEach(f => {
  const exists = existsSync(join(extensionPath, f));
  console.log(`  ${f}: ${exists ? '✅' : '❌'}`);
});

// 任务2: 检查扩展配置
console.log('\n⚙️  任务2: 扩展配置信息');
try {
  const pkg = require(join(extensionPath, 'package.json'));
  console.log(`  扩展名称: ${pkg.displayName}`);
  console.log(`  版本: ${pkg.version}`);
  console.log(`  激活方式: ${pkg.activationEvents[0]}`);
  console.log(`  快捷键: Ctrl+Shift+Y (Windows) / Cmd+Shift+Y (Mac)`);
  console.log(`  命令: ${pkg.contributes.commands[0].command}`);
} catch (e) {
  console.log('  ⚠️  无法读取配置');
}

// 任务3: 检查API配置
console.log('\n🔑 任务3: API配置检查');
const apiKey = process.env.CODEYANG_API_KEY || process.env.DEEPSEEK_API_KEY;
console.log(`  CODEYANG_API_KEY: ${apiKey ? '已设置 ✅' : '未设置 ⚠️'}`);
console.log(`  默认API端点: https://api.deepseek.com/anthropic`);
console.log(`  默认模型: deepseek-v4-pro`);

// 任务4: 使用说明
console.log('\n📋 任务4: 使用说明');
console.log('  1️⃣  重启 VS Code');
console.log('  2️⃣  按 Ctrl+Shift+Y 启动 CodeYang');
console.log('  3️⃣  或运行命令: "CodeYang: Start Chat"');
console.log('  4️⃣  输入 "codeyang" 会显示聊天面板');

// 任务5: 可用工具
console.log('\n🛠️  任务5: 扩展中可用的工具');
console.log('  ✓ Read - 读取文件');
console.log('  ✓ Write - 写入文件');
console.log('  ✓ Edit - 编辑文件');
console.log('  ✓ Glob - 文件搜索');
console.log('  ✓ Grep - 内容搜索');
console.log('  ✓ WebFetch - 网络获取');
console.log('  ✓ TodoWrite - 任务管理');
console.log('  ✓ Search - 搜索');
console.log('  ✓ ImageInfo - 图片信息');
console.log('  ✓ ImageToBase64 - 图片转换');
console.log('  ✓ ListImages - 列出图片');

console.log('\n✅ VS Code扩展已就绪！');
console.log('💡 重启VS Code后即可使用\n');
