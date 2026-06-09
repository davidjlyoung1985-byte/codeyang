# CodeYang v0.6.0 - "模型没有反应" 问题修复报告

## 🎯 问题描述

**症状**: 用户输入 "hello" 后，界面显示 "thinking..." 但模型没有任何响应

## 🔍 根本原因

经过详细调试，发现了 **两个关键问题**：

### 1. 缺少 `config.maxTurns` 配置 ❌
**位置**: [src/agent/config.ts](src/agent/config.ts)

**问题**: `Agent.ts` 中使用了 `config.maxTurns`，但 `config` 对象中没有定义这个属性，导致值为 `undefined`

**代码**:
```typescript
// Agent.ts line ~167
const maxTurns = config.maxTurns;  // undefined!
for (let turn = 0; turn < maxTurns; turn++) {  // 0 < undefined = false
  // 永远不会执行
}
```

### 2. API Key 没有从配置文件加载 ❌
**位置**: [src/index.ts](src/index.ts)

**问题**: `resolveApiKey()` 函数优先级检查中，跳过了从 `localConfig` 读取已保存的 API key

**代码**:
```typescript
// 之前的代码
const fromEnv = config.apiKey;  // 这会返回空字符串
if (fromEnv) return fromEnv;   // 跳过，然后提示用户输入
```

## ✅ 修复方案

### 修复 1: 添加 maxTurns 配置
**文件**: [src/agent/config.ts:81](src/agent/config.ts#L81)

```typescript
export const config = {
  // ... 其他配置
  maxTokens: Number(process.env['CODEYANG_MAX_TOKENS'] || '8192'),
  maxTurns: Number(process.env['CODEYANG_MAX_TURNS'] || '20'),  // ✅ 新增
  getSystemPrompt(qtContext?: QtContext): string {
    // ...
  },
};
```

### 修复 2: 正确加载配置文件中的 API Key
**文件**: [src/index.ts:34-66](src/index.ts#L34-L66)

添加 `getLocalConfigApiKey()` 导出函数：
```typescript
// config.ts
export function getLocalConfigApiKey(): string {
  return localConfig.apiKey || '';
}
```

修改 `resolveApiKey()` 优先级检查：
```typescript
async function resolveApiKey(): Promise<string> {
  // 1. CLI 参数
  const argIdx = args.indexOf('--api-key');
  if (argIdx !== -1 && args[argIdx + 1]) {
    return args[argIdx + 1];
  }

  // 2. 环境变量
  const fromEnv = process.env['CODEYANG_API_KEY'] || process.env['DEEPSEEK_API_KEY'];
  if (fromEnv) return fromEnv;

  // 3. 配置文件 ✅ 修复
  const { getLocalConfigApiKey } = await import('./agent/config.js');
  const fromConfig = getLocalConfigApiKey();
  if (fromConfig) return fromConfig;

  // 4. 提示用户输入
  const key = await promptForApiKey();
  // ...
}
```

### 修复 3: 改进错误处理
保留之前添加的错误处理改进：
- API 调用失败时的明确错误提示
- Stream 空响应检测
- 连接失败 vs 数据处理失败的区分

## 🧪 验证测试

### 测试 1: API 直接连接 ✅
```bash
$ node test-api-direct.mjs
✓ API key 已加载
✓ 客户端已创建
✓ Stream 已创建，开始接收数据
你好！😊 有什么我可以帮你的吗？
✓ 测试成功！接收到 12 个 chunks
```

### 测试 2: 带工具的 API 请求 ✅
```bash
$ node test-api-tools.mjs
工具数量: 1
✓ Stream 已创建
Hello! How can I help you today?
✓ 成功！收到 27 个 chunks
```

### 测试 3: CodeYang 完整流程 ✅
```bash
$ echo "hello" | node dist/index.js
[DEBUG] Using API key from ~/.codeyang/config.json

  CodeYang v0.6.0 — AI Coding Agent

  ❯ hello
  
  User:
  hello

  CodeYang:
  Hey! I'm CodeYang. What can I help you with?
  
✅ 成功响应！
```

## 📊 修改文件清单

| 文件 | 修改类型 | 说明 |
|------|---------|------|
| [src/agent/config.ts](src/agent/config.ts) | ✅ 修复 | 添加 `maxTurns` 配置 + `getLocalConfigApiKey()` 导出 |
| [src/index.ts](src/index.ts) | ✅ 修复 | 修复 API key 加载优先级 |
| [src/agent/Agent.ts](src/agent/Agent.ts) | ✨ 改进 | 添加更详细的错误处理和验证 |
| [src/agent/LLMClient.ts](src/agent/LLMClient.ts) | ✨ 改进 | API 调用错误捕获 + 空响应检测 |

## 🎉 最终结果

**问题**: 输入 "hello" 没有反应  
**状态**: ✅ **已修复**

**现在的行为**:
1. ✅ 正确从 `~/.codeyang/config.json` 加载 API key
2. ✅ `maxTurns` 循环正常执行
3. ✅ API 请求成功发送
4. ✅ Stream 响应正常接收
5. ✅ 模型回复正确显示

## 🚀 后续建议

1. **添加单元测试** - 为 `resolveApiKey()` 和 `config.maxTurns` 添加测试
2. **配置验证** - 启动时验证必需的配置项是否存在
3. **更好的错误提示** - 当 API key 无效时，提供更明确的错误信息
4. **性能优化** - 考虑减少工具数量（目前 62 个）或按需加载

---

**修复完成时间**: 2026/06/09  
**测试状态**: 全部通过 ✅  
**版本**: CodeYang v0.6.0
