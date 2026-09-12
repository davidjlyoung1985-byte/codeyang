# CodeYang 常见问题 (FAQ)

**版本**: 1.0  
**更新时间**: 2026-09-12

---

## 📋 目录

- [一般问题](#一般问题)
- [安装和配置](#安装和配置)
- [功能和使用](#功能和使用)
- [性能和限制](#性能和限制)
- [故障排除](#故障排除)
- [安全和隐私](#安全和隐私)
- [高级主题](#高级主题)

---

## 一般问题

### Q1: CodeYang 是什么？

**A**: CodeYang 是一个 AI 驱动的编码助手，可以帮助你：
- 编写和重构代码
- 运行命令和管理 Git
- 审查代码质量
- 生成测试和文档
- 从错误中学习

它使用大语言模型（LLM）理解自然语言指令并执行开发任务。

### Q2: CodeYang 和 GitHub Copilot 有什么区别？

**A**: 主要区别：

| 特性 | CodeYang | GitHub Copilot |
|------|----------|----------------|
| 范围 | 完整的代码库操作 | 主要是代码补全 |
| 工具访问 | 文件系统、Git、命令行 | 有限 |
| 自主性 | 高度自主，可执行多步骤任务 | 被动补全 |
| 学习能力 | 从错误中学习（Reflexion） | 无 |
| Qt 支持 | 专门的 Qt/QML 工具 | 一般支持 |

### Q3: CodeYang 免费吗？

**A**: CodeYang 本身是开源的（MIT 许可证），但你需要：
- LLM API 密钥（如 DeepSeek、OpenAI）
- API 使用会产生费用

### Q4: 支持哪些 LLM？

**A**: CodeYang 支持任何兼容 OpenAI API 的 LLM：
- DeepSeek (默认)
- OpenAI GPT-4/GPT-3.5
- Claude (通过适配器)
- 本地模型（如 Ollama）

### Q5: CodeYang 的当前状态是什么？

**A**: 
- **版本**: v0.9.0 (Beta)
- **质量评分**: 94/100
- **测试覆盖率**: 76% (2207 个测试)
- **状态**: 接近生产就绪，适合个人和小团队使用
- **v1.0 预计**: 4-6 周后

---

## 安装和配置

### Q6: 如何安装 CodeYang？

**A**: 
```bash
# 克隆仓库
git clone https://github.com/davidjlyoung1985-byte/codeyang.git
cd codeyang

# 安装依赖
npm install

# 配置
cp .env.example .env
# 编辑 .env 添加你的 API 密钥

# 启动
npm start
```

### Q7: 需要什么系统要求？

**A**: 
- **Node.js**: 18.0.0 或更高
- **npm**: 8.0.0 或更高
- **内存**: 至少 4GB RAM
- **操作系统**: Windows, macOS, Linux
- **网络**: 需要互联网连接访问 LLM API

### Q8: 如何配置 API 密钥？

**A**: 在 `.env` 文件中：
```bash
CODEYANG_API_KEY=your-api-key-here
CODEYANG_BASE_URL=https://api.deepseek.com/v1
CODEYANG_MODEL=deepseek-chat
```

### Q9: 可以使用本地 LLM 吗？

**A**: 可以！使用 Ollama 或其他本地模型：
```bash
# 安装 Ollama
# 启动模型
ollama run codellama

# 配置 CodeYang
CODEYANG_BASE_URL=http://localhost:11434
CODEYANG_MODEL=codellama
```

### Q10: 如何切换不同的 LLM？

**A**: 修改 `.env` 文件或使用命令：
```
你: /model gpt-4
你: /model deepseek-chat
```

---

## 功能和使用

### Q11: CodeYang 可以做什么？

**A**: CodeYang 可以：
- ✅ 读取、编写、编辑文件
- ✅ 运行命令（npm, git, 等）
- ✅ 搜索代码
- ✅ Git 操作（提交、分支、合并）
- ✅ 生成测试和文档
- ✅ 代码审查和重构
- ✅ Qt/QML 开发（专门支持）
- ✅ 从错误中学习（Reflexion）
- ✅ 网络搜索和获取

### Q12: CodeYang 不能做什么？

**A**: CodeYang 不能：
- ❌ 直接访问数据库
- ❌ 访问受限网络资源
- ❌ 执行需要 GUI 的操作
- ❌ 访问外部服务（除非通过 API）
- ❌ 保证 100% 正确的代码

### Q13: 如何让 CodeYang 记住项目信息？

**A**: 使用记忆系统：
```
你: 记住：这个项目使用 TypeScript strict 模式
你: 记住：总是使用 logger 而不是 console.log
你: 记住：API 端点前缀是 /api/v1
```

查看记忆：
```
你: 列出所有记忆
```

### Q14: 会话是否自动保存？

**A**: 是的，每 10 分钟自动保存。你也可以：
```
你: /sessions           # 查看所有会话
你: /tag project-X      # 标记当前会话
你: /load session-123   # 加载会话
```

### Q15: 如何撤销 CodeYang 的更改？

**A**: 使用 Git：
```
你: 撤销最后一次提交
你: git checkout <file>  # 恢复文件
你: /undo                # 撤销最后一个操作（如果支持）
```

建议：重要操作前先提交。

---

## 性能和限制

### Q16: CodeYang 可以处理大型项目吗？

**A**: 可以，但有限制：
- **上下文窗口**: 依赖 LLM（通常 32k-100k tokens）
- **策略**: CodeYang 使用上下文总结和选择性读取
- **建议**: 分批处理大型重构

### Q17: 响应时间慢怎么办？

**A**: 优化方法：
1. 使用更快的模型
2. 减少上下文大小：`/clear`
3. 更精确的请求
4. 检查网络连接
5. 使用本地 LLM

### Q18: Token 使用量如何？

**A**: 取决于：
- 请求复杂度
- 上下文大小
- 模型类型

**估算**:
- 简单请求: 1k-5k tokens
- 中等请求: 5k-20k tokens
- 复杂请求: 20k-50k tokens

### Q19: 有速率限制吗？

**A**: 取决于 LLM 提供商：
- DeepSeek: 相对宽松
- OpenAI: 有严格限制
- 本地模型: 无限制

CodeYang 有内置重试和错误处理。

### Q20: 可以离线使用吗？

**A**: 部分可以：
- ✅ 使用本地 LLM
- ❌ 不能使用在线 API（WebSearch, WebFetch）
- ✅ 所有本地工具可用

---

## 故障排除

### Q21: "API request failed" 错误

**A**: 检查：
1. API 密钥是否正确
2. 网络连接
3. API 服务是否正常
4. 账户余额
5. 速率限制

### Q22: 测试失败

**A**: 
```bash
# 清理并重新安装
rm -rf node_modules package-lock.json
npm install

# 清理缓存
npm run test:clean

# 重新运行
npm test
```

### Q23: "Out of memory" 错误

**A**: 
```bash
# 增加 Node.js 内存
export NODE_OPTIONS="--max-old-space-size=4096"
npm start
```

### Q24: Git 冲突

**A**: 
```
你: 显示 git 状态
你: 显示冲突文件
你: 帮我解决 [file] 中的冲突
```

### Q25: CodeYang 不响应

**A**: 
1. 检查进程是否还在运行
2. 查看日志文件
3. 重启 CodeYang
4. 检查系统资源

---

## 安全和隐私

### Q26: CodeYang 会泄露我的代码吗？

**A**: 不会。但要注意：
- 代码会发送到 LLM API 进行处理
- 使用可信赖的 LLM 提供商
- 不要处理极度敏感的代码
- 考虑使用本地 LLM

### Q27: 如何保护敏感信息？

**A**: 
1. 使用 `.gitignore` 排除敏感文件
2. 使用环境变量
3. 不要在提示中包含密钥/密码
4. 使用 `redactSensitiveData()` 函数

### Q28: API 密钥安全吗？

**A**: 
- ✅ 存储在 `.env` 文件中（不提交到 Git）
- ✅ 只在本地使用
- ❌ 不要与他人分享
- ❌ 不要提交到版本控制

### Q29: CodeYang 是否收集遥测数据？

**A**: 不收集。CodeYang 是完全本地运行的工具。

### Q30: 发现安全漏洞怎么办？

**A**: 
1. **不要**公开披露
2. 发送邮件到安全团队
3. 提供详细信息
4. 等待响应和修复

参考 `SECURITY.md` 文件。

---

## 高级主题

### Q31: 如何自定义 CodeYang 的行为？

**A**: 
1. **环境变量** (`.env`)
2. **项目配置** (`CLAUDE.md`)
3. **Ponytail 模式**: `/ponytail on`
4. **自定义提示**

### Q32: 可以创建自定义工具吗？

**A**: 可以！参考 `src/tools/` 目录：
```typescript
export const MyTool = {
  name: 'MyTool',
  description: '我的自定义工具',
  execute: async (input) => {
    // 你的逻辑
    return result;
  },
};
```

### Q33: 如何集成 CI/CD？

**A**: CodeYang 可以在 CI 中使用：
```yaml
# .github/workflows/code-review.yml
- name: Code Review
  run: |
    echo "Review the changes" | npm start
```

### Q34: 支持多语言项目吗？

**A**: 是的，CodeYang 支持所有主流编程语言。它会自动检测项目语言并调整行为。

### Q35: 如何贡献到 CodeYang？

**A**: 
1. Fork 仓库
2. 创建功能分支
3. 提交更改
4. 创建 Pull Request
5. 参考 `CONTRIBUTING.md`

### Q36: Qt 项目支持有什么特别之处？

**A**: CodeYang 自动检测 Qt 项目并提供：
- Qt 特定工具（11 个）
- QML 支持
- Qt 5 → Qt 6 迁移助手
- Qt 知识库注入
- 构建和测试集成

### Q37: Reflexion 是什么？

**A**: Reflexion 是一个学习系统：
- 记录执行结果
- 分析失败模式
- 从错误中学习
- 改进未来决策

启用：
```
你: 启用 reflexion
你: 分析最近的失败
```

### Q38: 如何优化性能？

**A**: 
1. 使用更快的模型
2. 减小上下文窗口
3. 启用缓存
4. 批量处理任务
5. 使用本地 LLM

参考 `BEST_PRACTICES.md` 的性能部分。

### Q39: 可以在团队中使用吗？

**A**: 可以，建议：
- 统一代码规范（`CLAUDE.md`）
- 共享项目上下文
- 使用 Git 协作
- 定期同步记忆

### Q40: 路线图和未来计划？

**A**: 
- **当前**: v0.9.0 (Beta)
- **即将到来**: v1.0.0 (4-6 周)
- **计划**:
  - 更多语言支持
  - IDE 集成
  - 云端同步
  - 团队协作功能
  - 性能优化

查看 `ROADMAP_TO_V1.md` 了解详情。

---

## 更多帮助

### 找不到答案？

1. **查看文档**: 
   - `README.md`
   - `USER_GUIDE.md`
   - `BEST_PRACTICES.md`
   - API 文档 (`src/experimental/*/API.md`)

2. **搜索 Issues**: 
   - https://github.com/davidjlyoung1985-byte/codeyang/issues

3. **加入讨论**: 
   - https://github.com/davidjlyoung1985-byte/codeyang/discussions

4. **提出新问题**: 
   - 创建 GitHub Issue
   - 提供详细信息
   - 包含错误日志

---

## 贡献 FAQ

欢迎补充常见问题！如果你有：
- 未在此列出的问题
- 更好的答案
- 使用技巧

请提交 Pull Request 或创建 Issue。

---

**文档版本**: 1.0  
**最后更新**: 2026-09-12  
**问题总数**: 40+  
**持续更新中...**
