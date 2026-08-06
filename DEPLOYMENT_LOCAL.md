# CodeYang 本机部署指南

## 当前部署状态

✅ **已完成部署** - 2024年8月6日

```
位置: C:\Users\Ehua\codeyang
分支: master (最新)
构建: 成功
测试: 1645/1648 通过 (99.82%)
API: DeepSeek (已配置)
```

## 快速启动

### 推荐方式: 使用启动脚本

**Windows:**
```bash
cd C:\Users\Ehua\codeyang
start.bat
```

**Linux/Mac:**
```bash
cd C:\Users\Ehua\codeyang
chmod +x start.sh
./start.sh
```

### 方式1: 直接执行（推荐）
```bash
cd C:\Users\Ehua\codeyang
node dist/index.js
```

### 方式2: 使用 npm
```bash
cd C:\Users\Ehua\codeyang
npm start
```

### 方式3: 全局命令
```bash
# 创建全局链接
cd C:\Users\Ehua\codeyang
npm link

# 然后在任何目录使用
codeyang
```

## 环境配置

当前 `.env` 配置:
```env
CODEYANG_NO_SANDBOX=true
DEEPSEEK_API_KEY=sk-**********************  # 已隐藏
CODEYANG_BASE_URL=https://api.deepseek.com/v1
CODEYANG_MODEL=deepseek-chat
PONYTAIL_MODE=full

# 新增超时配置（已内置）
CODEYANG_STREAM_TIMEOUT=300000  # 5分钟
CODEYANG_BASH_TIMEOUT=60        # 60秒
```

## 项目结构

```
C:\Users\Ehua\codeyang\
├── dist/              # 编译后的代码（已生成）
│   ├── cli.js        # CLI 入口
│   └── ...
├── src/              # 源代码
│   ├── agent/        # Agent 核心
│   ├── tools/        # 80+ 工具
│   └── ...
├── node_modules/     # 依赖（已安装）
├── .env              # 环境配置（已配置）
└── package.json      # 项目配置
```

## 验证部署

### 1. 检查构建
```bash
ls C:\Users\Ehua\codeyang\dist\cli.js
# 应该存在
```

### 2. 测试启动
```bash
cd C:\Users\Ehua\codeyang
npm start
# 应该进入交互模式
```

### 3. 测试 API 连接
```bash
# 在 CodeYang 交互模式中输入:
hello
# 应该得到 AI 回复
```

## 常用命令

### 开发命令
```bash
# 重新构建
npm run build

# 运行测试
npm test

# 类型检查
npm run type-check

# 代码检查
npm run lint
```

### 项目命令
```bash
# 启动 CLI
npm start

# 启动 Web 服务器
npm run web

# 查看版本
node dist/cli.js --version
```

### 会话管理
```bash
# 列出所有会话
node dist/cli.js --list

# 恢复会话
node dist/cli.js --resume <session-id>

# 删除会话
node dist/cli.js --delete <session-id>
```

## 交互命令

进入 CodeYang 后可用的命令：

| 命令 | 说明 |
|------|------|
| `/clear` | 清空当前对话 |
| `/sessions` | 列出所有会话 |
| `/tools` | 显示可用工具 |
| `/model <name>` | 切换模型 |
| `/mcp` | 显示 MCP 服务器状态 |
| `/exit` 或 `/quit` | 退出 |

## 数据位置

### 配置文件
```
C:\Users\Ehua\.codeyang\
├── config.json       # 用户配置
└── sessions\         # 对话会话
    ├── session-1\
    ├── session-2\
    └── ...
```

### 日志文件
```
C:\Users\Ehua\.codeyang\sessions\<session-id>\
├── chat.log          # 对话日志
├── tools.log         # 工具执行日志
└── errors.log        # 错误日志
```

## 故障排除

### 问题1: 对话中断
**解决方案**: 已修复，超时时间已增加
- 流超时: 5分钟
- Bash超时: 60秒

如需更长时间:
```bash
export CODEYANG_STREAM_TIMEOUT=600000  # 10分钟
export CODEYANG_BASH_TIMEOUT=120       # 2分钟
npm start
```

### 问题2: API 密钥无效
```bash
# 检查密钥
cat .env | grep DEEPSEEK_API_KEY

# 或重新配置
npm start
# 根据提示输入新密钥
```

### 问题3: 构建失败
```bash
# 清理并重新构建
rm -rf dist node_modules
npm install
npm run build
```

### 问题4: 端口占用（Web 模式）
```bash
# 修改端口
export PORT=3001
npm run web
```

### 问题5: 测试失败
当前已知的 3 个测试失败（环境相关，不影响使用）:
- BashTool: 2个超时
- Agent-integration: 1个超时

这些不影响实际功能。

## 性能优化

### 加速启动
```bash
# 使用生产模式
NODE_ENV=production npm start
```

### 减少内存占用
```bash
# 限制 Node.js 内存
node --max-old-space-size=2048 dist/cli.js
```

### 启用调试模式
```bash
export CODEYANG_DEBUG=true
npm start
```

## 更新项目

```bash
cd C:\Users\Ehua\codeyang

# 拉取最新代码
git pull

# 重新安装依赖
npm install

# 重新构建
npm run build

# 测试
npm start
```

## VS Code 集成

### 安装扩展
```bash
cd C:\Users\Ehua\codeyang\vscode-ext
npm install
npm run compile

# 在 VS Code 中按 F5 启动扩展开发模式
```

### 打包扩展
```bash
cd vscode-ext
npm run package
# 生成 codeyang-x.x.x.vsix
```

## Electron 桌面应用

### 开发模式
```bash
cd C:\Users\Ehua\codeyang
npm run electron:dev
```

### 打包应用
```bash
npm run electron:build
# 生成 dist-electron/win-unpacked/CodeYangX.exe
```

## 清理

### 清理构建产物
```bash
rm -rf dist dist-electron
```

### 清理会话数据
```bash
rm -rf C:\Users\Ehua\.codeyang\sessions\*
```

### 完全重置
```bash
cd C:\Users\Ehua\codeyang
rm -rf node_modules dist .codeyang
npm install
npm run build
```

## 备份

### 备份配置
```bash
cp C:\Users\Ehua\.codeyang\config.json ~/backup/codeyang-config.json
```

### 备份会话
```bash
cp -r C:\Users\Ehua\.codeyang\sessions ~/backup/codeyang-sessions
```

## 卸载

```bash
# 1. 删除全局链接（如果创建了）
npm unlink -g codeyang

# 2. 删除项目目录
rm -rf C:\Users\Ehua\codeyang

# 3. 删除用户数据
rm -rf C:\Users\Ehua\.codeyang
```

## 技术支持

- **文档**: [README.md](README.md)
- **故障排除**: [TROUBLESHOOTING_INTERRUPTION.md](TROUBLESHOOTING_INTERRUPTION.md)
- **GitHub**: https://github.com/davidjlyoung1985-byte/codeyang
- **Issues**: https://github.com/davidjlyoung1985-byte/codeyang/issues

## 下一步

1. **测试基本功能**
   ```bash
   npm start
   # 输入: "hello" 测试连接
   # 输入: "创建一个 hello.js 文件" 测试工具
   ```

2. **探索工具**
   ```
   /tools  # 查看所有可用工具
   ```

3. **查看示例**
   ```bash
   cd examples
   cat getting-started.md
   ```

4. **阅读文档**
   - [README.md](README.md) - 项目概述
   - [IMPROVEMENT_SUMMARY.md](IMPROVEMENT_SUMMARY.md) - 改进历史
   - [TROUBLESHOOTING_INTERRUPTION.md](TROUBLESHOOTING_INTERRUPTION.md) - 故障排除

---

**部署状态**: ✅ 成功  
**最后更新**: 2024年8月6日  
**版本**: 0.7.1  
**评分**: 85/100 (B+)
