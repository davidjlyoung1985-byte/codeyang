import { WatcherSystem, VerificationPipeline } from './src/closed-loop/index.js';
import { resolve } from 'node:path';

// 项目根目录
const projectDir = process.cwd();

console.log('\n' + '='.repeat(80));
console.log('🔄 CodeYang 闭环反馈系统');
console.log('='.repeat(80));

// 创建验证管道
const pipeline = new VerificationPipeline(projectDir);
pipeline.setMaxFixIterations(3);

console.log('\n✅ 验证管道已创建');
console.log(`   最大修复迭代次数: 3`);

// 创建监控系统
const watcher = new WatcherSystem(async (rule, ctx) => {
  console.log(`\n${'─'.repeat(80)}`);
  console.log(`[闭环反馈] 触发规则: ${rule.label || rule.id}`);
  console.log(`[闭环反馈] 文件: ${ctx.filePath}`);
  console.log(`[闭环反馈] 动作: ${rule.action}`);

  if (rule.action === 'auto-verify') {
    try {
      console.log(`[闭环反馈] 🔍 开始验证...`);
      const t0 = Date.now();
      const { results, fixed } = await pipeline.verifyWithFix(ctx.filePath);
      const duration = Date.now() - t0;

      console.log(`\n${pipeline.formatSummary(results)}`);
      console.log(`\n⏱️  验证耗时: ${duration}ms`);

      if (fixed) {
        console.log(`✅ 自动修复已应用`);
      }

      // 显示详细结果
      console.log(`\n详细结果:`);
      for (const result of results) {
        const status = result.passed ? '✅' : '❌';
        console.log(`  ${status} ${result.tool.padEnd(10)} (${result.durationMs}ms)`);
        if (!result.passed && result.output) {
          const preview = result.output.slice(0, 300).split('\n').map(l => `    ${l}`).join('\n');
          console.log(preview);
        }
      }
    } catch (err) {
      console.error(`[闭环反馈] ❌ 验证失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else if (rule.action === 'notify') {
    console.log(`[闭环反馈] 🔔 通知: 文件已变化`);
  }
  console.log(`${'─'.repeat(80)}`);
});

console.log('\n✅ 监控系统已创建');

// 添加规则1：监控TypeScript文件变化，自动验证
watcher.addRule({
  id: 'auto-verify-ts',
  source: { type: 'file', pattern: '.*\\.ts$' },
  action: 'auto-verify',
  label: '自动验证TypeScript文件',
  condition: (ctx) => {
    // 排除node_modules、dist、.git目录
    return !ctx.filePath.includes('node_modules') &&
           !ctx.filePath.includes('dist') &&
           !ctx.filePath.includes('.git') &&
           !ctx.filePath.includes('test-closed-loop-example.ts'); // 排除测试文件
  }
});

// 添加规则2：Write/Edit工具执行后自动验证
watcher.addRule({
  id: 'post-tool-verify',
  source: { type: 'post-tool', toolNames: ['Write', 'Edit'] },
  action: 'auto-verify',
  label: '工具执行后自动验证'
});

console.log('\n✅ 已添加监控规则:');
console.log(`   • 自动验证TypeScript文件 (文件变化触发)`);
console.log(`   • 工具执行后自动验证 (Write/Edit后触发)`);

// 启动监控
console.log(`\n${'='.repeat(80)}`);
console.log(`🚀 启动监控系统`);
console.log(`   项目目录: ${projectDir}`);
console.log(`   活跃规则: ${watcher.ruleCount} 个`);
console.log(`${'='.repeat(80)}\n`);

watcher.start(projectDir);

console.log('✅ 闭环反馈系统已启动！');
console.log('\n📝 修改任意 src/ 下的 .ts 文件来触发自动验证');
console.log('⏹️  按 Ctrl+C 停止\n');

// 监听Ctrl+C优雅退出
process.on('SIGINT', () => {
  console.log('\n\n⏹️  停止监控系统...');
  watcher.stop();
  console.log('✅ 已停止');
  process.exit(0);
});

// 测试：模拟工具调用后触发
setTimeout(() => {
  console.log('\n🧪 测试: 模拟 Write 工具调用...');
  watcher.checkPostTool({
    filePath: resolve(projectDir, 'src/agent/Agent.ts'),
    toolName: 'Write',
    toolInput: {}
  });
}, 2000);

// 保持进程运行
process.stdin.resume();
