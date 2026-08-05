# 🔧 Agent 上帝类拆分重构方案

## 📊 当前问题诊断

### Agent.ts 现状
- **总行数：866 行** ⚠️ （建议 <300 行）
- **职责数：23+ 个私有字段**
- **依赖数：15+ 个外部组件**
- **典型的"上帝类"（God Class）特征**

### 违反的设计原则
1. ❌ **单一职责原则（SRP）** - 承担太多职责
2. ❌ **开闭原则（OCP）** - 难以扩展新功能
3. ❌ **依赖倒置原则（DIP）** - 高度依赖具体实现

---

## 🎯 拆分策略：按职责域拆分

### 拆分原则
- ✅ 每个类只负责一个职责域
- ✅ 每个类不超过 250 行
- ✅ 降低类之间的耦合度
- ✅ 提高可测试性和可维护性

---

## 📦 拆分方案（8 个类）

### 1️⃣ ConversationManager（对话管理）
**行数：** 150-200 行  
**职责：** 管理对话历史、checkpoints、上下文

```typescript
// src/agent/managers/ConversationManager.ts
export class ConversationManager {
  private history: LLMMessage[] = [];
  private checkpoints: LLMMessage[][] = [];
  
  addUserMessage(text: string): void
  addAssistantMessage(text: string, toolCalls?: ToolCall[]): void
  addToolResults(results: ToolResult[]): void
  
  getHistory(): LLMMessage[]
  clearHistory(): void
  
  saveCheckpoint(): void
  restoreCheckpoint(index: number): void
  listCheckpoints(): Checkpoint[]
}
```

---

### 2️⃣ StateManager（状态管理）
**行数：** 100-150 行  
**职责：** Token追踪、重复检测、问答状态

```typescript
// src/agent/managers/StateManager.ts
export class StateManager {
  private tokenUsage = { inputTokens: 0, outputTokens: 0 };
  private lastAssistantText = '';
  private recentAssistantTexts: string[] = [];
  private repeatCount = 0;
  private questionResolve: ((answer: string) => void) | null = null;
  
  updateTokenUsage(input: number, output: number): void
  getTokenUsage(): TokenUsage
  
  checkRepetition(text: string): boolean
  resetRepetition(): void
  
  askQuestion(question: string): Promise<string>
  answerQuestion(answer: string): void
}
```

---

### 3️⃣ HarnessCoordinator（Harness协调）
**行数：** 150-200 行  
**职责：** Gateway、Tracer、CircuitBreaker 统一管理

```typescript
// src/agent/managers/HarnessCoordinator.ts
export class HarnessCoordinator {
  private tracer: Tracer;
  private circuitBreakerManager: CircuitBreakerManager;
  private gateway: Gateway;
  private currentTraceId = '';
  
  startTrace(name: string): string
  endTrace(traceId: string): void
  addSpan(name: string, data: unknown): void
  
  async executeWithBreaker<T>(
    breakerName: string,
    fn: () => Promise<T>
  ): Promise<T>
  
  getHarnessStatus(): HarnessStatus
}
```

---

### 4️⃣ ThinkingEngine（思考引擎）
**行数：** 200-250 行  
**职责：** Reflexion、Planner、ToT、Critique 统一管理

```typescript
// src/agent/managers/ThinkingEngine.ts
export class ThinkingEngine {
  private reflexionEngine: ReflexionEngine;
  private critiqueEngine: CritiqueEngine;
  private planner: Planner;
  private treeOfThoughts: TreeOfThoughts;
  
  async reflect(context: ReflexionContext): Promise<ReflexionResult>
  async planTask(task: string): Promise<Plan>
  async exploreOptions(problem: string): Promise<ThoughtTree>
  async critique(code: string): Promise<CritiqueResult>
  
  getReflexionEngine(): ReflexionEngine
}
```

---

### 5️⃣ ClosedLoopManager（闭环管理）
**行数：** 150-200 行  
**职责：** 验证、反馈、观察、持续学习

```typescript
// src/agent/managers/ClosedLoopManager.ts
export class ClosedLoopManager {
  private verificationPipeline: VerificationPipeline | null;
  private feedbackInjector: FeedbackInjector;
  private watcher: WatcherSystem | null;
  private consolidationCounter = 0;
  
  async verify(result: ToolResult): Promise<VerificationResult>
  injectFeedback(feedback: Feedback): void
  hasPendingFeedback(): boolean
  
  setWatcher(watcher: WatcherSystem): void
  async consolidateIfNeeded(): Promise<void>
}
```

---

### 6️⃣ StreamHandler（流式处理）
**行数：** 150-200 行  
**职责：** LLM 流式响应处理、超时控制

```typescript
// src/agent/managers/StreamHandler.ts
export class StreamHandler {
  private abortController: AbortController | null = null;
  
  async handleStream(
    stream: AsyncIterable<Chunk>,
    callbacks: StreamCallbacks
  ): Promise<StreamResult>
  
  startTimeout(timeoutMs: number): void
  cancelTimeout(): void
}
```

---

### 7️⃣ A2ACoordinator（Agent间通信）
**行数：** 100-150 行  
**职责：** A2A 协议管理

```typescript
// src/agent/managers/A2ACoordinator.ts
export class A2ACoordinator {
  private a2aProtocol: A2AProtocol;
  
  async sendMessage(targetId: string, message: A2AMessage): Promise<void>
  async receiveMessage(): Promise<A2AMessage | null>
  
  registerAgent(card: AgentCard): void
  getRegisteredAgents(): AgentCard[]
}
```

---

### 8️⃣ AgentCore（核心编排）⭐
**行数：** 200-250 行  
**职责：** 主循环编排、公共 API

```typescript
// src/agent/AgentCore.ts
export class AgentCore {
  // 已拆分的管理器
  private conversationManager: ConversationManager;
  private stateManager: StateManager;
  private harnessCoordinator: HarnessCoordinator;
  private thinkingEngine: ThinkingEngine;
  private closedLoopManager: ClosedLoopManager;
  private streamHandler: StreamHandler;
  private a2aCoordinator: A2ACoordinator;
  
  // 基础依赖
  private client: LLMClient;
  private toolExecutor: AgentToolExecutor;
  private cbs: AgentCallbacks = {};
  
  // 公共 API
  async run(prompt: string): Promise<void>
  async chat(message: string): Promise<Message>
  reset(): void
  
  // 主循环（简化到 50-100 行）
  private async mainLoop(): Promise<Message>
}
```

---

## 📂 重构后的文件结构

```
src/agent/
├── AgentCore.ts                      ← 主类（200-250 行）
├── managers/
│   ├── ConversationManager.ts        ← 对话管理（150-200 行）
│   ├── StateManager.ts               ← 状态管理（100-150 行）
│   ├── HarnessCoordinator.ts         ← Harness 协调（150-200 行）
│   ├── ThinkingEngine.ts             ← 思考引擎（200-250 行）
│   ├── ClosedLoopManager.ts          ← 闭环管理（150-200 行）
│   ├── StreamHandler.ts              ← 流式处理（150-200 行）
│   └── A2ACoordinator.ts             ← A2A 协调（100-150 行）
├── LLMClient.ts                      ← 已存在
├── AgentContextManager.ts            ← 已存在（可合并到 ConversationManager）
├── AgentToolExecutor.ts              ← 已存在
└── AgentUtils.ts                     ← 已存在
```

---

## 🚀 实施步骤（6个阶段）

### Phase 1: 创建目录结构
```bash
mkdir src/agent/managers
```

### Phase 2: 拆分 StateManager（低风险）
1. 创建 `StateManager.ts`
2. 移动 tokenUsage、重复检测相关代码
3. 更新 Agent.ts 引用
4. 运行测试

### Phase 3: 拆分 ConversationManager（中风险）
1. 创建 `ConversationManager.ts`
2. 移动 history、checkpoints 相关代码
3. 合并 AgentContextManager 的功能
4. 运行测试

### Phase 4: 拆分 HarnessCoordinator（中风险）
1. 创建 `HarnessCoordinator.ts`
2. 移动 Gateway、Tracer、CircuitBreaker
3. 运行测试

### Phase 5: 拆分其他管理器（中风险）
1. 创建 ThinkingEngine、ClosedLoopManager 等
2. 逐个移动相关代码
3. 每个管理器独立测试

### Phase 6: 重构 AgentCore（高风险）
1. 重命名 Agent.ts → AgentCore.ts
2. 简化 mainLoop
3. 所有逻辑委托给管理器
4. 全面集成测试

---

## ✅ 重构的好处

### 1. 单一职责原则（SRP）✅
每个类只做一件事，易于理解和维护

### 2. 可测试性大幅提升✅
```typescript
// 之前：测试 Agent 需要 mock 23+ 个依赖
test('Agent.run', () => {
  const agent = new Agent();
  // 太多依赖...
});

// 之后：测试 StateManager 只需 2-3 个依赖
test('StateManager.checkRepetition', () => {
  const manager = new StateManager();
  // 简单清晰
});
```

### 3. 可维护性提升✅
- 修改对话逻辑？只改 ConversationManager
- 修改 Harness？只改 HarnessCoordinator
- 互不干扰

### 4. 可复用性提升✅
```typescript
// 其他地方需要状态管理？直接复用
import { StateManager } from './agent/managers/StateManager.js';
```

---

## 📊 预期效果

| 指标 | 重构前 | 重构后 | 改进 |
|------|--------|--------|------|
| **最大文件行数** | 866 | 250 | ✅ -71% |
| **类的职责数** | 8+ | 1 | ✅ 单一职责 |
| **测试复杂度** | 高 | 低 | ✅ 大幅降低 |
| **可维护性评分** | 7/10 | 9/10 | ✅ +2分 |
| **项目总评分** | 93/100 | 95-96/100 | ✅ +2-3分 |

---

## ⚠️ 注意事项

### 1. 向后兼容
保留旧的 Agent 类作为 facade 模式：
```typescript
// src/agent/Agent.ts
export class Agent extends AgentCore {
  // 100% 兼容旧接口
}
```

### 2. 逐步重构
- ❌ 不要一次性重构全部
- ✅ 每个阶段独立完成和测试
- ✅ 可以随时回滚

### 3. 测试先行
- 重构前：确保现有测试全部通过
- 重构中：为每个新类添加单元测试
- 重构后：确保集成测试全部通过

---

## 🎯 总结

这次重构将：
1. ✅ 将 866 行的上帝类拆分成 8 个职责单一的类
2. ✅ AgentCore 只保留 200-250 行的编排逻辑
3. ✅ 大幅提升代码可测试性、可维护性、可扩展性
4. ✅ 使项目更符合 SOLID 原则

**最终效果：从"良好的代码"提升到"优秀的架构"** 🚀
