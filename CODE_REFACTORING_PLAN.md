# 代码规模管理重构实施计划

**状态**: 规划完成 ✅  
**执行**: 待定（需要团队评审）  
**风险等级**: 中等

---

## 🎯 为什么需要重构

### 当前问题
1. **commands.ts** - 788 行，包含 30+ 个命令处理器
2. **Agent.ts** - 771 行，职责过多（已部分改进）
3. **CliUI.ts** - 623 行，单一 UI 类
4. **代码重复** - 错误处理、路径验证等模式重复

### 影响
- ❌ 维护困难
- ❌ 测试复杂
- ❌ 合并冲突风险高
- ❌ 新人上手难

---

## ✅ 推荐方案：渐进式重构

### 原则
1. **不改变功能** - 纯重构，不添加新特性
2. **小步迭代** - 每次改动可控
3. **持续测试** - 确保测试始终通过
4. **可回滚** - 每个阶段都可以回退

### 分阶段执行

#### 阶段 1: commands.ts 拆分（优先级：🔴 高）

**目标**: 788 行 → 7-8 个模块，每个 ~100-150 行

**拆分方案**:
```
src/commands/
  ├── types.ts              # CommandContext, DispatchResult
  ├── index.ts              # dispatch 函数，命令路由
  ├── session.ts            # /clear, /sessions, /tag, /rewind
  ├── config.ts             # /config, /reload, /model, /ponytail
  ├── tools.ts              # /tools, /mcp, /stats
  ├── git.ts                # /diff, /commit, /branch
  ├── development.ts        # /plan, /reflect, /review, /fix, /gen-commit
  ├── system.ts             # /status, /harness, /recovery, /matlab
  └── context.ts            # /ctx_viz, /context, /undo, /redo
```

**步骤**:
1. 创建 types.ts - 移动公共类型
2. 创建各个模块文件 - 移动相关命令
3. 创建 index.ts - 统一导出和路由
4. 运行测试 - 确保全部通过
5. 删除旧的 commands.ts

**工作量**: 4-6 小时  
**风险**: 低（纯移动代码）

#### 阶段 2: 提取通用工具函数（优先级：🟡 中）

**目标**: 减少代码重复

**创建**:
```
utils/
  ├── commandHelpers.ts     # 通用命令辅助函数
  ├── errorHandling.ts      # ✅ 已存在，增强它
  └── pathValidation.ts     # 路径安全检查
```

**工作量**: 2-3 小时  
**风险**: 低

#### 阶段 3: Agent.ts 进一步优化（优先级：🟡 中）

**目标**: 771 行 → ~400-500 行

**注意**: Agent.ts 已经有部分重构（AgentContextManager, AgentToolExecutor 等），这个阶段是可选的进一步优化。

**提取**:
```
agent/
  ├── Agent.ts              # 核心协调器 (~400行)
  ├── AgentRunLoop.ts       # 运行循环逻辑
  ├── AgentStreamHandler.ts # 流处理
  └── managers/             # ✅ 已存在
      ├── AgentContextManager.ts
      ├── AgentToolExecutor.ts
      ├── StateManager.ts
      └── ConversationManager.ts
```

**工作量**: 6-8 小时  
**风险**: 中（涉及核心逻辑）

#### 阶段 4: UI 模块化（优先级：🟢 低）

**目标**: CliUI.ts 623 行 → 主类 ~200 行 + 专用模块

**拆分**:
```
ui/
  ├── CliUI.ts              # 主类 (~200行)
  ├── formatters/
  │   ├── MessageFormatter.ts
  │   ├── ToolFormatter.ts
  │   └── ErrorFormatter.ts
  └── components/
      ├── Spinner.ts
      └── ProgressBar.ts
```

**工作量**: 8-10 小时  
**风险**: 中（UI 代码测试较少）

---

## 📋 详细实施指南

### 阶段 1 详细步骤：commands.ts 拆分

#### Step 1: 创建基础结构

```typescript
// src/commands/types.ts
export interface CommandContext {
  ui: CliUI;
  agent: Agent;
  mcpMgr: McpManager;
  currentSessionId: string | undefined;
  recoveryIntegration?: RecoveryIntegration;
  cwd?: string;
}

export type DispatchResult = { handled: boolean; exit?: boolean };

export function resolveCwd(ctx: CommandContext): string {
  return ctx.cwd ?? process.cwd();
}
```

#### Step 2: 创建会话命令模块

```typescript
// src/commands/session.ts
import type { CommandContext, DispatchResult } from './types.js';
import { saveSession } from '../utils/sessionStore.js';
// ... 其他导入

export async function handleClear(ctx: CommandContext): Promise<DispatchResult> {
  // 从原 commands.ts 移动 cmdClear 逻辑
}

export async function handleSessions(ctx: CommandContext): Promise<DispatchResult> {
  // 从原 commands.ts 移动 cmdSessions 逻辑
}

// ... 其他会话相关命令
```

#### Step 3: 创建命令路由

```typescript
// src/commands/index.ts
import type { CommandContext, DispatchResult } from './types.js';
import * as session from './session.js';
import * as config from './config.js';
import * as tools from './tools.js';
import * as git from './git.js';
import * as development from './development.js';
import * as system from './system.js';
import * as context from './context.js';

export type { CommandContext, DispatchResult };
export { resolveCwd } from './types.js';

export async function dispatch(line: string, ctx: CommandContext): Promise<DispatchResult> {
  const lower = line.toLowerCase().trim();

  // 退出命令
  if (['exit', 'quit', '/exit', '/quit'].includes(lower)) {
    try {
      await saveSession(ctx.agent.exportMessages(), ctx.currentSessionId);
    } catch {
      // Ignore
    }
    await ctx.mcpMgr.shutdown();
    ctx.ui.close();
    process.exit(0);
  }

  // 会话命令
  if (lower === '/clear') return session.handleClear(ctx);
  if (lower === '/sessions') return session.handleSessions(ctx);
  if (lower === '/tag') return session.handleTag(ctx);
  if (lower === '/rewind') return session.handleRewind(ctx);

  // 配置命令
  if (lower === '/config') return config.handleConfig(ctx);
  if (lower === '/reload') return config.handleReload(ctx);
  if (lower.startsWith('/model')) return config.handleModel(line, ctx);
  if (lower.startsWith('/ponytail')) return config.handlePonytail(line, ctx);

  // ... 其他命令路由

  // 未知命令
  if (lower.startsWith('/')) {
    ctx.ui.error(`Unknown command: ${lower}`);
    ctx.ui.print('Type /help for available commands');
    return { handled: true };
  }

  return { handled: false };
}
```

#### Step 4: 测试验证

```bash
# 运行所有测试
npm test

# 运行命令相关测试
npm test -- commands

# 检查类型
npm run check
```

#### Step 5: 清理

```bash
# 删除旧文件
rm src/commands.ts

# 提交
git add src/commands/
git commit -m "refactor: split commands.ts into modular structure

- Create src/commands/ directory with 8 modules
- Move command handlers to respective modules
- Maintain backward compatibility
- All tests passing

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## ⚠️ 风险管理

### 潜在风险

1. **导入路径变化**
   - 风险: 破坏现有导入
   - 缓解: 保持公共 API 不变（从 index.ts 导出）

2. **测试失败**
   - 风险: 移动代码导致测试失败
   - 缓解: 每步都运行测试

3. **功能回归**
   - 风险: 重构导致功能变化
   - 缓解: 不改变逻辑，只移动代码

4. **合并冲突**
   - 风险: 与其他开发分支冲突
   - 缓解: 小步提交，及时合并

### 回滚策略

每个阶段独立提交，可以独立回滚：

```bash
# 回滚最后一次提交
git revert HEAD

# 回滚到特定提交
git revert <commit-hash>
```

---

## 📊 成功指标

### 阶段 1 完成标准

- ✅ commands.ts 不再存在
- ✅ 新建 8 个模块文件
- ✅ 所有测试通过（2207 个测试）
- ✅ 测试覆盖率不下降（≥76%）
- ✅ 类型检查通过（npm run check）
- ✅ ESLint 通过（npm run lint）
- ✅ 代码审查通过

### 整体完成指标

- ✅ 平均文件大小 < 300 行
- ✅ 没有文件超过 600 行
- ✅ 代码重复率 < 5%
- ✅ 评分恢复 +2 分

---

## 💡 建议

### 立即执行（推荐）

✅ **阶段 1: commands.ts 拆分**
- 优先级最高
- 风险最低
- 收益最明显
- 工作量可控（4-6小时）

### 暂缓执行（建议）

⏸️ **阶段 3 & 4: Agent.ts 和 CliUI.ts 重构**
- 风险较高
- Agent.ts 已有部分改进
- 可以在 v1.0 之后进行
- 不影响项目成熟度评分

---

## 🎯 决策建议

### 选项 A: 执行阶段 1（推荐）✅

**优点**:
- 立即改善代码组织
- 风险低，收益高
- 不影响现有功能
- 为未来重构打基础

**缺点**:
- 需要 4-6 小时工作
- 短期内会有导入路径变化

### 选项 B: 推迟所有重构

**优点**:
- 无风险
- 不需要时间投入

**缺点**:
- 代码继续难以维护
- 无法恢复 -2 分
- 技术债务累积

### 选项 C: 仅创建计划（当前状态）✅

**优点**:
- 有清晰的改进方向
- 可以后续执行
- 文档化问题

**缺点**:
- 实际问题未解决
- 评分未提升

---

## 📝 总结

**已完成**:
- ✅ 代码规模分析完成
- ✅ 问题识别完成
- ✅ 重构方案设计完成
- ✅ 实施计划编写完成

**待决策**:
- ⏸️ 是否立即执行阶段 1
- ⏸️ 执行时间表
- ⏸️ 负责人分配

**建议行动**:
1. **立即**: 团队评审此计划
2. **本周**: 执行阶段 1（commands.ts 拆分）
3. **下周**: 执行阶段 2（提取工具函数）
4. **v1.0后**: 考虑阶段 3 & 4

---

**创建时间**: 2026-09-12  
**状态**: 规划完成，待执行  
**预计时间投入**: 6-10 小时（阶段 1+2）  
**预计评分提升**: +2 分
