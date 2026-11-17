# 配置向导使用指南

## 🚀 快速开始

CodeYang 现在提供了交互式配置向导，帮助你快速完成初始设置。

### 首次使用

运行配置向导：

```bash
npm run setup
```

或者（安装后）：

```bash
codeyang-setup
```

### 配置步骤

向导会引导你完成以下步骤：

#### 1️⃣ 选择 LLM 提供商

```
1) DeepSeek  (推荐 - 性价比高)
2) OpenAI    (强大但昂贵)
3) Anthropic (Claude 系列)
```

#### 2️⃣ 获取 API Key

向导会显示详细的获取步骤：

**DeepSeek:**
1. 访问 https://platform.deepseek.com/api_keys
2. 创建新的 API Key
3. 复制 API Key (以 `deepseek-r-` 开头)

**OpenAI:**
1. 访问 https://platform.openai.com/api-keys
2. 创建新的 API Key
3. 复制 API Key (以 `sk-` 开头)

**Anthropic:**
1. 访问 https://console.anthropic.com/settings/keys
2. 创建新的 API Key
3. 复制 API Key (以 `anthropic-` 开头)

#### 3️⃣ 测试连接

向导会自动测试你的 API Key 是否有效：

```
✓ 连接成功！
```

或者显示错误信息：

```
✗ API Key 无效
✗ 连接超时，请检查网络
⚠ 速率限制，但 API Key 有效
```

#### 4️⃣ 保存配置

配置会保存到：
```
~/.codeyang/config.json
```

## 📝 配置文件格式

生成的配置文件示例：

```json
{
  "provider": "deepseek",
  "apiKey": "deepseek-r-xxxxxxxxxx",
  "baseURL": "https://api.deepseek.com",
  "model": "deepseek-reasoner",
  "maxTokens": 8192,
  "temperature": 0.7,
  "configuredAt": "2024-11-11T17:50:00.000Z"
}
```

## 🔄 重新配置

如果已有配置文件，向导会询问是否覆盖：

```
⚠️  检测到已有配置文件
是否覆盖现有配置？(y/N):
```

## 🛠️ 手动配置

如果你不想使用向导，也可以手动配置：

### 方法 1: 环境变量

```bash
# Windows
set CODEYANG_API_KEY=your-api-key
set CODEYANG_PROVIDER=deepseek

# Linux/Mac
export CODEYANG_API_KEY=your-api-key
export CODEYANG_PROVIDER=deepseek
```

### 方法 2: 手动创建配置文件

创建 `~/.codeyang/config.json`：

```json
{
  "provider": "deepseek",
  "apiKey": "your-api-key",
  "baseURL": "https://api.deepseek.com",
  "model": "deepseek-reasoner",
  "maxTokens": 8192,
  "temperature": 0.7
}
```

## ✅ 验证配置

运行 CodeYang 验证配置是否正确：

```bash
codeyang "hello"
```

成功响应说明配置正确！

## 🔍 故障排除

### API Key 格式错误

确保 API Key 格式正确：
- DeepSeek: `deepseek-r-xxxxxxxxxx`
- OpenAI: `sk-xxxxxxxxxx`
- Anthropic: `anthropic-xxxxxxxxxx`

### 连接超时

1. 检查网络连接
2. 检查防火墙设置
3. 尝试使用 VPN
4. 确认 API 服务地址可访问

### 认证失败

1. 确认 API Key 有效
2. 检查 API Key 是否过期
3. 确认账户有足够额度

### 速率限制

API Key 有效但触发速率限制是正常的，向导会提示：
```
⚠ 速率限制，但 API Key 有效
```

可以继续使用。

## 📊 配置优先级

CodeYang 按以下优先级读取配置：

1. 命令行参数（最高）
2. 环境变量
3. 本地配置文件 (`.codeyang/config.json`)
4. 全局配置文件 (`~/.codeyang/config.json`)

## 🎯 下一步

配置完成后，你可以：

```bash
# 启动交互式会话
codeyang

# 执行单个任务
codeyang "实现用户认证功能"

# 查看帮助
codeyang --help

# 查看版本
codeyang --version
```

## 💡 最佳实践

1. **DeepSeek 推荐用于日常开发** - 性价比高
2. **OpenAI 用于复杂任务** - 能力更强
3. **定期检查 API 额度** - 避免中断
4. **不要泄露 API Key** - 添加到 .gitignore
5. **使用环境变量** - 适合 CI/CD

---

**需要帮助？** 访问 https://github.com/davidjlyoung1985-byte/codeyang/issues
