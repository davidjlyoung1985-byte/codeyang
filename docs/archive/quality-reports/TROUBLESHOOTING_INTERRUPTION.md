# 对话中断问题诊断与解决方案

## 问题描述
对话总是没有返回、中断

## 可能的原因与解决方案

### 1. 流超时 (最常见)

**当前配置:**
```typescript
const STREAM_TIMEOUT_MS = 120_000; // 2分钟
```

**问题:** 如果 LLM 响应时间超过 2 分钟，连接会被强制断开。

**解决方案:**
```bash
# 方法 1: 增加超时时间
# 编辑 src/agent/Agent.ts
# 将 STREAM_TIMEOUT_MS 从 120000 改为 300000 (5分钟)

# 方法 2: 通过环境变量控制
export CODEYANG_STREAM_TIMEOUT=300000
```

### 2. API 密钥或配额问题

**检查:**
```bash
# 检查 API 密钥是否有效
cat ~/.codeyang/config.json

# 或检查环境变量
echo $CODEYANG_API_KEY
echo $DEEPSEEK_API_KEY
```

**解决方案:**
- 确认 API 密钥有效
- 检查 API 配额是否用完
- 尝试重新生成 API 密钥

### 3. 网络连接问题

**诊断:**
```bash
# 测试 DeepSeek API 连接
curl -H "Authorization: Bearer YOUR_KEY" https://api.deepseek.com/v1/models

# 测试 Anthropic API 连接
curl -H "x-api-key: YOUR_KEY" https://api.anthropic.com/v1/messages
```

**解决方案:**
- 检查防火墙设置
- 尝试使用代理
- 切换网络环境

### 4. 模型响应太长导致超时

**问题:** 如果请求生成大量代码或文本，模型可能需要很长时间。

**解决方案:**
```bash
# 编辑配置，减少 maxTokens
# ~/.codeyang/config.json
{
  "maxTokens": 8192  // 从 32000 降低到 8192
}
```

### 5. 工具执行超时

**检查日志:**
```bash
# 启用调试模式
export CODEYANG_DEBUG=true
npm start

# 查看哪个工具卡住了
```

**常见卡住的工具:**
- Bash 工具执行长时间命令
- Git 工具克隆大型仓库
- Network 工具请求慢速服务器

**解决方案:**
```bash
# 在 src/tools/BashTool.ts 中设置超时
export async function executeBash(command: string, cwd?: string, timeoutSecs = 30)
# 可以调整 timeoutSecs 参数
```

### 6. 内存溢出

**诊断:**
```bash
# 运行时监控内存
node --max-old-space-size=4096 dist/cli.js
```

**解决方案:**
- 清理旧 session: `rm -rf ~/.codeyang/sessions/*`
- 增加 Node.js 内存限制

### 7. 循环重试导致挂起

**问题:** Agent 在工具执行失败后不断重试。

**解决方案:**
```bash
# 编辑 ~/.codeyang/config.json
{
  "maxRetries": 1  // 从 3 降低到 1
}
```

## 快速诊断步骤

### 第 1 步: 启用调试日志
```bash
export CODEYANG_DEBUG=true
npm start
```

### 第 2 步: 测试简单对话
输入: "hello"
- 如果这个都中断 → API 密钥或网络问题
- 如果这个正常 → 复杂任务导致超时

### 第 3 步: 检查日志文件
```bash
# 查看最近的错误
ls -lt ~/.codeyang/sessions/
cat ~/.codeyang/sessions/latest-session-id/chat.log
```

### 第 4 步: 测试 API 直连
```bash
# 测试 DeepSeek
curl -X POST https://api.deepseek.com/v1/chat/completions \
  -H "Authorization: Bearer $DEEPSEEK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"deepseek-chat","messages":[{"role":"user","content":"hello"}]}'
```

## 推荐配置修改

创建 `TROUBLESHOOTING.patch`:

```typescript
// src/agent/Agent.ts
- const STREAM_TIMEOUT_MS = 120_000; // 2 min
+ const STREAM_TIMEOUT_MS = 300_000; // 5 min - 增加超时时间

// src/tools/BashTool.ts
- export async function executeBash(command: string, cwd?: string, timeoutSecs = 30)
+ export async function executeBash(command: string, cwd?: string, timeoutSecs = 60)
  // 工具超时从 30秒 增加到 60秒

// src/agent/config.ts
export const config = {
  // ...
+ streamTimeout: parseInt(process.env.CODEYANG_STREAM_TIMEOUT || '300000'),
+ toolTimeout: parseInt(process.env.CODEYANG_TOOL_TIMEOUT || '60000'),
}
```

## 应用修复

```bash
# 1. 增加流超时
sed -i 's/120_000/300_000/g' src/agent/Agent.ts

# 2. 重新编译
npm run build

# 3. 测试
npm start
```

## 如果问题依然存在

提供以下信息以便进一步诊断:

1. **错误信息:**
```bash
export CODEYANG_DEBUG=true
npm start 2>&1 | tee debug.log
```

2. **系统信息:**
```bash
node --version
npm --version
echo $SHELL
uname -a  # Linux/Mac
systeminfo  # Windows
```

3. **网络测试:**
```bash
curl -v https://api.deepseek.com/v1/models
ping api.deepseek.com
```

4. **配置信息 (隐藏密钥):**
```bash
cat ~/.codeyang/config.json | sed 's/"apiKey":.*/apiKey": "***HIDDEN***"/'
```

## 临时解决方案

如果修改代码太复杂，可以使用这个快速脚本:

```bash
#!/bin/bash
# quick-fix-timeout.sh

echo "Applying timeout fixes..."

# 备份
cp src/agent/Agent.ts src/agent/Agent.ts.bak

# 修改超时
sed -i 's/STREAM_TIMEOUT_MS = 120_000/STREAM_TIMEOUT_MS = 300_000/' src/agent/Agent.ts

# 重新编译
npm run build

echo "Done! Timeout increased to 5 minutes."
echo "Original file backed up to src/agent/Agent.ts.bak"
```

使用:
```bash
chmod +x quick-fix-timeout.sh
./quick-fix-timeout.sh
```

## 常见问题 FAQ

**Q: 对话在生成一半时中断?**
A: 可能是流超时，增加 STREAM_TIMEOUT_MS

**Q: 第一条消息就中断?**
A: 可能是 API 密钥问题或网络问题

**Q: 执行 Bash 命令后中断?**
A: 可能是工具超时，增加 BashTool 的 timeoutSecs

**Q: 随机中断，不稳定?**
A: 可能是网络不稳定，尝试增加重试次数或使用代理

**Q: 在 Windows 上特别容易中断?**
A: 可能是 PowerShell 权限问题，以管理员身份运行
