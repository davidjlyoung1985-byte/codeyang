# 测试覆盖率提升计划：52.7% → 60%

## 当前状态（2026-08-24）
- **整体分支覆盖率**: 52.46%
- **目标**: 60%
- **需要提升**: +7.54%

## 🎯 优先级模块（按影响力排序）

### 高优先级（预计提升 +5%）

#### 1. **agent/config.ts** - 分支覆盖 49%
**影响**: 核心配置模块
**未覆盖分支**: 106-212行（环境变量解析、验证逻辑）
**测试策略**:
- 环境变量缺失场景
- 无效配置值（负数、空字符串）
- 类型错误处理
- 边界值（maxTokens=0, maxTurns=999999）

#### 2. **circuit-breaker/index.ts** - 分支覆盖 28.2%
**影响**: 容错机制
**未覆盖分支**: 87-488行（熔断器状态转换）
**测试策略**:
- 失败率阈值触发
- 半开状态测试请求
- 超时重置逻辑
- 并发请求下的状态管理

#### 3. **closed-loop/index.ts** - 分支覆盖 28.12%
**影响**: 自动验证系统
**未覆盖分支**: 核心验证逻辑
**测试策略**:
- Write/Edit 后验证流程
- 编译错误检测
- Lint 错误自动修复
- 验证失败重试逻辑

#### 4. **sandbox/os-isolation.ts** - 分支覆盖 20%
**影响**: 安全隔离
**未覆盖分支**: 39-143行（OS 特定隔离）
**测试策略**:
- Windows/Linux/macOS 路径隔离
- 文件权限检查
- 符号链接处理
- 驱动器白名单（Windows）

#### 5. **planner/index.ts** - 分支覆盖 37.41%
**影响**: 任务规划
**未覆盖分支**: 计划生成和审批流程
**测试策略**:
- 简单任务识别（跳过规划）
- 复杂任务分解
- 用户审批流程
- 计划执行失败回退

### 中优先级（预计提升 +2%）

#### 6. **tools/shared.ts** - 分支覆盖 15%
**影响**: 工具共享逻辑
**未覆盖分支**: 23-142行
**测试策略**:
- 文件路径验证
- 错误格式化
- 通用工具函数

#### 7. **tools/rl-weighter.ts** - 分支覆盖 36.98%
**影响**: 强化学习权重
**未覆盖分支**: 221-381行
**测试策略**:
- 权重更新逻辑
- 奖励计算
- 状态转换

#### 8. **mcp/McpManager.ts** - 分支覆盖 36.84%
**影响**: MCP 服务器管理
**未覆盖分支**: 服务器启动/停止、错误处理
**测试策略**:
- 服务器启动失败
- 工具调用超时
- 配置无效

### 低优先级（暂不处理）

- **bridge/** (0-2%) - VS Code 桥接，需要 VS Code 环境，跳过
- **math/tools.ts** (0%) - 未使用的模块，建议删除或排除
- **tools/auto-docs.ts** (0%) - 自动文档生成，未启用

---

## 📋 实施计划

### Phase 1: 核心模块（预计 +3%）
**时间**: 1-2 小时
**模块**: agent/config.ts, circuit-breaker

1. **agent/config.test.ts** 补充测试
   - 新增 50+ 测试用例
   - 覆盖所有环境变量解析路径
   - 测试无效配置处理

2. **circuit-breaker.test.ts** 补充测试
   - 状态转换完整测试
   - 并发场景测试
   - 超时重置测试

### Phase 2: 功能模块（预计 +2.5%）
**时间**: 1-2 小时
**模块**: closed-loop, sandbox/os-isolation

3. **closed-loop.test.ts** 补充测试
   - Write/Edit 验证流程
   - 自动修复测试
   - 重试逻辑测试

4. **os-isolation.test.ts** 新增测试
   - 跨平台路径测试
   - 权限检查测试
   - 白名单验证

### Phase 3: 辅助模块（预计 +2%）
**时间**: 1 小时
**模块**: planner, tools/shared, mcp

5. **planner.test.ts** 补充测试
   - 任务复杂度判断
   - 计划生成测试
   - 审批流程 mock

6. **shared.test.ts** 新增测试
   - 路径验证
   - 错误格式化

7. **McpManager.test.ts** 补充测试
   - 启动失败场景
   - 超时处理

---

## 🎯 预期成果

| 模块 | 当前分支覆盖 | 目标分支覆盖 | 贡献值 |
|------|-------------|-------------|--------|
| agent/config.ts | 49% | 75% | +1.5% |
| circuit-breaker | 28% | 60% | +1.8% |
| closed-loop | 28% | 60% | +1.5% |
| sandbox/os-isolation | 20% | 50% | +0.8% |
| planner | 37% | 60% | +1.2% |
| tools/shared | 15% | 50% | +0.5% |
| mcp | 37% | 55% | +0.8% |
| **总计** | **52.46%** | **60.56%** | **+8.1%** |

---

## 🚀 快速开始

```bash
# 运行当前覆盖率测试
npm run test:coverage

# 开始 Phase 1
npm test src/agent/config.test.ts
npm test src/circuit-breaker/index.test.ts

# 开始 Phase 2
npm test src/closed-loop/index.test.ts
npm test src/sandbox/os-isolation.test.ts

# 开始 Phase 3
npm test src/planner/index.test.ts
npm test src/tools/shared.test.ts
npm test src/mcp/McpManager.test.ts

# 验证最终覆盖率
npm run test:coverage
```

---

## 📝 测试编写原则

1. **优先测试分支逻辑** - if/else, switch, try/catch
2. **边界值测试** - 0, -1, null, undefined, 空字符串
3. **错误路径** - 异常抛出、网络失败、超时
4. **并发场景** - 多个请求同时处理
5. **平台差异** - Windows/Linux/macOS 特定逻辑

---

## ⚠️ 注意事项

1. **不要为了覆盖率而测试**
   - 避免测试琐碎的 getter/setter
   - 避免测试第三方库的行为

2. **Mock 外部依赖**
   - API 调用
   - 文件系统
   - 子进程

3. **保持测试独立**
   - 每个测试可独立运行
   - 不依赖测试顺序

---

## 🎉 成功标准

- ✅ 分支覆盖率 ≥ 60%
- ✅ 所有新测试通过
- ✅ CI 构建成功
- ✅ 测试运行时间 < 5 分钟
