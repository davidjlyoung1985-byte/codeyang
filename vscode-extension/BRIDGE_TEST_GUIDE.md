# 🚀 CodeYang Bridge 连接测试指南

## ✅ Bridge Server 状态

**当前状态：** 运行中 (需要认证)

**地址：** http://localhost:9876

**认证方式：** Bearer Token

---

## 🔧 测试连接

### 方法 1: 使用 curl (带 Token)

```bash
# 健康检查
curl -H "Authorization: Bearer b6c5b8142c7379a175220712d2b5171898920eeacbf34645744a1ffdbc9aef9a" \
  http://localhost:9876/health

# 预期输出:
# {"status":"ok","agent":"ready"}
```

### 方法 2: 从 VS Code 扩展连接

VS Code 扩展会自动使用配置的 API Key：

```json
// settings.json
{
  "codeyang.useBridge": true,
  "codeyang.bridgeURL": "http://localhost:9876",
  "codeyang.apiKey": "b6c5b8142c7379a175220712d2b5171898920eeacbf34645744a1ffdbc9aef9a"
}
```

---

## 📋 完整测试步骤

### 1. 验证 Bridge Server

```powershell
# PowerShell
$headers = @{
    "Authorization" = "Bearer b6c5b8142c7379a175220712d2b5171898920eeacbf34645744a1ffdbc9aef9a"
}
Invoke-WebRequest -Uri "http://localhost:9876/health" -Headers $headers
```

### 2. 编译 VS Code 扩展

```bash
cd vscode-extension
npm install
npm run compile
```

### 3. 安装扩展到 VS Code

```bash
# 方法 1: 打包安装
npm run package
code --install-extension codeyang-vscode-0.2.0.vsix

# 方法 2: 开发模式
# 在 VS Code 中按 F5 启动调试
```

### 4. 配置扩展

```json
// .vscode/settings.json 或用户设置
{
  // Bridge 模式 (推荐)
  "codeyang.useBridge": true,
  "codeyang.bridgeURL": "http://localhost:9876",
  "codeyang.apiKey": "b6c5b8142c7379a175220712d2b5171898920eeacbf34645744a1ffdbc9aef9a",
  
  // 启用所有功能
  "codeyang.useTools": true,
  "codeyang.useRL": true,
  "codeyang.useMemory": true,
  
  // 补全设置
  "codeyang.enableInlineCompletion": true,
  "codeyang.completionDelay": 300
}
```

### 5. 重新加载 VS Code

```
Ctrl+Shift+P → "Developer: Reload Window"
```

### 6. 验证连接

打开任意代码文件，应该看到：
```
✅ CodeYang: Connected to Agent (Full features available)
```

---

## 🧪 测试功能

### 测试 1: 智能补全

1. 打开 `.ts` 或 `.js` 文件
2. 开始输入代码
3. 等待自动补全或按 `Ctrl+Shift+Space`
4. 检查控制台日志：
   ```
   [BridgeCompletion] Tools used: Read, Grep
   ```

### 测试 2: 代码重构

1. 选中一段代码
2. 按 `Ctrl+Shift+R`
3. 选择重构操作
4. Agent 会自动：
   - Grep 查找引用
   - Read 读取相关文件
   - 重构所有位置
   - 运行测试验证

### 测试 3: 测试生成

1. 打开源代码文件
2. 按 `Ctrl+Shift+T`
3. Agent 会：
   - Read 源文件
   - 生成测试
   - Write 测试文件
   - Bash 运行测试
   - 报告结果

### 测试 4: Agent 统计

1. `Ctrl+Shift+P`
2. 输入 "CodeYang: Show Agent Statistics"
3. 查看：
   - 工具使用次数
   - RL 权重排名
   - 记忆条目数

### 测试 5: 自定义任务

1. `Ctrl+Shift+P`
2. 输入 "CodeYang: Execute Custom Task"
3. 输入任务，例如：
   - "Find all TODO comments"
   - "Optimize this function"
   - "Add error handling to all APIs"

---

## 🔍 调试技巧

### 查看扩展日志

```
VS Code → Output 面板 → 选择 "CodeYang"
```

### 查看开发者工具

```
Help → Toggle Developer Tools → Console
查找 [CodeYang] 或 [BridgeClient] 日志
```

### 常见问题

**Q: Bridge 连接失败**
```
A: 检查 Bridge Server 是否运行
   curl http://localhost:9876/health
```

**Q: 补全不工作**
```
A: 1. 检查配置
   2. 查看控制台错误
   3. 尝试手动触发 (Ctrl+Shift+Space)
```

**Q: Bridge 模式未启用**
```
A: 检查 settings.json:
   "codeyang.useBridge": true
```

---

## 📊 预期行为

### Bridge 模式已启用

```
[CodeYang] Using Bridge mode for completions
[BridgeClient] WebSocket connected
[BridgeClient] Connected to bridge at http://localhost:9876

补全时:
[BridgeCompletion] Tools used: Read, Grep
[Agent] Tool executed: Read
[Agent] Tool executed: Grep
```

### 回退到直接 API

```
[CodeYang] Bridge connection failed
⚠️ CodeYang: Bridge not available. Using direct API mode
[CodeYang] Using Direct API mode for completions
```

---

## ✅ 成功标志

1. **连接成功**
   ```
   ✅ CodeYang: Connected to Agent (Full features available)
   ```

2. **工具使用**
   ```
   控制台显示: [BridgeCompletion] Tools used: Read, Grep
   ```

3. **RL 优化**
   ```
   统计显示不同工具的权重值
   ```

4. **实时更新**
   ```
   状态栏显示: 🤖 CodeYang: Reading project files...
   ```

---

## 🎯 下一步

1. ✅ Bridge Server 运行中
2. ⏳ 编译 VS Code 扩展
3. ⏳ 安装扩展
4. ⏳ 配置 Bridge 连接
5. ⏳ 测试所有功能

---

**准备好了吗？开始测试 Bridge 集成！** 🚀

**命令参考：**
```bash
# 编译扩展
cd vscode-extension
npm run compile

# 打包
npm run package

# 安装
code --install-extension codeyang-vscode-0.2.0.vsix
```
