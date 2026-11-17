# 5 分钟快速开始

CodeYang 快速上手指南，让你在 5 分钟内开始使用。

---

## 📋 前置要求

- Node.js 18+
- npm 或 yarn
- Anthropic 或 OpenAI API Key

---

## ⚡ 快速安装

### 1. 克隆项目

```bash
git clone https://github.com/davidjlyoung1985-byte/codeyang.git
cd codeyang
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境

创建 `.env` 文件：

```bash
cp .env.example .env
```

编辑 `.env` 添加你的 API Key：

```bash
# 必需：至少配置一个
ANTHROPIC_API_KEY=sk-ant-xxx...
# 或
OPENAI_API_KEY=sk-xxx...

# 可选：安全设置
CODEYANG_PERMIT_RM=ask
CODEYANG_PERMIT_SUDO=deny
```

### 4. 验证安装

```bash
npm test
```

---

## 🎯 第一个示例

### 创建 Hello World

创建 `example.ts`：

```typescript
import { createAgent } from './src/agent';
import { logger } from './src/utils/logger';

async function main() {
  // 1. 创建 Agent
  const agent = await createAgent({
    model: 'claude-3-5-sonnet',
    tools: ['bash', 'file'],
  });

  // 2. 执行任务
  const result = await agent.execute(
    '创建一个 hello.txt 文件，内容是 Hello, CodeYang!'
  );

  // 3. 查看结果
  logger.info('Result:', result);
}

main();
```

运行：

```bash
npm run dev example.ts
```

---

## 📚 常见用例

### 用例 1：文件操作

```typescript
import { readFile, writeFile } from './src/tools/FileSystemTool';

// 读取文件
const content = await readFile('package.json');

// 写入文件
await writeFile('output.txt', 'Hello World');
```

### 用例 2：执行命令

```typescript
import { executeBash } from './src/tools/BashTool';

// 安全执行命令（带权限检查）
const result = await executeBash('npm install express');
console.log(result.stdout);
```

### 用例 3：网络请求

```typescript
import { fetch } from './src/tools/NetworkTool';

// 带 SSRF 防护的网络请求
const response = await fetch('https://api.github.com/users/octocat');
console.log(await response.json());
```

### 用例 4：Git 操作

```typescript
import { gitCommit, gitPush } from './src/tools/GitTool';

// Git 提交
await gitCommit('feat: add new feature');

// Git 推送（需要确认）
await gitPush('origin', 'main');
```

---

## 🔒 安全配置

### 权限级别

CodeYang 使用三级权限系统：

| 级别 | 说明 | 示例 |
|------|------|------|
| `allow` | 直接执行 | `ls`, `cat` |
| `ask` | 需要确认 | `rm -rf`, `git push --force` |
| `deny` | 拒绝执行 | `sudo`, `mkfs` |

### 配置权限规则

编辑 `~/.codeyang/permissions.json`：

```json
{
  "version": 2,
  "rules": [
    {
      "pattern": "rm -rf*",
      "level": "ask",
      "category": "bash",
      "reason": "Dangerous recursive delete"
    },
    {
      "pattern": "sudo*",
      "level": "deny",
      "category": "bash",
      "reason": "Elevated privileges not allowed"
    }
  ]
}
```

### 环境变量覆盖

```bash
# 允许 rm -rf（不推荐）
CODEYANG_PERMIT_RM=allow npm run dev

# 拒绝所有 sudo
CODEYANG_PERMIT_SUDO=deny npm run dev

# 需要确认 git push --force
CODEYANG_PERMIT_FORCE=ask npm run dev
```

---

## 🧪 运行测试

```bash
# 运行所有测试
npm test

# 运行特定测试
npm test -- src/security/

# 生成覆盖率报告
npm run coverage

# 监听模式
npm test -- --watch
```

---

## 🐛 故障排除

### 问题 1：API Key 未配置

**错误**：
```
Error: ANTHROPIC_API_KEY is not set
```

**解决**：
```bash
# 在 .env 文件中添加
ANTHROPIC_API_KEY=sk-ant-xxx...
```

### 问题 2：权限被拒绝

**错误**：
```
[PERMISSION] Command 'rm -rf /' requires confirmation
```

**解决**：
- 这是安全特性，按提示确认
- 或修改 `~/.codeyang/permissions.json`

### 问题 3：SSRF 防护触发

**错误**：
```
SSRF: Private IP address detected
```

**解决**：
- 这是安全特性，防止访问内网
- 检查 URL 是否正确
- 如需访问本地，使用 `CODEYANG_ALLOW_PRIVATE=true`

---

## 📖 下一步

- [API 文档](./API.md) - 完整 API 参考
- [安全指南](./SECURITY.md) - 深入了解安全特性
- [架构设计](./ARCHITECTURE.md) - 理解系统架构
- [贡献指南](./CONTRIBUTING.md) - 参与开发

---

## 💡 示例项目

查看 `examples/` 目录：

```bash
examples/
├── basic/           # 基础示例
├── file-ops/        # 文件操作
├── git-workflow/    # Git 工作流
└── web-scraping/    # 网页抓取
```

运行示例：

```bash
npm run example:basic
npm run example:file-ops
```

---

## 🤝 获取帮助

- 📘 [文档](../README.md)
- 🐛 [报告问题](https://github.com/davidjlyoung1985-byte/codeyang/issues)
- 💬 [讨论区](https://github.com/davidjlyoung1985-byte/codeyang/discussions)

---

**恭喜！你已经完成 CodeYang 快速开始！** 🎉
