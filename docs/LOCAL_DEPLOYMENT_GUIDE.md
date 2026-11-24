# CodeYang 本地部署完成指南

**部署日期**: 2026-11-24  
**版本**: v1.1.0  
**状态**: ✅ 完全就绪

---

## ✅ 部署验证结果

### 系统环境
- ✅ Node.js: v24.15.0
- ✅ npm: 11.12.1
- ✅ 操作系统: Windows (Git Bash)

### 安装状态
- ✅ 命令可用: `/c/Users/Ehua/AppData/Roaming/npm/codeyang`
- ✅ 构建产物: 24 个文件
- ✅ 测试通过: 146/146 测试文件
- ✅ 环境配置: .env 已存在
- ✅ 配置目录: ~/.codeyang 已初始化
- ✅ 保存的会话: 1 个

---

## 🚀 快速开始

### 1. 配置 API Key（如果还没配置）

```bash
# 使用配置向导（推荐）
codeyang-setup

# 或者手动编辑 .env 文件
cd ~/codeyang
nano .env
```

需要配置的环境变量：
```bash
# Anthropic (Claude)
ANTHROPIC_API_KEY=sk-ant-xxxxx

# OpenAI (GPT)
OPENAI_API_KEY=sk-xxxxx

# DeepSeek
DEEPSEEK_API_KEY=sk-xxxxx

# 其他配置
CODEYANG_MODEL=claude-3-5-sonnet
PONYTAIL_MODE=full
```

### 2. 启动 CodeYang

```bash
# 基础模式
codeyang

# 扩展模式（更多功能）
codeyangx

# Web 界面
codeyang-web
```

### 3. 基本使用

启动后，你可以：

```bash
# 查看帮助
/help

# 执行任务
创建一个 Hello World 程序

# 查看配置
/config

# 切换模型
/model claude-opus-4

# 保存会话
/tag

# 列出所有会话
/sessions

# 清除对话
/clear

# 退出
/exit
```

---

## 📚 常用命令

### 全局命令

```bash
# 查看版本
codeyang --version

# 查看帮助
codeyang --help

# 列出保存的会话
codeyang --list

# 恢复会话
codeyang --resume <session-id>

# 删除会话
codeyang --delete <session-id>

# 导出会话为 Markdown
codeyang --export-md <session-id>

# 导出会话为 JSON
codeyang --export-json <session-id>
```

### 交互式命令

在 CodeYang 运行时：

```bash
/clear          # 清除对话
/model <name>   # 切换模型
/config         # 查看配置
/reload         # 重新加载配置
/mcp            # 查看 MCP 服务器
/sessions       # 列出会话
/tasks          # 列出任务
/tag            # 保存检查点
/rewind         # 恢复检查点
/ctx_viz        # 查看上下文使用
/plan           # 进入计划模式
/help           # 查看帮助
/exit           # 退出
```

---

## 🎯 使用场景

### 1. 代码生成

```
你: 创建一个 TypeScript 函数，计算斐波那契数列

CodeYang 会：
- 生成函数代码
- 添加类型定义
- 包含测试用例
- 自动保存到文件
```

### 2. Bug 修复

```
你: 修复 src/utils/helper.ts 中的类型错误

CodeYang 会：
- 读取文件
- 分析错误
- 修复代码
- 运行测试验证
```

### 3. 代码审查

```
你: 审查 src/components/Button.tsx 的代码质量

CodeYang 会：
- 分析代码
- 指出潜在问题
- 提供改进建议
- 可选地直接修复
```

### 4. 文档生成

```
你: 为 src/api/users.ts 生成 API 文档

CodeYang 会：
- 分析代码
- 生成 Markdown 文档
- 包含示例和参数说明
```

---

## ⚙️ 高级配置

### 环境变量

```bash
# API 配置
CODEYANG_API_KEY          # API Key
CODEYANG_MODEL            # 默认模型
CODEYANG_BASE_URL         # 自定义 API 地址
CODEYANG_MAX_TOKENS       # 最大 token 数

# 功能开关
CODEYANG_AUTO_VERIFY      # 自动验证（默认 true）
CODEYANG_AUTO_FIX         # 自动修复（默认 true）
CODEYANG_WATCH            # 监听文件变化（默认 true）

# 安全配置
CODEYANG_PERMIT_RM        # rm -rf 权限（ask/allow/deny）
CODEYANG_PERMIT_SUDO      # sudo 权限（ask/allow/deny）
CODEYANG_PERMIT_FORCE     # git push --force 权限（ask/allow/deny）

# Ponytail 模式
PONYTAIL_MODE             # full/medium/minimal
```

### MCP 服务器配置

在 `~/.codeyang/config.json` 中添加：

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/dir"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "your-token"
      }
    }
  }
}
```

---

## 🔧 故障排查

### 问题 1: 命令未找到

```bash
# 解决方案：重新链接
cd ~/codeyang
npm link

# 验证
which codeyang
```

### 问题 2: API Key 未配置

```bash
# 运行配置向导
codeyang-setup

# 或手动编辑
nano ~/codeyang/.env
```

### 问题 3: 权限错误

```bash
# 检查文件权限
ls -la ~/codeyang/dist/

# 重新构建
cd ~/codeyang
npm run build
npm link
```

### 问题 4: 测试失败

```bash
# 运行测试查看详情
cd ~/codeyang
npm test

# 查看覆盖率
npm run test:coverage
```

---

## 📊 性能优化

### 1. 启用缓存

在 `.env` 中：
```bash
CODEYANG_CACHE_ENABLED=true
CODEYANG_CACHE_DIR=~/.codeyang/cache
```

### 2. 调整 Token 限制

```bash
# 更大的上下文窗口（更多记忆）
CODEYANG_MAX_TOKENS=2000000

# 更小的响应（更快但信息少）
CODEYANG_MAX_TOKENS=500000
```

### 3. 使用更快的模型

```bash
# 快速任务用 Haiku
CODEYANG_MODEL=claude-3-haiku

# 复杂任务用 Opus
CODEYANG_MODEL=claude-opus-4
```

---

## 🔄 更新 CodeYang

```bash
cd ~/codeyang

# 拉取最新代码
git pull origin master

# 安装依赖
npm install

# 重新构建
npm run build

# 重新链接
npm link

# 验证
codeyang --version
```

---

## 📁 重要文件位置

```
~/codeyang/                  # 源代码目录
├── dist/                    # 构建产物
├── src/                     # 源代码
├── .env                     # 环境配置
└── README.md                # 项目文档

~/.codeyang/                 # 用户配置目录
├── config.json              # 用户配置
├── sessions/                # 保存的会话
└── cache/                   # 缓存文件

/c/Users/Ehua/AppData/Roaming/npm/
└── codeyang                 # 全局命令（符号链接）
```

---

## 🎉 下一步

1. **阅读文档**
   ```bash
   cat ~/codeyang/docs/QUICKSTART.md
   ```

2. **尝试第一个任务**
   ```bash
   codeyang
   # 然后输入: 创建一个简单的 Hello World 程序
   ```

3. **探索高级功能**
   - MCP 集成
   - Tree-of-Thoughts
   - Ponytail 方法论
   - Agent 间通信

4. **参与贡献**
   ```bash
   # Fork 项目
   # 创建分支
   # 提交改进
   # 创建 Pull Request
   ```

---

## 🆘 获取帮助

- **文档**: `~/codeyang/docs/`
- **GitHub Issues**: https://github.com/davidjlyoung1985-byte/codeyang/issues
- **FAQ**: `~/codeyang/docs/FAQ.md`

---

**部署完成！享受使用 CodeYang！** 🚀
