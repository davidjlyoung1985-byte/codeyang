# CodeYang 改进计划 - 2026年9月14日

## 当前问题分析

### 1. 分支覆盖率过低 (53%) 🔴 **优先级最高**
- **现状**: branches 覆盖率仅 53%，远低于 statements (65%)
- **原因**: 错误处理路径、边界条件测试不足
- **目标**: 提升至 65%+ (12个百分点提升)
- **重点文件**:
  - `src/commands.ts` (883行) - 命令处理逻辑复杂
  - `src/agent/Agent.ts` (877行) - 核心代理逻辑
  - 错误处理分支、异常路径

### 2. 文档过剩 ✅ **已部分完成**
- **现状**: 根目录从 33 个 .md 文件减少到 16 个
- **已归档**: 17 个历史文档移至 `docs/archive/`
- **剩余**: 16 个核心文档保留在根目录
- **建议**: 考虑将部署、集成文档移至 `docs/` 子目录

### 3. 超大文件需拆分 🟡 **中等优先级**
- `src/commands.ts` (883行) - 命令处理器
- `src/agent/Agent.ts` (877行) - 核心代理类
- **建议**: 按功能拆分为多个模块

---

## 改进任务清单

### Phase 1: 提升分支覆盖率 (53% → 65%+)

#### 1.1 识别低覆盖率模块
```bash
npm run test:coverage
# 重点关注 branches 覆盖率 < 50% 的文件
```

#### 1.2 补充错误路径测试
- [ ] 网络错误处理 (NetworkTool, WebFetchTool)
- [ ] 文件系统错误 (FileSystemTool, ReadTool, WriteTool)
- [ ] Git 操作失败 (GitTool)
- [ ] 权限拒绝场景 (Permission system)
- [ ] 输入验证失败 (inputValidation.ts)
- [ ] API 调用失败 (LLMClient)

#### 1.3 边界条件测试
- [ ] 空输入、null、undefined
- [ ] 超长字符串、大文件
- [ ] 特殊字符、路径遍历
- [ ] 并发竞争条件
- [ ] 超时场景

#### 1.4 条件分支覆盖
- [ ] if/else 两个分支都测试
- [ ] switch 所有 case 都覆盖
- [ ] 三元运算符两个分支
- [ ] 短路逻辑 (&&, ||)

### Phase 2: 拆分超大文件

#### 2.1 commands.ts (883行)
```
src/commands.ts
├── commands/index.ts          # 主入口
├── commands/session.ts        # 会话管理命令
├── commands/model.ts          # 模型切换
├── commands/tool.ts           # 工具相关
├── commands/ponytail.ts       # Ponytail 命令
└── commands/utility.ts        # 辅助命令
```

#### 2.2 Agent.ts (877行)
```
src/agent/Agent.ts
├── agent/core/Agent.ts        # 核心逻辑 (300行)
├── agent/core/ToolExecution.ts
├── agent/core/MessageHandling.ts
└── agent/core/StateManagement.ts
```

### Phase 3: 文档优化

#### 3.1 进一步归档
- [ ] 移动 `DEPLOYMENT*.md` 到 `docs/deployment/`
- [ ] 移动 `PONYTAIL-INTEGRATION.md` 到 `docs/features/`
- [ ] 移动 roadmap 文档到 `docs/planning/`

#### 3.2 保留根目录
- `README.md` - 项目概览
- `CHANGELOG.md` - 变更日志
- `CONTRIBUTING.md` - 贡献指南
- `LICENSE` - 许可证
- `QUICK_START.md` - 快速开始

---

## 预期效果

### 覆盖率目标
| 指标 | 当前 | 目标 | 提升 |
|------|------|------|------|
| Statements | 65% | 70% | +5% |
| **Branches** | **53%** | **65%** | **+12%** ⭐ |
| Functions | 68% | 72% | +4% |
| Lines | 66% | 70% | +4% |

### 代码质量
- 超大文件拆分后更易维护
- 错误处理更完善
- 测试覆盖更全面

### 项目评分
- **当前**: 85-87分
- **完成后**: 90-92分
- **主要提升**: 测试质量、代码组织

---

## 执行时间估计

- **Phase 1** (分支覆盖率): 2-3天
  - 识别低覆盖模块: 0.5天
  - 编写错误路径测试: 1.5天
  - 边界条件测试: 1天
  
- **Phase 2** (文件拆分): 1-2天
  - commands.ts 拆分: 1天
  - Agent.ts 拆分: 1天
  
- **Phase 3** (文档整理): 0.5天

**总计**: 4-6天工作量

---

## 立即行动

### 第一步: 生成覆盖率报告
```bash
npm run test:coverage
# 查看 coverage/index.html
# 识别红色 (branches < 50%) 的文件
```

### 第二步: 优先处理核心模块
1. `src/agent/Agent.ts`
2. `src/tools/BashTool.ts`
3. `src/tools/GitTool.ts`
4. `src/utils/inputValidation.ts`
5. `src/security/ssrf.ts`

### 第三步: 持续集成
- 每完成一个模块立即提交
- 观察 CI 覆盖率变化
- 确保不破坏现有测试

---

**更新日期**: 2026年9月14日
**负责人**: Claude Code
**状态**: 待执行
