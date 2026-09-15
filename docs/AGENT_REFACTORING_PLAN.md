# Agent.ts 拆分方案

## 当前状态
- **原始文件**: `src/agent/Agent.ts` - 877 行
- **目标**: 拆分为多个模块，每个 < 300 行

## 已完成的模块（311 行总计）

### 1. `src/agent/core/types.ts` (88 行)
**职责**: 共享类型定义
- AgentCallbacks 接口
- AgentState 接口
- AssistantContentBlock 类型
- ToolResultBlock 类型
- 常量定义

### 2. `src/agent/core/verification.ts` (130 行)
**职责**: 验证和反馈处理
- `runAutoVerify()` - 自动验证工具输出
- `runReflexion()` - 自反思系统
- `runSelfCritique()` - 自我批评
- `pushCancelledToolResults()` - 取消工具结果

### 3. `src/agent/core/context.ts` (93 行)
**职责**: 上下文准备和丰富
- `prepareContext()` - 准备对话上下文
- `enrichWithPlanning()` - 添加规划功能
- Tree-of-Thoughts 集成
- Planner 集成

## 下一步拆分计划

### Phase 1: 工具执行模块
```
src/agent/core/tool-execution.ts (预计 150-200 行)
- executeToolBatch()
- handleToolResults()
- checkRepetition()
```

### Phase 2: 流式处理模块
```
src/agent/core/streaming.ts (预计 100-150 行)
- handleStreamChunk()
- collectAssistantResponse()
- timeoutProtection()
```

### Phase 3: 主循环重构
```
src/agent/core/run-loop.ts (预计 200-250 行)
- mainRunLoop()
- turnIteration()
- gatewaySetup()
```

### Phase 4: 精简后的 Agent.ts
```
src/agent/Agent.ts (预计 250-300 行)
- 构造函数
- 公共 API 方法
- Getter/Setter
- 委托给核心模块
```

## 预期结果

**拆分后**:
| 文件 | 行数 | 职责 |
|------|------|------|
| Agent.ts | ~300 | 主类和公共 API |
| core/types.ts | 88 | 类型定义 |
| core/verification.ts | 130 | 验证和反馈 |
| core/context.ts | 93 | 上下文处理 |
| core/tool-execution.ts | ~180 | 工具执行 |
| core/streaming.ts | ~120 | 流式处理 |
| core/run-loop.ts | ~220 | 主运行循环 |
| **总计** | **~1131** | 7 个模块 |

**改进效果**:
- ✅ 每个模块 < 300 行（高度可维护）
- ✅ 清晰的职责分离
- ✅ 易于测试
- ✅ 易于理解和修改

## 当前进度

**阶段**: Phase 1 部分完成 (35% 完成)
- ✅ 类型定义模块
- ✅ 验证模块
- ✅ 上下文模块
- ⏳ 工具执行模块（待完成）
- ⏳ 流式处理模块（待完成）
- ⏳ 主循环模块（待完成）
- ⏳ Agent.ts 重构（待完成）

## 技术债务

1. **保持向后兼容**: 确保公共 API 不变
2. **测试覆盖**: 重构后运行完整测试套件
3. **导入路径**: 更新所有导入 Agent 的文件

---

**创建时间**: 2026年9月15日  
**状态**: 进行中
