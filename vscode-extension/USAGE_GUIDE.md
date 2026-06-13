# VS Code 扩展使用指南

## 配置 API Key

### 方法 1: VS Code 设置界面
1. `Ctrl + ,` 打开设置
2. 搜索 `codeyang`
3. 填写以下配置：
   - **Codeyang: Api Key**: 你的 API Key
   - **Codeyang: Api Base Url**: `https://api.deepseek.com/v1`
   - **Codeyang: Model**: `deepseek-chat`
4. 设置会自动保存

### 方法 2: 直接编辑 settings.json
1. `Ctrl + Shift + P` → 输入 "Preferences: Open User Settings (JSON)"
2. 添加：
```json
{
  "codeyang.apiKey": "your-api-key-here",
  "codeyang.apiBaseUrl": "https://api.deepseek.com/v1",
  "codeyang.model": "deepseek-chat"
}
```

### 方法 3: 使用配置文件（推荐）
创建文件 `~/.codeyang/config.json`:
```json
{
  "apiKey": "your-api-key-here",
  "apiBaseUrl": "https://api.deepseek.com/v1",
  "model": "deepseek-chat"
}
```

## 验证配置

### 1. 查看配置文件
```bash
# Windows
type %USERPROFILE%\.codeyang\config.json

# Linux/Mac
cat ~/.codeyang/config.json
```

### 2. 测试连接
1. `Ctrl + Shift + P` → 输入 `CodeYang: Start Chat`
2. 在聊天框中输入：`你好，测试连接`
3. 如果配置正确，AI 会回复

### 3. 检查错误信息
如果配置有误，扩展会显示：
- ❌ "No API key configured"
- ❌ "API request failed: 401 Unauthorized"
- ❌ "Connection timeout"

## 确认方法总结

✅ **配置已保存** = 在设置中能看到你输入的 API Key（部分隐藏显示）

✅ **配置生效** = 启动聊天后，能成功收到 AI 回复

✅ **配置文件存在** = `~/.codeyang/config.json` 文件存在且包含正确内容

## 常见问题

**Q: 输入 API Key 后没反应？**
A: 检查是否点击了保存，或重新加载 VS Code 窗口（`Ctrl + Shift + P` → `Developer: Reload Window`）

**Q: 如何知道 API Key 是否正确？**
A: 启动聊天并发送消息，如果返回 401 错误，说明 Key 错误

**Q: 支持哪些 API？**
A: DeepSeek、Anthropic Claude、OpenAI 兼容接口
