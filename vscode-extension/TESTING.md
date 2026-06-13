# VS Code 扩展测试指南 v0.3.0

## 安装验证

✅ **扩展版本**: 0.3.0  
✅ **安装位置**: VS Code 扩展目录  
✅ **配置文件**: `~/.codeyang/config.json`

## 测试步骤

### 1. 完全重启 VS Code
**重要**: 必须完全关闭所有 VS Code 窗口后重新打开

### 2. 验证扩展已激活
```
Ctrl + Shift + P → 输入 "Extensions: Show Installed Extensions"
查找 "CodeYang AI Agent" v0.3.0
```

### 3. 启动 CodeYang（三种方式）

**方式 1 - 命令面板**:
```
Ctrl + Shift + P → 输入 "CodeYang" → 选择 "CodeYang: Start Chat"
```

**方式 2 - 快捷键**:
```
Ctrl + Shift + Y
```

**方式 3 - 命令面板简化输入**:
```
Ctrl + Shift + P → 输入 "start chat"
```

### 4. 测试 API 连接

在聊天框中输入：
```
你好，请帮我测试连接
```

### 5. 测试代码编辑功能

在聊天框中输入：
```
帮我创建一个测试文件 test.js，内容：
console.log('Hello from CodeYang');
```

## 故障排查

### 如果找不到命令

1. **检查扩展是否安装**:
   ```
   Ctrl + Shift + X → 搜索 "codeyang"
   ```

2. **查看输出日志**:
   ```
   Ctrl + Shift + P → "Developer: Show Logs" → "Extension Host"
   ```

3. **重新加载窗口**:
   ```
   Ctrl + Shift + P → "Developer: Reload Window"
   ```

### 如果出现 403 错误

1. **打开开发者工具**:
   ```
   Ctrl + Shift + P → "Developer: Toggle Developer Tools"
   ```

2. **查看 Console 错误信息**:
   查找 `[CodeYang] API Error:` 日志

3. **检查配置**:
   ```json
   // ~/.codeyang/config.json
   {
     "apiKey": "sk-cceebac9ae424ee1b8a3dc6bda304598",
     "apiBaseUrl": "https://api.deepseek.com/v1",
     "model": "deepseek-chat"
   }
   ```

4. **手动测试 API**:
   打开终端运行：
   ```bash
   curl -X POST https://api.deepseek.com/v1/chat/completions \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer sk-cceebac9ae424ee1b8a3dc6bda304598" \
     -d '{"model":"deepseek-chat","messages":[{"role":"user","content":"hi"}]}'
   ```

## 扩展功能说明

### 可用的编辑工具

1. **Read** - 读取文件
   ```
   读取 src/index.js 的内容
   ```

2. **Write** - 创建/覆盖文件
   ```
   创建文件 src/utils.js，包含一个 formatDate 函数
   ```

3. **Edit** - 精确编辑文件
   ```
   在 src/app.js 中，将 console.log 替换为 logger.info
   ```

4. **Bash** - 运行命令
   ```
   运行 npm test
   ```

5. **Glob** - 搜索文件
   ```
   搜索所有 .ts 文件
   ```

6. **Grep** - 搜索内容
   ```
   在项目中搜索 "TODO" 注释
   ```

## 版本更新日志

### v0.3.0 (2026-06-13)
- ✅ 修改为 `onStartupFinished` 激活（扩展启动时自动加载）
- ✅ 增强错误日志（显示完整 API 错误）
- ✅ 添加快捷键 `Ctrl + Shift + Y`
- ✅ 清理配置，移除重复命令

### v0.2.x
- 初始版本

## API 测试结果

直接 API 测试（2026-06-13）：
- ✅ API Key 有效
- ✅ 端点可访问
- ✅ 模型响应正常

如果扩展中仍然 403，可能原因：
1. 配置文件未被正确读取
2. 请求头格式问题
3. URL 构建错误

## 下一步

完成上述测试后，请告知：
1. 是否能找到并启动 CodeYang 命令？
2. 是否仍然出现 403 错误？
3. 开发者工具中的完整错误信息是什么？
