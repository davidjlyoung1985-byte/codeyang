# CodeYang 故障排查指南

## 🚨 常见问题

### 问题 1: 运行中途突然停止

#### **症状**

```
程序运行一段时间后突然停止，没有明显错误信息
或显示: [RATE LIMIT] Too many operations
```

#### **原因**

CodeYang 内置了限流保护机制，防止 DoS 攻击。默认限制：

- Bash 命令: 200 次/分钟
- 网络请求: 50 次/分钟
- 文件操作: 100 次/分钟
- Git 操作: 50 次/分钟

当执行复杂任务时，可能在短时间内超过这些限制。

#### **解决方案**

##### 方案 A: 使用环境变量调整限制 ✅ 推荐

**临时调整（单次运行）**:

```bash
# Linux/Mac
CODEYANG_BASH_LIMIT=500 npm start

# Windows PowerShell
$env:CODEYANG_BASH_LIMIT=500; npm start

# Windows CMD
set CODEYANG_BASH_LIMIT=500 && npm start
```

**永久调整（添加到 .env 或系统环境变量）**:

```bash
# 创建 .env 文件
echo "CODEYANG_BASH_LIMIT=500" >> .env
echo "CODEYANG_NETWORK_LIMIT=100" >> .env
```

##### 方案 B: 修改源码

编辑 `src/utils/rateLimiter.ts`，找到:

```typescript
bash: { maxCalls: getLimit('bash', 200), windowMs: 60_000 },
```

改为更大的值:

```typescript
bash: { maxCalls: getLimit('bash', 1000), windowMs: 60_000 },
```

然后重新构建:

```bash
npm run build
```

---

### 问题 2: API 调用失败

#### **症状**

```
Error: API key not found
Error: 401 Unauthorized
Error: Network timeout
```

#### **解决方案**

1. **检查 API Key 是否配置**:

```bash
cat ~/.codeyang/config.json
```

2. **重新设置 API Key**:

```bash
npm start -- --api-key YOUR_API_KEY
```

3. **检查网络连接**:

```bash
curl https://api.anthropic.com
```

4. **使用代理（如果需要）**:

```bash
export ANTHROPIC_BASE_URL=https://your-proxy.com
npm start
```

---

### 问题 3: 权限被拒绝

#### **症状**

```
[PERMISSION DENIED] This operation requires confirmation
Command blocked by security policy
```

#### **原因**

CodeYang 检测到危险命令（如 `rm -rf`）并要求确认。

#### **解决方案**

1. **允许一次**:
   - 在提示时输入 `allow`

2. **永久允许（谨慎使用）**:
   编辑 `~/.codeyang/permissions.json`:
   ```json
   {
     "bash": {
       "level": "allow"
     }
   }
   ```

---

### 问题 4: 内存溢出

#### **症状**

```
JavaScript heap out of memory
Process killed
```

#### **解决方案**

增加 Node.js 内存限制:

```bash
NODE_OPTIONS="--max-old-space-size=4096" npm start
```

---

### 问题 5: 测试失败

#### **症状**

```
npm test
❌ 49 tests failed
[RATE LIMIT] error in tests
```

#### **解决方案**

运行测试时禁用限流:

```bash
CODEYANG_BASH_LIMIT=10000 npm test
```

---

## 🔍 调试模式

### 启用详细日志

```bash
# 启用调试日志
CODEYANG_DEBUG=true npm start

# 或修改日志级别
export LOG_LEVEL=debug
npm start
```

### 查看内部状态

```bash
# 查看会话历史
npm start -- --list-sessions

# 查看配置
cat ~/.codeyang/config.json

# 查看权限设置
cat ~/.codeyang/permissions.json
```

---

## 📞 获取帮助

1. **查看文档**: `npm start -- --help`
2. **报告问题**: https://github.com/davidjlyoung1985-byte/codeyang/issues
3. **社区讨论**: （待添加 Discord/论坛链接）

---

## 🛠️ 环境变量参考

| 变量名                   | 说明              | 默认值                    |
| ------------------------ | ----------------- | ------------------------- |
| `CODEYANG_API_KEY`       | Anthropic API Key | 必需                      |
| `CODEYANG_BASH_LIMIT`    | Bash 命令限流     | 200                       |
| `CODEYANG_NETWORK_LIMIT` | 网络请求限流      | 50                        |
| `CODEYANG_FILE_LIMIT`    | 文件操作限流      | 100                       |
| `CODEYANG_GIT_LIMIT`     | Git 操作限流      | 50                        |
| `CODEYANG_DEBUG`         | 启用调试日志      | false                     |
| `ANTHROPIC_BASE_URL`     | API 基础 URL      | https://api.anthropic.com |
| `NODE_OPTIONS`           | Node.js 选项      | -                         |

---

**最后更新**: 2026-09-06  
**版本**: v0.7.1
