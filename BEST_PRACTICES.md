# CodeYang 最佳实践指南

**版本**: 1.0  
**更新时间**: 2026-09-12

---

## 📋 目录

1. [代码质量最佳实践](#代码质量最佳实践)
2. [安全最佳实践](#安全最佳实践)
3. [性能最佳实践](#性能最佳实践)
4. [团队协作最佳实践](#团队协作最佳实践)
5. [工作流最佳实践](#工作流最佳实践)

---

## 代码质量最佳实践

### 1. 测试驱动开发 (TDD)

**推荐做法**:
```
你: 我需要创建一个用户验证函数。先写测试。
# CodeYang 创建测试
你: 现在实现这个函数使测试通过。
```

**好处**:
- ✅ 更清晰的需求定义
- ✅ 更高的测试覆盖率
- ✅ 更少的 bug

### 2. 代码审查流程

**每次重要更改后**:
```
你: 审查刚才的更改，检查：
    1. 代码风格是否一致
    2. 是否有潜在 bug
    3. 是否有性能问题
    4. 是否有安全隐患
```

### 3. 持续集成

**建议工作流**:
1. 本地开发
2. 运行测试: `你: 运行所有测试`
3. 代码审查: `你: 审查更改`
4. 提交: `你: 提交更改，消息为 "feat: add feature"`
5. 推送前再次测试

### 4. 文档先行

**创建新功能时**:
```
你: 先创建 API 文档，描述新功能的接口
# 审查并确认文档
你: 根据文档实现功能
你: 为文档中的每个 API 编写测试
```

### 5. 重构策略

**安全重构的步骤**:
```
你: 第一步：为要重构的代码添加测试（如果没有）
# 确认测试通过
你: 第二步：进行重构
# 运行测试
你: 第三步：确认所有测试仍然通过
```

---

## 安全最佳实践

### 1. 输入验证

**始终验证用户输入**:
```typescript
// ✅ 好的做法
import { validateFilePath, validateUrl } from './utils/inputValidation.js';

function readUserFile(path: string) {
  if (!validateFilePath(path)) {
    throw new Error('Invalid file path');
  }
  return fs.readFileSync(path);
}

// ❌ 不好的做法
function readUserFile(path: string) {
  return fs.readFileSync(path); // 路径遍历风险
}
```

### 2. 敏感数据保护

**不要在日志中记录敏感信息**:
```typescript
// ✅ 好的做法
import { redactSensitiveData } from './utils/inputValidation.js';

logger.info('User login', redactSensitiveData({
  username: 'john',
  password: 'secret123', // 会被遮蔽
}));

// ❌ 不好的做法
logger.info('User login', { username, password }); // 密码泄露
```

### 3. API 密钥管理

**使用环境变量**:
```bash
# ✅ 好的做法
# .env
API_KEY=your-secret-key

# ❌ 不好的做法
# 直接在代码中
const apiKey = 'sk-1234567890abcdef';
```

**不要提交 .env**:
```bash
# .gitignore
.env
.env.local
```

### 4. HTTPS 和安全通信

```typescript
// ✅ 好的做法
const url = 'https://api.example.com'; // 使用 HTTPS

// ❌ 不好的做法
const url = 'http://api.example.com'; // 不安全
```

### 5. 依赖安全

**定期审计依赖**:
```bash
# 每周运行
npm audit

# 修复漏洞
npm audit fix

# 检查过期依赖
npm outdated
```

### 6. 最小权限原则

```typescript
// ✅ 好的做法
// 只读取需要的文件
const config = readFile('config.json');

// ❌ 不好的做法
// 给予过多权限
const allFiles = readDir('/');
```

---

## 性能最佳实践

### 1. 缓存策略

**使用 LRU 缓存**:
```typescript
import { LRUCache } from './utils/lruCache.js';

const cache = new LRUCache(100); // 最多 100 项

function expensiveOperation(key: string) {
  const cached = cache.get(key);
  if (cached) return cached;
  
  const result = doExpensiveWork(key);
  cache.set(key, result);
  return result;
}
```

### 2. 异步操作

**并行执行独立任务**:
```typescript
// ✅ 好的做法 - 并行
const [user, posts, comments] = await Promise.all([
  fetchUser(id),
  fetchPosts(id),
  fetchComments(id),
]);

// ❌ 不好的做法 - 串行
const user = await fetchUser(id);
const posts = await fetchPosts(id);
const comments = await fetchComments(id);
```

### 3. 内存管理

**避免内存泄漏**:
```typescript
// ✅ 好的做法
class EventEmitter {
  listeners = new WeakMap(); // 自动垃圾回收
}

// ❌ 不好的做法
const globalCache = {}; // 永不释放
```

### 4. 批量操作

**批量处理数据**:
```typescript
// ✅ 好的做法
const results = await Promise.all(
  items.slice(0, 10).map(processItem)
);

// ❌ 不好的做法
for (const item of thousandsOfItems) {
  await processItem(item); // 串行，很慢
}
```

### 5. 懒加载

**按需加载模块**:
```typescript
// ✅ 好的做法
async function handleQt() {
  const qt = await import('./experimental/qt/index.js');
  return qt.detectQtProject();
}

// ❌ 不好的做法
import * as qt from './experimental/qt/index.js'; // 总是加载
```

---

## 团队协作最佳实践

### 1. 代码规范

**使用统一的代码风格**:
```bash
# 安装工具
npm install -D eslint prettier

# 运行检查
npm run lint
npm run format
```

**在 CLAUDE.md 中定义规范**:
```markdown
# 代码规范

- 使用 2 空格缩进
- 使用单引号
- 每行最多 100 字符
- 函数名使用 camelCase
- 类名使用 PascalCase
```

### 2. 提交规范

**使用 Conventional Commits**:
```bash
feat: 添加新功能
fix: 修复 bug
docs: 更新文档
style: 代码格式化
refactor: 重构代码
test: 添加测试
chore: 构建/工具变更
```

### 3. 分支策略

**Git Flow 工作流**:
```
main          # 生产分支
  └─ develop  # 开发分支
      ├─ feature/user-auth    # 功能分支
      ├─ feature/api-v2
      └─ bugfix/login-error   # 修复分支
```

**示例**:
```
你: 创建新分支 feature/user-profile
你: 实现用户个人资料功能
你: 提交所有更改
你: 切换回 develop 分支
你: 合并 feature/user-profile
```

### 4. 代码审查清单

在合并前检查：
- [ ] 所有测试通过
- [ ] 代码覆盖率没有下降
- [ ] 没有 linter 警告
- [ ] 文档已更新
- [ ] 没有遗留的 TODO 或 console.log
- [ ] 性能没有显著下降

### 5. 文档维护

**保持文档同步**:
```
你: 每次 API 变更后，同时更新：
    1. API 文档
    2. README.md
    3. 变更日志
    4. 类型定义
```

---

## 工作流最佳实践

### 1. 晨间启动流程

```
你: 拉取最新代码
你: 安装新的依赖（如果有）
你: 运行测试确保环境正常
你: 查看今天的任务列表
```

### 2. 功能开发流程

**完整的功能开发周期**:

```
# 1. 规划
你: 创建功能设计文档 docs/features/user-auth.md

# 2. 分支
你: 创建分支 feature/user-auth

# 3. 测试先行
你: 为用户认证创建测试文件

# 4. 实现
你: 实现用户认证功能

# 5. 验证
你: 运行所有测试
你: 运行 linter
你: 手动测试功能

# 6. 文档
你: 更新 API 文档
你: 添加使用示例

# 7. 代码审查
你: 审查代码质量

# 8. 提交
你: 提交所有更改，消息为 "feat: implement user authentication"

# 9. 合并
你: 切换到 develop
你: 合并 feature/user-auth
你: 删除功能分支
```

### 3. Bug 修复流程

```
# 1. 重现
你: 创建最小可复现示例

# 2. 测试
你: 为 bug 创建失败测试

# 3. 修复
你: 修复 bug 使测试通过

# 4. 验证
你: 运行所有测试
你: 手动验证修复

# 5. 回归测试
你: 运行相关功能的所有测试

# 6. 文档
你: 在 CHANGELOG.md 中记录修复

# 7. 提交
你: 提交，消息为 "fix: resolve login issue #123"
```

### 4. 重构流程

```
# 1. 评估
你: 分析需要重构的代码
你: 列出重构目标

# 2. 测试覆盖
你: 确保重构区域有足够测试覆盖

# 3. 小步重构
你: 进行小范围重构
你: 运行测试
你: 提交

# 重复步骤 3 直到完成

# 4. 最终验证
你: 运行完整测试套件
你: 性能测试
你: 代码审查
```

### 5. 发布流程

```
# 1. 准备
你: 检查所有测试通过
你: 更新版本号
你: 更新 CHANGELOG.md

# 2. 标记
你: 创建 git tag v1.0.0
你: 推送 tag

# 3. 构建
你: 运行生产构建
你: 运行安全审计

# 4. 发布
你: 发布到 npm（如果适用）
你: 创建 GitHub release

# 5. 通知
你: 发布公告
你: 更新文档网站
```

---

## 项目维护最佳实践

### 1. 定期维护任务

**每周**:
- [ ] 运行 `npm audit`
- [ ] 检查依赖更新 `npm outdated`
- [ ] 审查未解决的 issues
- [ ] 清理过期分支

**每月**:
- [ ] 更新主要依赖
- [ ] 审查测试覆盖率
- [ ] 性能分析
- [ ] 代码质量审查

**每季度**:
- [ ] 技术债务清理
- [ ] 架构审查
- [ ] 文档完整性检查
- [ ] 安全审计

### 2. 监控和日志

**使用结构化日志**:
```typescript
logger.info('User action', {
  userId: user.id,
  action: 'login',
  timestamp: Date.now(),
  ip: req.ip,
});
```

**设置告警**:
- 错误率超过阈值
- 响应时间超过阈值
- CPU/内存使用异常

### 3. 备份策略

- 代码: Git + GitHub
- 数据库: 每日备份
- 配置: 版本控制
- 文档: Git + 定期导出

---

## 常见陷阱及避免方法

### 1. 过度工程

❌ **错误做法**:
```typescript
// 为只有 3 个配置项的项目创建复杂的配置系统
class ConfigManager {
  private cache: LRUCache;
  private validator: ConfigValidator;
  private loader: ConfigLoader;
  // ... 500 行代码
}
```

✅ **正确做法**:
```typescript
// 简单的配置对象
const config = {
  port: 3000,
  apiKey: process.env.API_KEY,
  debug: process.env.NODE_ENV === 'development',
};
```

### 2. 过早优化

❌ **错误做法**:
```typescript
// 在没有性能问题时就引入复杂的缓存
const cache = new Redis({ /* ... */ });
```

✅ **正确做法**:
```typescript
// 先实现功能，然后测量性能，再优化
function getUser(id) {
  return database.findById(id);
}
```

### 3. 忽略错误处理

❌ **错误做法**:
```typescript
const data = JSON.parse(input); // 可能抛出异常
```

✅ **正确做法**:
```typescript
try {
  const data = JSON.parse(input);
  return data;
} catch (error) {
  logger.error('JSON parse failed', { input, error });
  throw new ValidationError('Invalid JSON input');
}
```

### 4. 全局状态

❌ **错误做法**:
```typescript
let currentUser; // 全局变量

function login(user) {
  currentUser = user; // 多个请求会互相干扰
}
```

✅ **正确做法**:
```typescript
class Session {
  constructor(private user: User) {}
  
  getUser() {
    return this.user;
  }
}
```

### 5. 巨大的函数

❌ **错误做法**:
```typescript
function processUser(user) {
  // 200 行代码做各种事情
}
```

✅ **正确做法**:
```typescript
function processUser(user) {
  validateUser(user);
  normalizeUser(user);
  saveUser(user);
  sendWelcomeEmail(user);
}
```

---

## 性能优化检查清单

### 前端性能
- [ ] 压缩资源 (gzip/brotli)
- [ ] 懒加载图片和组件
- [ ] 使用 CDN
- [ ] 缓存静态资源
- [ ] 代码分割

### 后端性能
- [ ] 数据库索引优化
- [ ] 查询优化
- [ ] 使用连接池
- [ ] 实现缓存策略
- [ ] 异步处理长任务

### 通用优化
- [ ] 减少网络请求
- [ ] 使用批量操作
- [ ] 实现分页
- [ ] 压缩数据传输
- [ ] 监控和分析

---

## 总结

遵循这些最佳实践将帮助你：
- ✅ 编写更高质量的代码
- ✅ 提高开发效率
- ✅ 减少 bug 和安全问题
- ✅ 改善团队协作
- ✅ 保持项目健康

记住：**最佳实践是指导，不是教条。根据项目实际情况灵活应用。**

---

**文档版本**: 1.0  
**最后更新**: 2026-09-12  
**维护者**: CodeYang Team
