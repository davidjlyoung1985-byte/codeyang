# CodeYang v0.6.0 - 完整修复报告

## 📋 问题列表

用户报告了两个问题：
1. ❌ **输入 "hello" 没有反应** - 界面显示 "thinking" 但模型不响应
2. ❌ **模型回答重复两遍** - 响应内容显示了两次

## 🔍 问题诊断与修复

---

### 问题 1: 模型没有反应 ✅ 已修复

#### 根本原因 1.1: `config.maxTurns` 未定义

**现象**: Agent 主循环不执行，导致完全无响应

**代码路径**: [src/agent/Agent.ts:169](src/agent/Agent.ts#L169)
```typescript
const maxTurns = config.maxTurns;  // undefined
for (let turn = 0; turn < maxTurns; turn++) {  // 0 < undefined = false
  // 循环体永远不执行
}
```

**原因**: `config` 对象中缺少 `maxTurns` 属性定义

**修复**: [src/agent/config.ts:81](src/agent/config.ts#L81)
```typescript
export const config = {
  // ...其他配置
  maxTokens: Number(process.env['CODEYANG_MAX_TOKENS'] || '8192'),
  maxTurns: Number(process.env['CODEYANG_MAX_TURNS'] || '20'),  // ✅ 添加
};
```

---

#### 根本原因 1.2: API Key 未从配置文件加载

**现象**: 即使 `~/.codeyang/config.json` 中已保存 API key，每次启动仍提示输入

**代码路径**: [src/index.ts:34-58](src/index.ts#L34-L58)
```typescript
// 之前的代码
async function resolveApiKey(): Promise<string> {
  // ...
  const fromEnv = config.apiKey;  // 这会返回 ''
  if (fromEnv) return fromEnv;    // 跳过
  
  const key = await promptForApiKey();  // 直接提示输入
  // ...
}
```

**原因**: 优先级检查跳过了 `localConfig.apiKey`，直接到用户输入

**修复**: 
1. 添加导出函数 [src/agent/config.ts:29-31](src/agent/config.ts#L29-L31)
```typescript
export function getLocalConfigApiKey(): string {
  return localConfig.apiKey || '';
}
```

2. 修复优先级检查 [src/index.ts:34-66](src/index.ts#L34-L66)
```typescript
async function resolveApiKey(): Promise<string> {
  // 1. CLI 参数
  const argIdx = args.indexOf('--api-key');
  if (argIdx !== -1 && args[argIdx + 1]) return args[argIdx + 1];

  // 2. 环境变量
  const fromEnv = process.env['CODEYANG_API_KEY'] || process.env['DEEPSEEK_API_KEY'];
  if (fromEnv) return fromEnv;

  // 3. 配置文件 ✅ 新增
  const { getLocalConfigApiKey } = await import('./agent/config.js');
  const fromConfig = getLocalConfigApiKey();
  if (fromConfig) return fromConfig;

  // 4. 提示用户输入
  const key = await promptForApiKey();
  // ...
}
```

---

### 问题 2: 响应重复显示两遍 ✅ 已修复

#### 根本原因: 重复调用显示回调

**现象**: 模型响应内容在界面中显示了两次

**代码路径**: [src/agent/Agent.ts:224, 299](src/agent/Agent.ts#L224)
```typescript
// Line 224 - 流式传输时逐字显示
this.cbs.onAgentDelta?.(event.text);  // 第一次显示

// Line 299 - 流结束后再次显示完整文本
this.cbs.onAgentText?.(assistantText);  // 第二次显示（重复！）
```

**原因**: 
- `onAgentDelta` 在流式传输过程中逐字显示文本
- `onAgentText` 在流结束后又显示了完整的已拼接文本
- 两者显示的是同一内容，导致重复

**修复**: [src/agent/Agent.ts:283-300](src/agent/Agent.ts#L283-L300)
```typescript
if (assistantText) {
  // Anti-repetition check
  if (assistantText === this.lastAssistantText) {
    this.repeatCount++;
    if (this.repeatCount >= 2) {
      this.cbs.onError?.('Agent loop detected — stopping to avoid repetition');
      this.history = this.jsonClone(messages);
      break;
    }
  } else {
    this.repeatCount = 0;
  }
  this.lastAssistantText = assistantText;

  // ✅ 移除 onAgentText 调用
  // 文本已通过 onAgentDelta 流式显示，无需再次显示
}
```

---

## ✅ 验证测试

### 测试 1: API 连接 ✅
```bash
$ node test-api-direct.mjs
✓ API key 已加载
✓ 客户端已创建
✓ Stream 已创建
你好！😊 有什么我可以帮你的吗？
✓ 测试成功！接收到 12 个 chunks
```

### 测试 2: 带工具请求 ✅
```bash
$ node test-api-tools.mjs
工具数量: 1
✓ Stream 已创建
Hello! How can I help you today?
✓ 成功！收到 27 个 chunks
```

### 测试 3: 完整流程（无重复）✅
```bash
$ echo "hello" | node dist/index.js

  CodeYang v0.6.0 — AI Coding Agent

  ❯ hello

  User:
  hello

  CodeYang:
  Hey! I'm CodeYang. What can I help you with?
  
✅ 响应正常，无重复！
```

---

## 📊 修改文件汇总

| 文件 | 修改 | 说明 |
|------|------|------|
| [src/agent/config.ts](src/agent/config.ts#L81) | ✅ 添加 | `maxTurns` 配置项 |
| [src/agent/config.ts](src/agent/config.ts#L29-L31) | ✅ 添加 | `getLocalConfigApiKey()` 导出函数 |
| [src/index.ts](src/index.ts#L34-L66) | ✅ 修复 | API key 加载优先级 |
| [src/agent/Agent.ts](src/agent/Agent.ts#L283-L300) | ✅ 修复 | 移除重复的 `onAgentText` 调用 |
| [src/agent/LLMClient.ts](src/agent/LLMClient.ts#L248-L312) | ✨ 改进 | API 错误处理和空响应检测 |

---

## 🎉 最终结果

### 问题 1: 模型没有反应
**状态**: ✅ **已修复**
- ✅ `maxTurns` 正确配置为 20
- ✅ API key 从配置文件正常加载
- ✅ 模型响应正常

### 问题 2: 响应重复两遍
**状态**: ✅ **已修复**
- ✅ 移除重复的显示逻辑
- ✅ 响应只显示一次
- ✅ 流式输出流畅自然

---

## 📖 使用指南

### 正常启动
```bash
npm start
# API key 会自动从 ~/.codeyang/config.json 加载
```

### 手动指定 API key
```bash
npm start -- --api-key "your-api-key"
```

### 环境变量配置
```bash
export CODEYANG_API_KEY="your-api-key"
export CODEYANG_MODEL="deepseek-chat"
export CODEYANG_MAX_TURNS=20
npm start
```

---

## 🔧 技术细节

### API Key 加载优先级
1. 命令行参数 `--api-key`
2. 环境变量 `CODEYANG_API_KEY` 或 `DEEPSEEK_API_KEY`
3. 配置文件 `~/.codeyang/config.json`
4. 交互式提示输入

### 配置文件位置
- **配置目录**: `~/.codeyang/`
- **配置文件**: `~/.codeyang/config.json`
- **格式示例**:
```json
{
  "apiKey": "sk-your-api-key-here",
  "apiBaseURL": "https://api.deepseek.com/v1",
  "apiProvider": "deepseek"
}
```

---

**修复完成时间**: 2026/06/09  
**修复版本**: CodeYang v0.6.0  
**测试状态**: ✅ 全部通过
