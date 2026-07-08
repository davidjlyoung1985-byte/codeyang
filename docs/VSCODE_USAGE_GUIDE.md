# 🚀 CodeYang VS Code 扩展使用指南

## ✅ 安装完成

CodeYang VS Code 扩展已成功安装到：
```
C:\Users\Administrator\.vscode\extensions\codeyang-vscode-0.3.1
```

## 📋 下一步操作

### 1️⃣ 重新加载 VS Code

在 VS Code 中：
1. 按 `Ctrl+Shift+P` 打开命令面板
2. 输入 "Developer: Reload Window"
3. 按回车重新加载

### 2️⃣ 打开 CodeYang 聊天

使用以下任一方式：
- **快捷键**：`Ctrl+Shift+Y`
- **命令面板**：`Ctrl+Shift+P` → 输入 "CodeYang: Start Chat"

### 3️⃣ 配置 API

在弹出的聊天窗口中，你会看到配置面板：

```
API Base URL: https://api.deepseek.com/anthropic
Model:        deepseek-v4-pro
API Key:      sk-xxxxxxxxxxxxxxxx
```

#### 获取 API Key：
访问 https://platform.deepseek.com/api_keys 获取你的 API Key

#### 推荐配置：
- **API Base URL**: `https://api.deepseek.com/anthropic` （默认）
- **Model**: `deepseek-v4-pro` （高质量）或 `deepseek-v4-flash` （快速）
- **API Key**: 你的 DeepSeek API Key

### 4️⃣ 开始使用

配置完成后，你可以开始与 CodeYang 对话：

#### 示例对话：

```
👤 You: 读取 package.json 文件并告诉我这个项目是做什么的

🤖 CodeYang: [调用 Read 工具]
这是 CodeYang 项目，一个基于 AI 的编码代理工具...
```

## 🎯 功能特性

### 可用工具

| 工具 | 功能 |
|------|------|
| **Read** | 读取文件内容或列出目录 |
| **Write** | 创建或覆盖文件 |
| **Edit** | 精确文本替换 |
| **Glob** | 按模式查找文件 |
| **Grep** | 搜索文件内容（正则表达式）|
| **Search** | 按名称和内容搜索 |
| **Bash** | 运行 shell 命令（Windows 用 PowerShell）|
| **WebFetch** | 获取网页内容 |
| **TodoWrite** | 任务管理 |
| **Question** | 向你询问澄清问题 |
| **ImageInfo** | 读取图片元数据 |
| **ImageToBase64** | 将图片编码为 base64 |
| **ListImages** | 列出目录中的图片 |

### 使用场景

#### 1. 代码解释
```
请解释 src/index.ts 中的 main 函数
```

#### 2. 代码搜索
```
找出所有包含 TODO 注释的文件
```

#### 3. 代码重构
```
读取 utils/helper.ts，将重复的代码提取到共享函数中
```

#### 4. 调试问题
```
运行 npm test 并分析失败的原因
```

#### 5. 批量操作
```
在所有 .ts 文件中查找并删除 console.log 语句
```

#### 6. 项目探索
```
分析这个项目的结构，告诉我主要的模块有哪些
```

## ⚙️ 高级配置

### 使用不同的模型

#### 选项 1: deepseek-v4-pro（推荐）
- 最高质量
- 支持思考模式
- 适合复杂任务

```json
{
  "codeyang.model": "deepseek-v4-pro"
}
```

#### 选项 2: deepseek-v4-flash
- 快速响应
- 成本更低
- 适合简单任务

```json
{
  "codeyang.model": "deepseek-v4-flash"
}
```

#### 选项 3: Claude 模型名（自动映射）
- `claude-opus-4-*` → deepseek-v4-pro
- `claude-sonnet-4-*` → deepseek-v4-flash
- `claude-haiku-*` → deepseek-v4-flash

```json
{
  "codeyang.model": "claude-opus-4-20250514"
}
```

### 切换到 OpenAI 格式 API

如果你想使用 OpenAI 兼容格式：

```json
{
  "codeyang.apiBaseUrl": "https://api.deepseek.com/v1",
  "codeyang.model": "deepseek-chat"
}
```

### 使用官方 Anthropic API

如果你有 Claude API Key：

```json
{
  "codeyang.apiBaseUrl": "https://api.anthropic.com",
  "codeyang.model": "claude-sonnet-4-20250514",
  "codeyang.apiKey": "sk-ant-your-key-here"
}
```

## 🐛 故障排除

### 问题 1: "Invalid API key" 错误

**原因**: API Key 无效或格式错误

**解决方案**:
1. 访问 https://platform.deepseek.com/api_keys
2. 确认 API Key 正确（格式：`sk-xxxxxx...`）
3. 检查账户余额是否充足
4. 重新输入 API Key（不要有多余空格）

### 问题 2: "Network error" 错误

**原因**: 无法连接到 API 服务器

**解决方案**:
1. 检查网络连接
2. 确认 `https://api.deepseek.com` 可访问
3. 测试连接：
   ```powershell
   curl https://api.deepseek.com/anthropic
   ```

### 问题 3: 扩展未加载

**原因**: VS Code 未识别扩展

**解决方案**:
1. 确认 VS Code 版本 ≥ 1.85.0
2. 重新加载窗口：`Ctrl+Shift+P` → "Developer: Reload Window"
3. 查看输出面板：View → Output → 选择 "CodeYang"
4. 重新安装扩展：
   ```powershell
   cd e:\Qt\ai-code-agent
   .\deploy-vscode-extension.bat
   ```

### 问题 4: "Model not found" 错误

**原因**: 模型名称不正确

**解决方案**:
使用正确的模型名：
- `deepseek-v4-pro` ✅
- `deepseek-v4-flash` ✅
- `claude-opus-4-20250514` ✅ (自动映射)
- `deepseek-chat` ❌ (需要切换到 OpenAI API)

### 问题 5: 工具调用失败

**原因**: 文件路径错误或权限问题

**解决方案**:
1. 确保文件路径相对于工作区根目录
2. 检查文件是否存在
3. 确认有读写权限

## 📊 性能优化

### 提示词技巧

#### ✅ 好的提示词
```
读取 src/config.ts，找出所有导出的常量，并解释它们的用途
```
- 明确具体
- 一次一个任务
- 提供上下文

#### ❌ 不好的提示词
```
帮我看看代码
```
- 太模糊
- 没有具体文件
- 缺少上下文

### 工作流建议

1. **探索阶段**：先用 Glob/Search 找文件
2. **分析阶段**：用 Read 读取关键文件
3. **修改阶段**：用 Edit/Write 修改代码
4. **验证阶段**：用 Bash 运行测试

## 🔗 相关资源

- **DeepSeek 平台**: https://platform.deepseek.com
- **API 文档**: https://api-docs.deepseek.com/guides/anthropic_api
- **GitHub**: https://github.com/davidjlyoung1985-byte/codeyang
- **Anthropic SDK**: https://github.com/anthropics/anthropic-sdk-typescript

## 💡 提示与技巧

### 1. 使用快捷键
- `Ctrl+Shift+Y` - 打开 CodeYang
- `Enter` - 发送消息
- `Shift+Enter` - 换行

### 2. 多步骤任务
```
1. 搜索所有包含 "TODO" 的文件
2. 对每个文件，读取内容
3. 创建一个 TODO.md 文件总结所有待办事项
```

### 3. 代码审查
```
读取 src/api/users.ts，检查是否有安全问题或代码质量问题
```

### 4. 文档生成
```
读取 src/utils/ 目录中的所有文件，为每个导出的函数生成 JSDoc 注释
```

### 5. 批量重命名
```
在所有 .ts 文件中，将 getUserName 重命名为 getUsername
```

## 📈 反馈与支持

如果遇到问题或有功能建议：

1. 检查本文档的故障排除部分
2. 查看项目 README: `vscode-extension/README.md`
3. 运行测试脚本: `npx tsx test-anthropic-api.ts`
4. 查看详细集成文档: `ANTHROPIC_API_INTEGRATION.md`

## ✨ 享受使用 CodeYang！

CodeYang 现在已经准备好帮助你编码了。祝你编码愉快！🚀

---

**版本**: 0.3.1  
**最后更新**: 2026-06-13  
**集成类型**: DeepSeek Anthropic API
