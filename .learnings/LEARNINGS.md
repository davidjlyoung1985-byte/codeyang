# Learnings

Corrections, insights, and knowledge gaps captured during development.

**Categories**: correction | insight | knowledge_gap | best_practice

---

## 2026-06-14: 代码质量深度审计（修正版）

- **type**: correction
- **priority**: critical
- **context**: 深度代码质量审计（总分 7.1/10，较初审 6.75 提升）
- **critical_findings**:
  - 🔴 **P0 代码注入漏洞**：QtMathTool.ts:194 使用 `new Function()` 执行用户输入 → 远程代码执行风险
  - 🟡 **P1 会话导入无校验**：sessionStore.ts 反序列化 JSON 无验证 → 恶意工具调用可执行
  - 🟡 **P1 权限绕过无审计日志**：BashTool.ts:36 `ALLOW:` 前缀绕过权限检查但不记录
  
- **corrected_assessments**:
  - **架构**（8.5/10，非 7/10）：Agent 类 763 行是内聚的，单一职责是"编排 LLM 对话与工具执行"，但 run() 方法 390 行需拆分为 ContextManager、ToolExecutor、RepetitionGuard
  - **测试**（6/10，非 4/10）：有 600 个通过测试、34% 文件覆盖率；但 MCP 集成、会话安全、权限系统未测试
  - **安全**（6.5/10，非 5/10）：NetworkTool SSRF 防护达生产级（DNS 解析+内网 IP 拦截）
  - **性能**（7.5/10）：memoryStore.ts:87 Set 交集是 O(n*m)，500+ 记忆时变慢；Agent.ts:280 每次全量克隆 history
  
- **type_safety**: 67 处 `any`（可接受用于工具 schema 定义），但 QtMigrationTool.ts 有 26 处 `as` 类型断言需审查
- **no_memory_leaks**: 事件监听器、定时器、Map 缓存均正确清理 ✓
- **action**: 
  1. 立即修复 QtMathTool 代码注入（用 mathjs 替换 Function()）
  2. 会话导入添加 JSON schema 校验
  3. 权限绕过操作写入审计日志

## 2026-06-14: 错误处理模式实际是合理的

- **type**: correction
- **context**: 工具层错误返回策略
- **detail**: 初审认为"工具层混用抛异常/返回错误字符串不一致"，但深度审计发现这是**有意设计**：
  - **抛异常**：用于不可恢复的系统级故障（BashTool 权限拒绝、LLMClient API 错误）
  - **返回错误字符串**：用于工具执行失败，让 LLM 读取错误并重试（文件不存在、Git 冲突等）
  - 这种分层策略是正确的，但缺少**结构化错误类型**来区分故障模式（网络、文件系统、权限、验证）

## 2026-06-14: 空 catch 块吞异常

- **type**: best_practice
- **pattern**: sessionStore.ts:174 `catch {}` 空块
- **issue**: session 列表读取失败时静默降级，但用户不知道发生了什么
- **recommendation**: 至少记录到 debug 日志或返回 fallback 提示

## 2026-06-07: Skills 全局路径配置

- **type**: best_practice
- **context**: opencode 技能安装
- **detail**: 以后所有 `npx skills add` 安装的技能都会自动对 opencode 可用。opencode.json 中配置了 `"paths": [".opencode/skills", "../.agents/skills"]`，`.agents/skills` 为全局 skills 路径。不需要为 opencode 单独安装技能。
