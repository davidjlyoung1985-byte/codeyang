# 依赖更新计划

**更新日期**: 2024-11-21  
**优先级**: 中  

---

## 📊 当前状态

### 过时依赖统计
- **总计**: 29 个过时依赖
- **Major 版本**: 8 个 (需谨慎)
- **Minor/Patch**: 21 个 (相对安全)

---

## 🚨 需要关注的依赖

### Major 版本更新（破坏性变更）

| 包名 | 当前 | 最新 | 风险 | 建议 |
|------|------|------|------|------|
| `@anthropic-ai/sdk` | 0.32.1 | 1.12.0 | **高** | 等待稳定后更新 |
| `@babel/parser` | 7.29.8 | 8.1.3 | 中 | 查看 changelog |
| `@babel/traverse` | 7.29.8 | 8.1.3 | 中 | 与 parser 同步更新 |
| `openai` | 6.49.0 | 7.62.0 | 中 | 查看 API 变化 |
| `typescript` | 5.9.3 | 7.0.2 | **高** | TS 7 还不稳定 |
| `react` | 18.3.1 | 19.3.1 | 中 | React 19 - 等待生态成熟 |
| `react-dom` | 18.3.1 | 19.3.1 | 中 | 与 react 同步 |
| `dotenv` | 17.4.2 | 18.0.10 | 低 | 配置工具，影响小 |

### Minor/Patch 版本更新（相对安全）

**可立即更新**:
```bash
npm update @modelcontextprotocol/sdk     # 1.30.0 → 1.32.2
npm update @typescript-eslint/eslint-plugin  # 8.70.0 → 8.73.0
npm update @typescript-eslint/parser     # 8.70.0 → 8.73.0
npm update axios                         # 1.20.0 → 1.21.1
npm update eslint                        # 10.10.0 → 10.15.0
npm update prettier                      # 3.9.6 → 3.10.1
npm update tsx                           # 4.23.13 → 4.23.15
```

---

## 🔍 esbuild Override 调查

**当前配置**:
```json
"overrides": {
  "esbuild": "^0.28.1"
}
```

**原因分析**:
- 可能是为了修复某个特定版本的 bug
- 或者解决依赖冲突

**行动**: 
- [ ] 检查 Git 历史，查找添加 override 的原因
- [ ] 尝试移除 override，运行测试
- [ ] 如果测试通过，可以移除

---

## 📋 更新策略

### 第一阶段：安全更新（立即执行）

更新 Minor/Patch 版本，风险低：

```bash
npm update @modelcontextprotocol/sdk
npm update @typescript-eslint/eslint-plugin
npm update @typescript-eslint/parser
npm update @vitejs/plugin-react
npm update axios
npm update eslint
npm update prettier
npm update tsx
npm update fast-xml-parser
npm update csv-parse
npm update csv-stringify
npm update lint-staged
npm update acorn
```

**预期影响**: 无破坏性变更，主要是 bug 修复和小改进

### 第二阶段：谨慎更新（1-2周后）

测试后更新有小风险的依赖：

```bash
npm update @babel/parser
npm update @babel/traverse
npm update dotenv
npm update concurrently
```

**操作步骤**:
1. 单独更新
2. 运行完整测试套件
3. 检查 breaking changes
4. 提交前回归测试

### 第三阶段：Major 版本（2-4周后）

**延迟更新的原因**:

1. **`@anthropic-ai/sdk` (0.32 → 1.12)**
   - Major 版本跳跃，可能有 API 变化
   - 建议：查看 [changelog](https://github.com/anthropics/anthropic-sdk-typescript/releases)
   - 风险：核心依赖，影响大

2. **`openai` (6.49 → 7.62)**
   - OpenAI SDK v7 有 API 变化
   - 建议：阅读迁移指南
   - 风险：如果项目大量使用 OpenAI

3. **`typescript` (5.9 → 7.0)**
   - **不推荐**：TypeScript 7 还在早期
   - 建议：等待稳定版或至少 7.1
   - 风险：可能破坏现有类型

4. **`react` + `react-dom` (18 → 19)**
   - React 19 刚发布
   - 建议：等待生态（如 testing-library）跟上
   - 风险：仅影响 Web 控制台

5. **`execa` (9.6 → 10.2)**
   - ESM-only 可能有变化
   - 检查兼容性

6. **`minimatch` (10.2 → 11.0)**
   - Glob 匹配库，影响文件搜索

---

## 🛡️ 安全审计

**当前问题**: npm audit 使用国内镜像，无法访问

**解决方案**:
```bash
# 临时使用官方源进行审计
npm audit --registry=https://registry.npmjs.org/

# 或使用 GitHub Dependabot
# 已配置在 .github/dependabot.yml
```

---

## ✅ 执行检查清单

### 更新前
- [ ] 确保所有测试通过
- [ ] 创建新分支 `chore/dependency-updates`
- [ ] 备份 package-lock.json

### 更新中
- [ ] 执行第一阶段更新
- [ ] 运行 `npm test`
- [ ] 运行 `npm run lint`
- [ ] 运行 `npm run build`
- [ ] 手动测试关键功能

### 更新后
- [ ] 提交更新
- [ ] 运行 CI 测试
- [ ] 更新此文档
- [ ] 关闭相关 Issue

---

## 📝 更新日志

| 日期 | 包名 | 版本变化 | 结果 |
|------|------|----------|------|
| TBD | - | - | - |

---

## 🔗 相关资源

- [npm outdated 文档](https://docs.npmjs.com/cli/v10/commands/npm-outdated)
- [npm audit 文档](https://docs.npmjs.com/cli/v10/commands/npm-audit)
- [Dependabot 配置](./.github/dependabot.yml)

---

**负责人**: 开发团队  
**审核频率**: 每月检查一次  
**紧急更新**: 发现安全漏洞时立即处理
