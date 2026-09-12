# CodeYang 用户指南

**版本**: v0.9.0  
**更新时间**: 2026-09-12  
**面向用户**: 开发者、团队

---

## 📚 目录

1. [快速开始](#快速开始)
2. [基础使用](#基础使用)
3. [高级功能](#高级功能)
4. [最佳实践](#最佳实践)
5. [常见问题](#常见问题)
6. [故障排除](#故障排除)

---

## 快速开始

### 安装

```bash
# 克隆仓库
git clone https://github.com/davidjlyoung1985-byte/codeyang.git
cd codeyang

# 安装依赖
npm install

# 配置 API 密钥
cp .env.example .env
# 编辑 .env 文件，添加你的 API 密钥
```

### 配置

在 `.env` 文件中设置以下环境变量：

```bash
# 必需
CODEYANG_API_KEY=your-api-key-here

# 可选
CODEYANG_MODEL=deepseek-chat           # 模型名称
CODEYANG_BASE_URL=https://api.deepseek.com/v1  # API 端点
CODEYANG_MAX_TOKENS=32000              # 最大 token 数
```

### 第一次运行

```bash
# 启动 CodeYang
npm start

# 或者使用开发模式
npm run dev
```

---

## 基础使用

### 1. 基本对话

```
你: 帮我创建一个简单的 HTTP 服务器
```

CodeYang 会：
1. 分析你的需求
2. 选择合适的工具
3. 编写代码
4. 验证结果

### 2. 文件操作

#### 读取文件
```
你: 读取 src/index.ts 并解释它的功能
```

#### 编辑文件
```
你: 在 package.json 中添加一个新的脚本 "test:watch"
```

#### 创建文件
```
你: 创建一个新的 README.md 文件，包含项目介绍
```

### 3. Git 操作

```
你: 查看 git 状态
你: 提交所有更改，消息为 "feat: add new feature"
你: 创建新分支 feature/new-feature
```

### 4. 运行命令

```
你: 运行测试
你: 安装 lodash 包
你: 构建项目
```

---

## 高级功能

### 1. 多文件重构

```
你: 重构 src/utils/ 目录下的所有文件，使用 ES6 语法
```

CodeYang 会：
- 读取所有相关文件
- 分析代码结构
- 逐个文件进行重构
- 运行测试验证

### 2. 代码审查

```
你: 审查 src/api/ 目录的代码质量
```

CodeYang 会检查：
- 代码风格
- 潜在 bug
- 性能问题
- 安全隐患
- 最佳实践

### 3. 测试生成

```
你: 为 src/utils/validation.ts 生成单元测试
```

CodeYang 会：
- 分析函数签名
- 识别边界情况
- 生成测试用例
- 使用项目的测试框架

### 4. 文档生成

```
你: 为 src/api/ 目录生成 API 文档
```

### 5. 使用实验性功能

#### Qt 项目支持

```
你: 这是一个 Qt 项目吗？
```

如果是 Qt 项目，CodeYang 会自动：
- 检测 Qt 版本
- 加载 Qt 工具
- 提供 Qt 特定建议

```
你: 帮我创建一个 QML 组件
你: 检查 Qt 6 兼容性
```

#### Reflexion - 从错误中学习

```
你: 启用 reflexion 模式
你: 分析最近的失败并学习
```

#### 持续学习

CodeYang 每 10 次迭代自动：
- 分类记忆
- 压缩旧记忆
- 清理过期记忆

---

## 最佳实践

### 1. 清晰的需求描述

❌ **不好的例子**:
```
你: 改进代码
```

✅ **好的例子**:
```
你: 重构 src/utils/parser.ts 中的 parseData 函数，
    使用更清晰的变量名和更好的错误处理
```

### 2. 逐步进行复杂任务

❌ **不好的例子**:
```
你: 创建完整的用户认证系统，包括注册、登录、密码重置、
    邮件验证、JWT、权限管理、数据库迁移、测试和文档
```

✅ **好的例子**:
```
你: 第一步：创建用户模型和数据库 schema
# 完成后
你: 第二步：实现注册和登录 API
# 完成后
你: 第三步：添加 JWT 认证
```

### 3. 验证和测试

每次重要更改后：
```
你: 运行测试确保没有破坏现有功能
你: 运行 linter 检查代码风格
```

### 4. 使用项目上下文

在项目根目录创建 `CLAUDE.md`：

```markdown
# 项目上下文

## 技术栈
- Node.js 18+
- TypeScript 5.0
- Vitest (测试框架)
- ESLint + Prettier

## 代码规范
- 使用 ES6+ 语法
- 函数名使用 camelCase
- 类名使用 PascalCase
- 优先使用 async/await 而非 Promise

## 禁止事项
- 不要使用 any 类型
- 不要使用 var
- 不要修改 .env.example
```

### 5. 安全考虑

在处理敏感操作时明确说明：

```
你: 创建一个 API 端点处理用户密码重置。
    注意：
    1. 密码必须加密存储
    2. 使用安全的令牌
    3. 添加速率限制
    4. 记录所有密码重置尝试
```

### 6. 版本控制最佳实践

```
# 频繁提交
你: 每完成一个小功能就提交一次

# 使用有意义的提交消息
你: 使用 conventional commits 格式提交

# 创建功能分支
你: 为每个新功能创建独立分支
```

---

## 常见问题

### Q1: CodeYang 可以访问互联网吗？

**A**: 可以，通过 `WebSearch` 和 `WebFetch` 工具。但有安全限制：
- 不能访问 localhost
- 不能访问内网 IP
- 只支持 HTTP/HTTPS

### Q2: 如何让 CodeYang 记住项目特定信息？

**A**: 使用记忆系统：

```
你: 记住：这个项目使用自定义的日志格式，
    总是使用 logger.info() 而不是 console.log()
```

### Q3: CodeYang 会自动保存我的会话吗？

**A**: 会的，会话每 10 分钟自动保存一次。你也可以：

```
你: /sessions    # 查看所有会话
你: /tag work-session  # 标记当前会话
```

### Q4: 如何恢复之前的会话？

```
你: /sessions    # 列出所有会话
你: /load <session-id>  # 加载指定会话
```

### Q5: CodeYang 支持哪些编程语言？

**A**: 支持所有主流编程语言：
- JavaScript/TypeScript
- Python
- Java
- C/C++
- Go
- Rust
- Ruby
- PHP
- 等等

对 Qt/QML 有特别支持。

### Q6: 如何处理大型代码库？

**A**: CodeYang 有多种策略：
- 上下文总结
- 选择性文件读取
- 分批处理
- 使用搜索工具定位代码

```
你: 在项目中搜索所有使用 deprecated API 的地方
你: 只读取 src/api/ 目录下的文件
```

### Q7: 性能问题怎么办？

**A**: 
1. 减少上下文大小：
   ```
   你: /clear  # 清除当前会话
   ```

2. 使用更精确的请求：
   ```
   你: 只修改 src/index.ts 的第 42 行
   ```

3. 批量操作分批进行

### Q8: 如何自定义 CodeYang 的行为？

**A**: 通过配置文件和提示：

1. **环境变量** (`.env`)
2. **项目上下文** (`CLAUDE.md`)
3. **Ponytail 模式** - 简洁代码风格
   ```
   你: /ponytail on
   ```

---

## 故障排除

### 问题 1: API 错误

**症状**: `API request failed: 401 Unauthorized`

**解决方案**:
1. 检查 `.env` 文件中的 API 密钥
2. 确认 API 密钥有效且有足够余额
3. 检查网络连接

### 问题 2: 测试失败

**症状**: 运行测试时失败

**解决方案**:
```bash
# 清理并重新安装依赖
rm -rf node_modules package-lock.json
npm install

# 清理测试缓存
npm run test:clean

# 重新运行测试
npm test
```

### 问题 3: 内存不足

**症状**: `JavaScript heap out of memory`

**解决方案**:
```bash
# 增加 Node.js 内存限制
export NODE_OPTIONS="--max-old-space-size=4096"
npm start
```

### 问题 4: 文件权限错误

**症状**: `EACCES: permission denied`

**解决方案**:
```bash
# 检查文件权限
ls -la

# 修复权限
chmod +x file.sh
```

### 问题 5: Git 冲突

**症状**: Git 合并冲突

**解决方案**:
```
你: 查看 git 状态
你: 显示冲突的文件
你: 帮我解决 src/index.ts 中的冲突
```

### 问题 6: 依赖版本冲突

**症状**: `npm install` 失败

**解决方案**:
```bash
# 使用 --legacy-peer-deps
npm install --legacy-peer-deps

# 或更新依赖
npm update
```

### 问题 7: 端口已被占用

**症状**: `Error: listen EADDRINUSE: address already in use`

**解决方案**:
```bash
# 查找占用端口的进程
lsof -i :3000

# 终止进程
kill -9 <PID>
```

---

## 获取帮助

### 命令参考

```
/help         # 显示所有命令
/tools        # 列出可用工具
/status       # 显示系统状态
/config       # 显示当前配置
```

### 社区支持

- **GitHub Issues**: https://github.com/davidjlyoung1985-byte/codeyang/issues
- **Discussions**: https://github.com/davidjlyoung1985-byte/codeyang/discussions

### 文档

- **API 文档**: 查看 `src/experimental/*/API.md`
- **架构文档**: 查看 `docs/architecture.md`
- **贡献指南**: 查看 `CONTRIBUTING.md`

---

## 进阶主题

### 1. 自定义工具

创建自定义工具扩展 CodeYang 功能。

### 2. 集成 CI/CD

将 CodeYang 集成到你的 CI/CD 流程中。

### 3. 团队协作

多人团队如何使用 CodeYang。

### 4. 性能优化

优化 CodeYang 在大型项目中的性能。

---

## 更新日志

查看 `CHANGELOG.md` 了解最新变化。

---

## 反馈

我们重视你的反馈！如果你有：
- 功能请求
- Bug 报告
- 改进建议
- 使用案例

请访问我们的 [GitHub 仓库](https://github.com/davidjlyoung1985-byte/codeyang)。

---

**文档版本**: 1.0  
**最后更新**: 2026-09-12  
**适用版本**: CodeYang v0.9.0+
