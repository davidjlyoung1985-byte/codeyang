# CodeYang - AI Agent Framework

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/tests-2834%20passing-brightgreen.svg)](https://github.com/davidjlyoung1985-byte/codeyang)
[![Coverage](https://img.shields.io/badge/coverage-76.4%25-yellowgreen.svg)](./docs/STATUS.md)

一个面向命令行的 AI 编码 Agent，内置 82 个工具、多层权限控制与沙箱隔离。

> 工程现状（测试数、覆盖率、已知短板）见 **[docs/STATUS.md](./docs/STATUS.md)**。该文件是项目状态的唯一来源。

---

## ⭐ 项目特点

- 🔒 **多层安全防护**：SSRF 检测（含 IPv6）、危险命令拦截、路径保护、删除保护、审计日志
- ✅ **测试基线**：2,834 个用例通过，`tsc --noEmit` 与 `eslint` 均为 0 错误
- 🏗️ **模块化架构**：30 个模块，TypeScript strict 全开
- 🖥️ **CLI 优先**：单进程交互式使用，无需部署服务

---

## 🚀 快速开始

### 安装

```bash
# 克隆仓库
git clone https://github.com/davidjlyoung1985-byte/codeyang.git
cd codeyang

# 安装依赖
npm install

# 构建
npm run build

# 运行测试
npm test
```

### 快速开始

CodeYang 是 **CLI 工具**，当前不提供库形式的编程接口（详见 [STATUS.md](./docs/STATUS.md#分发形态)）。

```bash
# 方式一：从源码运行
npm run build
node dist/index.js

# 方式二：Windows / Unix 启动脚本
./start.bat      # Windows
./start.sh       # macOS / Linux

# 配置向导（首次使用）
npm run setup
```

首次运行会提示输入 API Key。也可直接通过参数传入：

```bash
node dist/index.js --api-key sk-xxxx
```

常用命令：

```bash
node dist/index.js --help              # 查看全部参数
node dist/index.js --list              # 列出已保存会话
node dist/index.js --resume <id>       # 恢复会话
node dist/index.js --export-md <id>    # 导出为 Markdown
```

### 配置

创建 `.env` 文件：

```bash
# API Keys
ANTHROPIC_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here

# 安全设置
CODEYANG_PERMIT_RM=ask      # rm -rf 需要确认
CODEYANG_PERMIT_SUDO=deny   # 禁止 sudo
CODEYANG_PERMIT_FORCE=ask   # git push --force 需要确认
```

---

## 📚 文档

- [快速开始](./docs/QUICKSTART.md) - 5 分钟上手指南
- [工程现状](./docs/STATUS.md) - 实测指标与已知短板
- [API 参考](./docs/api-reference.md) - 工具与命令行参考
- [安全指南](./docs/SECURITY.md) - 安全配置和最佳实践
- [贡献指南](./docs/CONTRIBUTING.md) - 如何参与开发
- [更新日志](./docs/CHANGELOG.md) - 版本历史

### 深度文档

- [架构设计](./docs/architecture.md) - 系统架构详解
- [部署指南](./docs/DEPLOYMENT.md) - 生产环境部署
- [常见问题](./docs/FAQ.md) - FAQ

历史审计与改进报告见 [`docs/archive/`](./docs/archive/)，其中的评分声明已过时。

---

## 🔧 核心功能

### 1. 工具集成（82 个）

覆盖文件读写、Bash/PowerShell、Git、网络请求、代码分析、数据转换、图像处理、TodoWrite、子 Agent 调度等。

工具定义位于 [`src/tools/definitions/`](./src/tools/definitions/)，按域拆分（filesystem / shell / git / network / code / data / search 等）。

### 2. 权限系统

三级权限：`allow` 直接执行、`ask` 需确认、`deny` 直接拒绝。规则可按命令模式配置，危险操作（`rm -rf`、`sudo`、`git push --force`）默认走 `ask` 或 `deny`。

实现见 [`src/permission/`](./src/permission/)。

### 3. 安全沙箱

命令执行可隔离在受限环境中（超时、内存上限、网络开关）。沙箱实现按平台分文件（Windows / macOS / Linux）。

见 [`src/sandbox/`](./src/sandbox/)。

### 4. 可观测性

统一日志（`src/utils/logger.ts`）、指标采集、追踪、健康检查。

见 [`src/observability/`](./src/observability/)、[`src/metrics/`](./src/metrics/)、[`src/tracing/`](./src/tracing/)。

---

## 📊 项目规模

```
源文件（非测试）:  221 个 .ts
源码行数:          43,147 行
测试文件:          146 个
测试用例:          2,834 通过 / 7 跳过 / 0 失败
语句覆盖率:        76.4%
模块目录:          30 个
内置工具:          82 个
```

完整指标与采集方式见 [docs/STATUS.md](./docs/STATUS.md)。

---

## 🔒 安全特性

### 多层防护体系

- ✅ **SSRF 防护**：IPv4/IPv6 完整检测
- ✅ **危险命令检查**：`rm -rf /`, `curl|sh` 等
- ✅ **路径保护**：防止访问敏感目录
- ✅ **删除保护**：防止误删关键文件
- ✅ **权限确认**：危险操作需要用户确认
- ✅ **沙箱隔离**：隔离执行环境
- ✅ **审计日志**：完整的操作记录

---

## 🧪 测试

```bash
# 运行所有测试
npm test

# 运行特定测试
npm test -- src/security/

# 生成覆盖率报告
npm run coverage

# 运行端到端测试
npm test -- e2e
```

---

## 🤝 贡献

欢迎贡献！请查看 [贡献指南](./docs/CONTRIBUTING.md)。

### 开发流程

```bash
# Fork 并克隆
git clone https://github.com/YOUR_USERNAME/codeyang.git

# 创建分支
git checkout -b feature/your-feature

# 开发和测试
npm test

# 提交
git commit -m "feat: add your feature"
git push origin feature/your-feature

# 创建 Pull Request
```

---

## 📜 许可证

[MIT License](./LICENSE)

---

## 🙏 致谢

- [Anthropic](https://www.anthropic.com/) - Claude API
- [OpenAI](https://openai.com/) - GPT API
- 所有贡献者

---

## 📞 联系方式

- GitHub Issues: [报告问题](https://github.com/davidjlyoung1985-byte/codeyang/issues)
- GitHub Discussions: [讨论](https://github.com/davidjlyoung1985-byte/codeyang/discussions)

---

## 🗺️ 路线图

### 近期 (1-2 周)
- [ ] 完成 Web 控制台
- [ ] 精简文档结构
- [ ] Mutation Testing

### 中期 (1-2 月)
- [ ] PostgreSQL 支持
- [ ] 云存储集成
- [ ] 性能优化

### 长期
- [ ] 多租户支持
- [ ] VS Code 插件
- [ ] 企业版

---

**⭐ 如果这个项目对你有帮助，请给一个 Star！**
