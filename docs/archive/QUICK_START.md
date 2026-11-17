# CodeYang 快速部署指南

## 🚀 快速开始（3 分钟）

### **方法 1: 使用自动化脚本** ✅ 推荐

#### Windows (PowerShell)
```powershell
# 完整部署（包含测试）
.\deploy.ps1

# 快速部署（跳过测试）
.\deploy.ps1 -SkipTests

# 完全清理后部署
.\deploy.ps1 -Clean
```

#### Linux / Mac (Bash)
```bash
# 添加执行权限
chmod +x deploy.sh

# 完整部署（包含测试）
./deploy.sh

# 快速部署（跳过测试）
./deploy.sh --skip-tests

# 完全清理后部署
./deploy.sh --clean
```

---

### **方法 2: 手动步骤**

```bash
# 1. 安装依赖
npm install

# 2. 格式化代码（可选）
npm run format

# 3. 运行测试（可选）
CODEYANG_BASH_LIMIT=10000 npm test

# 4. 构建项目
npm run build

# 5. 启动
npm start
```

---

## 📋 首次配置

### **1. 配置 API Key**

#### 方法 A: 命令行配置
```bash
npm start -- --api-key YOUR_ANTHROPIC_API_KEY
```

#### 方法 B: 环境变量
```bash
# Linux/Mac
export CODEYANG_API_KEY=your_key_here
npm start

# Windows PowerShell
$env:CODEYANG_API_KEY="your_key_here"
npm start
```

#### 方法 C: 配置文件
创建或编辑 `~/.codeyang/config.json`:
```json
{
  "apiKey": "your_anthropic_api_key"
}
```

---

### **2. 验证安装**

```bash
# 查看版本
npm start -- --version

# 查看帮助
npm start -- --help

# 列出会话
npm start -- --list-sessions
```

---

## 🔧 常见问题

### **问题 1: npm install 失败**

```bash
# 清理并重试
rm -rf node_modules package-lock.json
npm install
```

### **问题 2: 构建失败**

```bash
# 检查 Node.js 版本（需要 >= 18）
node --version

# 更新 npm
npm install -g npm@latest
```

### **问题 3: 测试失败**

```bash
# 跳过测试，直接部署
.\deploy.ps1 -SkipTests   # Windows
./deploy.sh --skip-tests  # Linux/Mac
```

### **问题 4: 运行时停止**

```bash
# 提升限流阈值
CODEYANG_BASH_LIMIT=1000 npm start
```

详见 `TROUBLESHOOTING.md`

---

## 📦 目录结构

```
ai-code-agent/
├── src/                  # 源代码
│   ├── agent/           # AI Agent 核心
│   ├── tools/           # 工具集合
│   ├── mcp/             # MCP 协议
│   ├── sandbox/         # 沙箱系统
│   └── utils/           # 工具函数
├── dist/                # 构建输出
├── tests/               # 测试文件
├── deploy.ps1           # Windows 部署脚本
├── deploy.sh            # Linux/Mac 部署脚本
├── TROUBLESHOOTING.md   # 故障排查指南
└── README.md            # 项目文档
```

---

## 🎯 下一步

1. ✅ **完成部署**
2. 🔑 **配置 API Key**
3. 🚀 **启动 CodeYang**: `npm start`
4. 📖 **阅读文档**: `README.md`
5. 🛠️ **遇到问题**: 查看 `TROUBLESHOOTING.md`

---

## 🌟 推荐配置

创建 `.env` 文件（项目根目录）:
```bash
# API 配置
CODEYANG_API_KEY=your_key_here

# 限流配置（防止中途停止）
CODEYANG_BASH_LIMIT=500
CODEYANG_NETWORK_LIMIT=100

# 调试模式
CODEYANG_DEBUG=false

# 内存配置
NODE_OPTIONS=--max-old-space-size=4096
```

---

## 📞 获取帮助

- **GitHub Issues**: https://github.com/davidjlyoung1985-byte/codeyang/issues
- **文档**: README.md, TROUBLESHOOTING.md
- **测试**: `npm test`
- **构建**: `npm run build`

---

**最后更新**: 2026-09-06  
**版本**: v0.7.1+
