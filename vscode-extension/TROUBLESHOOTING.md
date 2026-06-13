# VS Code 扩展故障排查指南

## 当前版本
- **扩展版本**: 0.2.1
- **更新内容**: 增强错误日志，详细显示 API 错误信息

## 使用步骤

### 1. 重新加载 VS Code
按 `Ctrl + Shift + P` → 输入 `Developer: Reload Window` → 回车

### 2. 启动 CodeYang
按 `Ctrl + Shift + P` → 输入 `CodeYang: Start Chat` → 回车

### 3. 测试连接
在聊天框输入：`你好，测试连接`

### 4. 查看错误日志（如果出现 403）
按 `Ctrl + Shift + P` → 输入 `Developer: Toggle Developer Tools` → 回车

在 Console 标签查看详细错误信息：
- `[CodeYang] API Error:` - HTTP 状态码和完整错误
- `[CodeYang] Request URL:` - 使用的 API 端点
- `[CodeYang] Model:` - 使用的模型

## 常见 403 错误原因

### 1. API Key 格式错误
**检查**: `~/.codeyang/config.json`
```json
{
  "apiKey": "sk-xxxxxxxxxxxxxxxx",  // 必须是 sk- 开头
  "apiBaseUrl": "https://api.deepseek.com/v1",
  "model": "deepseek-chat"
}
```

### 2. API 端点错误
**DeepSeek 正确端点**: `https://api.deepseek.com/v1`
**不要使用**: `http://127.0.0.1:15721` (本地代理)

### 3. 配置未生效
重新加载 VS Code 窗口后再试

## 功能说明

扩展支持的工具（可直接编辑代码）：

### 文件操作
- ✅ **Read** - 读取文件内容
- ✅ **Write** - 写入文件（创建/覆盖）
- ✅ **Edit** - 精确编辑文件（字符串替换）
- ✅ **Glob** - 搜索文件
- ✅ **Grep** - 搜索文件内容

### 代码操作
- ✅ **Bash** - 运行命令
- ✅ **Search** - 智能代码搜索
- ✅ **TodoWrite** - 创建待办事项

### 使用示例

**让 AI 修改代码：**
```
请修改 src/index.ts 文件：
1. 找到 main 函数
2. 在第一行添加日志输出
3. 显示修改后的内容
```

**让 AI 创建新文件：**
```
创建一个新文件 src/utils/helper.ts，包含以下函数：
- formatDate(date: Date): string
- capitalize(str: string): string
```

**让 AI 搜索和修改：**
```
在项目中搜索所有使用 console.log 的地方，
替换为 logger.info()
```

## 下一步

如果仍然出现 403 错误，请：
1. 打开开发者工具查看完整错误
2. 检查 API Key 是否有效
3. 确认网络可以访问 api.deepseek.com
