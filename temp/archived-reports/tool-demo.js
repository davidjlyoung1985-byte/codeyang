#!/usr/bin/env node
/**
 * CodeYang 工具任务演示脚本
 *
 * 演示如何使用 CodeYang 的各种工具
 */

import { Agent } from './dist/chunk-VT2AGUDZ.js';

console.log('🚀 CodeYang 工具任务演示\n');

async function runToolDemo() {
  const agent = new Agent();

  console.log('📋 演示场景列表:');
  console.log('  1. 文件操作工具');
  console.log('  2. Git 工具');
  console.log('  3. 代码分析工具');
  console.log('  4. 数据处理工具');
  console.log('  5. 网络工具');
  console.log('');

  try {
    // 场景 1: 文件操作
    console.log('📁 场景 1: 文件操作工具演示');
    console.log('----------------------------------------');
    await agent.run('创建一个测试文件 demo.txt，内容是 "Hello CodeYang"');
    await agent.run('读取 demo.txt 的内容');
    await agent.run('列出当前目录的所有文件');
    console.log('✓ 文件操作完成\n');

    // 场景 2: Git 操作
    console.log('📦 场景 2: Git 工具演示');
    console.log('----------------------------------------');
    await agent.run('显示 git 状态');
    await agent.run('显示当前分支');
    console.log('✓ Git 操作完成\n');

    // 场景 3: 代码分析
    console.log('🔍 场景 3: 代码分析工具演示');
    console.log('----------------------------------------');
    await agent.run('分析 src/agent/Agent.ts 的代码复杂度');
    console.log('✓ 代码分析完成\n');

    // 场景 4: 项目统计
    console.log('📊 场景 4: 项目统计');
    console.log('----------------------------------------');
    await agent.run('统计 src 目录下的代码行数');
    console.log('✓ 统计完成\n');

  } catch (error) {
    console.error('❌ 错误:', error);
  }
}

// 运行演示
runToolDemo().catch(console.error);
