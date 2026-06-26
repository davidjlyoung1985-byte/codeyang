# 🎯 CodeYang 项目改善计划

> **项目**: CodeYang v0.7.0 | **审查日期**: 2026年  
> **审查范围**: agent/ 引擎 · tools/ 工具系统 · bridge/ 桥接层  
> **目标**: 将项目代码健康度从 **6/10 提升至 8/10**

---

## 一、审查数据总览

| 模块 | 高 | 中 | 低 | **合计** |
|:----|:--:|:--:|:--:|:--------:|
| 🔷 **agent/** — Agent 引擎 | 16 | 19 | 8 | **43** |
| 🔷 **tools/** — 工具系统 | 12 | 13 | 10 | **35** |
| 🔷 **bridge/** — 桥接层 | 5 | 15 | 5 | **25** |
| **总计** | **33** | **47** | **23** | **103** |

### 当前健康度评分

| 维度 | 评分 | 状态 |
|:----|:---:|:----:|
| 类型安全 | 7/10 | ⚠️ 多处 `as` 断言无校验 |
| 错误处理 | 5/10 | ❌ 大量静默吞错 |
| 性能 | 6/10 | ⚠️ 深拷贝、同步阻塞 |
| 安全性 | 7/10 | ⚠️ Token 泄露、路径绕过 |
| 可测试性 | 4/10 | ❌ 覆盖严重不足 |
| 可维护性 | 6/10 | ⚠️ 上帝类、长函数 |
| **综合** | **6/10** | **→ 目标 8/10** |

---

## 二、Phase 1 — 安全加固（Week 1，预计 5 天）

> **目标**: 消除所有高严重度安全风险，占比权重 35%

### Day 1-2：Agent 引擎安全

| # | 问题 | 文件 | 改进方案 | 工时 |
|:-|------|------|----------|:----:|
| 1 | 运行时 `Symbol.asyncIterator` 检测用 `constructor.name` 不可靠 | `Agent.ts` L453-454 | 改用 `typeof stream[Symbol.asyncIterator] === 'function'` | 0.5h |
| 2 | `NaN` maxTokens 传递到 API | `config.ts` L151 | 添加 `Number.isNaN` 检查 + 默认值回退 | 0.5h |
| 3 | `sessionApiKey` 竞态条件 | `config.ts` L71-86 | 使用 `let` 写后立即可见，标注文档 | 0.5h |
| 4 | 错误消息可能泄露 API Key | `Agent.ts` L313 | 添加 `sanitizeErrorMessage()` 过滤敏感模式 | 1h |
| 5 | `process.cwd()` 隐式路径暴露 | `Agent.ts` L672 | 显式设置项目根目录 + 白名单检查 | 1h |
| 6 | `maxRetries = 3` 硬编码不读配置 | `Agent.ts` L97 | 改为 `this.maxRetries = config.maxRetries ?? 3` | 0.5h |
| 7 | `loadMessages` 可重复调用导致消息累积 | `Agent.ts` L664-666 | 开头添加 `this.history = []` 或 `append` 参数 | 0.5h |

### Day 2-3：工具系统安全

| # | 问题 | 文件 | 改进方案 | 工时 |
|:-|------|------|----------|:----:|
| 8 | 复制/移动绕过受保护路径检查 | `FileSystemTool.ts` | 所有文件操作统一调用 `isProtectedPath()` | 2h |
| 9 | WebFetch 无响应大小预检（OOM） | `WebFetchTool.ts` | 检查 `Content-Length` + 流式读取 + 10MB 上限 | 2h |
| 10 | Git 危险操作无审计日志 | `GitTool.ts` | 添加 `auditLog()` 调用 + `--force` 确认步骤 | 2h |
| 11 | EditTool 并发不安全 | `EditTool.ts` | 基于文件路径的异步互斥锁 | 2h |
| 12 | BashTool 权限缓存 60s TTL 过长 | `BashTool.ts` | 缩短为 5s 或完全移除缓存 | 1h |

### Day 4-5：桥接层安全

| # | 问题 | 文件 | 改进方案 | 工时 |
|:-|------|------|----------|:----:|
| 13 | `/api/info` 泄露 Token | `server.ts` L241 | 从 API 响应中删除 `token` 字段 | 0.5h |
| 14 | 请求体无大小限制（DoS） | `server.ts` L146-160 | 限制 10MB + 413 状态码 | 1h |
| 15 | Token 明文文件存储 | `server.ts` L122-124 | 用 `crypto.createCipheriv` 加密存储 | 2h |
| 16 | WebSocket URL 泄露 Token | `claude-agent.ts` L107-108 | 改用握手协议头传递 | 1h |
| 17 | 健康检查失败静默吞错 | `client.ts` L132 | 区分网络错误 vs 认证错误 | 0.5h |

**Phase 1 总计**: 17 项修复，约 **18h**（2.5 人天）

---

## 三、Phase 2 — 稳定性提升（Week 2，预计 5 天）

> **目标**: 消除数据丢失、无限挂起、静默吞错，占比权重 30%

### Day 1-2：Agent 引擎稳定性

| # | 问题 | 文件 | 改进方案 | 工时 |
|:-|------|------|----------|:----:|
| 18 | `jsonClone` 浅拷贝兜底不安全 | `Agent.ts` L392-396 | 移除浅拷贝回落，直接抛错 | 1h |
| 19 | `messages.splice` 负数 deleteCount | `Agent.ts` L737-741 | 加 `if (messages.length > keepCount)` 保护 | 0.5h |
| 20 | `this.history` 引用替换风险 | `Agent.ts` L830 | 统一用 `push/splice` 保持引用 | 0.5h |
| 21 | `AbortController` 生命周期不一致 | `Agent.ts` L667/831 | `run()` 开始处创建，全程有效 | 1h |
| 22 | Run 长函数拆分（270 行） | `Agent.ts` L680-947 | 拆出 `processStream()`, `handlePostTurn()`, `checkRepetition()` | 4h |
| 23 | `TOOL_TIMEOUT_MS` 默认值被 0 覆盖 | `Agent.ts` L37 | 改为显式 `undefined` 检查 | 0.5h |

### Day 2-3：工具系统稳定性

| # | 问题 | 文件 | 改进方案 | 工时 |
|:-|------|------|----------|:----:|
| 24 | WriteTool 覆盖无备份 | `WriteTool.ts` | 先写临时文件 `.tmp`，再原子重命名 | 1.5h |
| 25 | EditTool 撤销历史易失 | `EditTool.ts` | 添加基于磁盘的撤销历史（`.codeyang/undo/`） | 2h |
| 26 | SearchTool 无超时 | `SearchTool.ts` | `AbortController.timeout(30000)` | 1h |
| 27 | GlobTool 递归深度无限 | `GlobTool.ts` | `maxDepth=50` 迭代式遍历 | 1h |
| 28 | GrepTool ReDoS 检测不足 | `GrepTool.ts` | 使用 `regexp-tree` 或 `safe-regex` 分析 | 1.5h |
| 29 | ReadTool 无异步读取 | `ReadTool.ts` | 对大文件使用流式读取 | 1h |

### Day 4-5：桥接层稳定性

| # | 问题 | 文件 | 改进方案 | 工时 |
|:-|------|------|----------|:----:|
| 30 | 持久化失败静默吞错 | `server.ts` 多处 | `.catch()` 改为记录日志 + 返回错误 | 1.5h |
| 31 | 所有 fetch 无超时 | `client.ts` + `claude-agent.ts` | 添加 `AbortSignal.timeout(10000)` | 1h |
| 32 | WebSocket 断线永不重连 | `claude-agent.ts` | 指数退避自动重连 | 2h |
| 33 | 消息队列裁剪丢失中间 | `server.ts` L107-109 | 改为 LRU 或环形缓冲区 | 1h |
| 34 | 客户端配置缓存竞态 | `client.ts` L28 | 加锁确保单次加载 | 0.5h |
| 35 | 服务器无连接超时 | `server.ts` | 设置 `server.timeout = 120000` | 0.5h |
| 36 | WebSocket 格式错误静默吞 | `server.ts` L301 | 记录日志 | 0.5h |

**Phase 2 总计**: 19 项修复，约 **22h**（3 人天）

---

## 四、Phase 3 — 架构重构（Week 3，预计 5 天）

> **目标**: 解决主要技术债务，占比权重 20%

### Day 1-2：Agent 上帝类拆分

| # | 问题 | 改进方案 | 工时 |
|:-|------|----------|:----:|
| 37 | `Agent.ts` 950 行上帝类 | 拆分为： | 8h |
| | → `ConversationManager`（history/checkpoint/summarize） | | |
| | → `ToolExecutor`（工具执行/缓存/pending dedup） | | |
| | → `ContextManager`（system prompt/memory） | | |
| | → `Agent`（协调层，仅保留 run() 编排） | | |

### Day 2-3：LLMClient 重构

| # | 问题 | 改进方案 | 工时 |
|:-|------|----------|:----:|
| 38 | 危险类型断言 `as SDK.Type[]` | 添加运行时转换函数，明确字段映射 | 3h |
| 39 | `consumeStream` 与 Agent 流处理重复 | LLMClient 模块提供公共流处理工具函数 | 2h |
| 40 | OpenAI 消息转换 70 行长函数 | 提取 `convertToOpenAIMessages()` 独立函数 | 1h |

### Day 3-4：全局问题修复

| # | 问题 | 改进方案 | 工时 |
|:-|------|----------|:----:|
| 41 | `validateConfig()` 定义了但未被调用 | 在 `loadLocalConfig` 和 `saveApiSettings` 后调用 | 1h |
| 42 | system-prompt 硬编码 | 提取为独立 Markdown 文件，编译时注入 | 2h |
| 43 | 工具错误无程序化错误码 | 添加 `ERR_XXX` 错误码枚举 | 2h |
| 44 | `shared.ts` 同步 realpath 阻塞 | 改用 `fs.promises.realpath()` | 1h |
| 45 | `summarizeContext` 每次全量遍历 | 增量式维护摘要，只在新消息上更新 | 2h |
| 46 | 反重复守卫 TOCTOU 竞态 | 工具执行前先完成重复检测 | 1h |

### Day 4-5：文档完善

| # | 问题 | 改进方案 | 工时 |
|:-|------|----------|:----:|
| 47 | BRIDGE_GUIDE.md 无故障排除 | 添加 Troubleshooting 章节 | 1h |
| 48 | BRIDGE_GUIDE.md 无数据清理 | 添加清理脚本和说明 | 0.5h |
| 49 | 统一日志（console.log vs logger） | 全部改为结构化日志 | 2h |
| 50 | API 文档无完整契约 | 提供 OpenAPI 3.0 规范 | 2h |

**Phase 3 总计**: 14 项修复，约 **28.5h**（3.5 人天）

---

## 五、Phase 4 — 测试攻坚（Week 4，预计 5 天）

> **目标**: 将测试覆盖率从 ~30% 提升至 ~70%，占比权重 15%

### Day 1-2：Agent 测试

| # | 测试目标 | 文件 | 测试用例数 | 工时 |
|:-|---------|------|:---------:|:----:|
| 51 | `saveCheckpoint`/`restoreCheckpoint` 多检查点 | `Agent.test.ts` | 4 | 1h |
| 52 | `summarizeContext` 边界（空/刚好/超限） | `Agent.test.ts` | 5 | 1h |
| 53 | 缓存命中/失效/去重 | `Agent.test.ts` | 4 | 1h |
| 54 | 反重复守卫（精确/模糊重复） | `Agent.test.ts` | 3 | 1h |
| 55 | `wrapStreamWithTimeout` 超时触发 | `Agent.test.ts` | 3 | 1h |
| 56 | Mock Reflexion/Planner/Watcher | `Agent.test.ts` | 3 | 2h |
| 57 | `makeStream()` 改为真异步生成器 | `Agent.test.ts` L92-98 | 修复类型 | 0.5h |

### Day 2-3：Config 测试

| # | 测试目标 | 文件 | 测试用例数 | 工时 |
|:-|---------|------|:---------:|:----:|
| 58 | `loadLocalConfig` 正常/文件损坏/不存在 | `config.test.ts` | 3 | 1h |
| 59 | `saveApiSettings` 正常/无效输入 | `config.test.ts` | 3 | 1h |
| 60 | `reloadConfig` 并发安全 | `config.test.ts` | 2 | 1h |
| 61 | `setSessionApiKey` 优先级覆盖 | `config.test.ts` | 3 | 1h |
| 62 | 环境变量覆盖与 NaN 处理 | `config.test.ts` | 4 | 1h |

### Day 3-4：工具测试

| # | 测试目标 | 文件 | 测试用例数 | 工时 |
|:-|---------|------|:---------:|:----:|
| 63 | BashTool 黑名单绕过（Unicode/编码） | `BashTool.test.ts` | 4 | 1h |
| 64 | FileSystemTool 路径遍历防御 | `FileSystemTool.test.ts` | 3 | 1h |
| 65 | GitTool 危险操作审计记录 | `GitTool.test.ts` | 3 | 1h |
| 66 | WebFetchTool 响应大小限制 | `WebFetchTool.test.ts` | 2 | 1h |

### Day 4-5：集成测试

| # | 测试目标 | 文件 | 测试用例数 | 工时 |
|:-|---------|------|:---------:|:----:|
| 67 | Reflexion 自动触发 | `Agent-integration.test.ts` | 2 | 2h |
| 68 | Planner 计划生成与注入 | `Agent-integration.test.ts` | 2 | 1h |
| 69 | 异常流（LLM 损坏 JSON/网络断开） | `Agent-integration.test.ts` | 4 | 2h |

**Phase 4 总计**: 19 项，约 **55 个测试用例**，**23h**（3 人天）

---

## 六、资源投入汇总

| Phase | 内容 | 修复项 | 新增测试 | 预估工时 | 人天 |
|:----:|------|:-----:|:--------:|:--------:|:----:|
| 1 | 安全加固 | 17 | 0 | 18h | 2.5 |
| 2 | 稳定性提升 | 19 | 0 | 22h | 3 |
| 3 | 架构重构 | 14 | 0 | 28.5h | 3.5 |
| 4 | 测试攻坚 | 19 | 55 | 23h | 3 |
| **合计** | | **69** | **55** | **91.5h** | **12** |

### 风险说明

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| Phase 3 重构可能与现有 PR 冲突 | 合并困难 | 先合并所有待处理 PR，冻结新功能开发 |
| `Agent` 类拆分后测试需要重写 | 测试中断 | 先为现有 Agent 添加测试，再重构，最后调整测试 |
| API Key 加密存储可能需要第三方库 | 依赖风险 | 使用 Node.js 内置 `crypto` 模块，无需额外依赖 |

---

## 七、预期成果

| 指标 | 当前 | Phase 1-2 | Phase 3 | Phase 4 | **最终** |
|:----|:----:|:---------:|:-------:|:-------:|:--------:|
| 高严重度问题 | 33 | 0 ✅ | 0 | 0 | **0** |
| 测试覆盖率 | ~30% | 30% | 30% | 70% | **~70%** |
| Agent.ts 行数 | 950 | 950 | ~500 | ~500 | **~500** |
| 类型断言风险点 | 6+ | 3 | 0 | 0 | **0** |
| 静默吞错点 | 10+ | 5 | 2 | 0 | **0** |
| 综合健康度 | 6/10 | 7/10 | 7.5/10 | 8/10 | **8/10** |

---

*计划生成日期: 2026年 | 审查工具: CodeYang 子代理集群 | 审查范围: 103 项改善点*
