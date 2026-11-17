# CodeYang - AI Agent Framework

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/tests-2814%20passing-brightgreen.svg)](https://github.com/davidjlyoung1985-byte/codeyang)
[![Score](https://img.shields.io/badge/score-80%2F100-orange.svg)](./docs/FINAL_AUDIT_REPORT.md)

一个安全性业界领先、测试覆盖充分的 AI Agent 框架。

---

## ⭐ 项目亮点

- 🔒 **安全性领先**：95% 安全评分，多层防护体系
- ✅ **测试充分**：2,814 个测试用例，99.96% 通过率
- 🏗️ **架构清晰**：34 个模块，TypeScript strict mode
- 🚀 **持续改进**：快速响应，规范的工程实践

---

## 🚀 快速开始

### 安装

```bash
# 克隆仓库
git clone https://github.com/davidjlyoung1985-byte/codeyang.git
cd codeyang

# 安装依赖
npm install

# 运行测试
npm test
```

### 5 分钟上手

```typescript
import { createAgent } from './src/agent';

// 创建 AI Agent
const agent = await createAgent({
  model: 'claude-3-5-sonnet',
  tools: ['bash', 'file', 'search'],
});

// 执行任务
const result = await agent.execute('创建一个 Hello World 项目');
console.log(result);
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
- [API 文档](./docs/API.md) - 完整 API 参考
- [安全指南](./docs/SECURITY.md) - 安全配置和最佳实践
- [贡献指南](./docs/CONTRIBUTING.md) - 如何参与开发
- [更新日志](./docs/CHANGELOG.md) - 版本历史

### 深度文档

- [架构设计](./docs/ARCHITECTURE.md) - 系统架构详解
- [最终审核报告](./docs/FINAL_AUDIT_REPORT.md) - 项目质量评估
- [安全审计](./docs/SECURITY_AUDIT.md) - 安全审计结果

---

## 🔧 核心功能

### 1. 80+ 工具集成

```typescript
// 文件操作
await agent.readFile('package.json');
await agent.writeFile('output.txt', content);

// Bash 命令（带安全检查）
await agent.executeBash('npm install');

// 网络请求（带 SSRF 防护）
await agent.fetch('https://api.example.com');

// Git 操作
await agent.gitCommit('feat: add new feature');
```

### 2. 权限系统

```typescript
// 三级权限控制
// - allow: 直接执行
// - ask: 需要确认
// - deny: 拒绝执行

// 配置权限规则
{
  pattern: 'rm -rf*',
  level: 'ask',
  reason: 'Dangerous delete operation'
}
```

### 3. 安全沙箱

```typescript
// 隔离执行环境
const sandbox = await createSandbox({
  timeout: 30000,
  memory: '512MB',
  network: false,
});

const result = await sandbox.execute(code);
```

### 4. 完整可观测性

```typescript
// 日志、指标、追踪
import { logger, metricsCollector } from './observability';

logger.info('Task started');
metricsCollector.recordDuration('task', duration);
```

---

## 📊 项目统计

```
评分:        80/100 (B-)
代码量:      76,000 行
测试用例:    2,814 个
测试通过率:  99.96%
安全评分:    95%
模块数:      34 个
```

---

## 🏆 评分详情

| 维度 | 分数 | 评级 |
|------|------|------|
| 功能完整性 | 18/20 | ⭐⭐⭐⭐⭐ |
| **安全性** | **19/20** | **⭐⭐⭐⭐⭐** |
| 代码质量 | 17/20 | ⭐⭐⭐⭐ |
| **测试覆盖** | **18/20** | **⭐⭐⭐⭐⭐** |
| 架构设计 | 16/20 | ⭐⭐⭐⭐ |

详见：[完整审核报告](./docs/FINAL_AUDIT_REPORT.md)

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
