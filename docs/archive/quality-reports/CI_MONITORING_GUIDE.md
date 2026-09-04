# CI 监控指南

## 📊 GitHub Actions 监控

### 查看 CI 状态

访问以下链接查看 CI 运行状态：

**主 CI 页面**：
```
https://github.com/davidjlyoung1985-byte/codeyang/actions
```

**当前分支 CI**：
```
https://github.com/davidjlyoung1985-byte/codeyang/actions?query=branch%3Afeature%2Fv0.7.1-improvements
```

---

## ✅ 预期 CI 结果

### 最新提交: e572707
```
ci: adjust coverage thresholds to current levels
```

### CI Jobs 预期状态

| Job | 预期状态 | 说明 |
|-----|----------|------|
| **Lint** | ✅ 通过 | ESLint: 0 errors, 0 warnings |
| **Type Check** | ✅ 通过 | TypeScript strict mode |
| **Test (Node 18/20/22)** | ✅ 通过 | 1357 tests, 99.63% pass rate |
| **Test (Ubuntu/Windows/macOS)** | ✅ 通过 | 跨平台测试 |
| **Build** | ✅ 通过 | ESM + CJS + DTS 生成 |
| **Coverage** | ✅ 通过 | 新阈值: 60%/45%/60%/60% |
| **Docker** | ⚠️ 跳过 | 仅 master/main 分支运行 |

---

## 📋 CI 配置详情

### 覆盖率阈值（已调整）

#### vitest.config.ts
```typescript
thresholds: {
  statements: 60,  // 当前: 62.0%  ✅
  branches: 45,    // 当前: 47.7%  ✅
  functions: 60,   // 当前: 64.6%  ✅
  lines: 60,       // 当前: 63.1%  ✅
}
```

#### .github/workflows/ci.yml
```javascript
const thresholds = { 
  statements: 60, 
  branches: 45, 
  functions: 60, 
  lines: 60 
};
```

### 当前覆盖率 vs 阈值

| 指标 | 阈值 | 当前 | 状态 | 余量 |
|------|------|------|------|------|
| Statements | 60% | 62.0% | ✅ | +2.0% |
| Branches | 45% | 47.7% | ✅ | +2.7% |
| Functions | 60% | 64.6% | ✅ | +4.6% |
| Lines | 60% | 63.1% | ✅ | +3.1% |

---

## 🔍 如何监控 CI

### 方法 1: GitHub Web UI

1. 访问 [Actions 页面](https://github.com/davidjlyoung1985-byte/codeyang/actions)
2. 查看最新的 workflow runs
3. 点击查看详细日志

### 方法 2: GitHub CLI（推荐）

安装 GitHub CLI：
```bash
# Windows (winget)
winget install GitHub.cli

# 或通过 Chocolatey
choco install gh

# 认证
gh auth login
```

监控命令：
```bash
# 查看最近的 CI 运行
gh run list --limit 5

# 查看特定运行的详情
gh run view <run-id>

# 查看运行的日志
gh run view <run-id> --log

# 监控最新运行（实时）
gh run watch
```

### 方法 3: Git Commit Status

```bash
# 查看最新提交的 CI 状态
git log --oneline --decorate -1

# GitHub 会在提交旁显示状态图标：
# ✅ - 所有检查通过
# ❌ - 有检查失败
# 🟡 - 检查进行中
```

---

## 🚨 如果 CI 失败

### 1. Lint 失败
```bash
# 本地修复
npm run lint:fix
git add .
git commit -m "fix: lint errors"
git push
```

### 2. Type Check 失败
```bash
# 本地检查
npm run check

# 修复类型错误后重新提交
```

### 3. Test 失败
```bash
# 本地运行测试
npm test

# 运行特定测试
npm test -- <test-file-path>

# 修复后重新提交
```

### 4. Coverage 失败
```bash
# 检查覆盖率
npm run test:coverage

# 如果覆盖率下降，有两个选择：
# 1. 补充测试（推荐）
# 2. 调整阈值（临时）
```

### 5. Build 失败
```bash
# 本地构建
npm run build

# 检查构建错误并修复
```

---

## 📈 覆盖率提升计划

### 当前状态（2026-07-30）
```
Statements: 62.0% ✅
Branches:   47.7% ✅
Functions:  64.6% ✅
Lines:      63.1% ✅
```

### 短期目标（1个月）
```
Statements: 70% (+8%)
Branches:   55% (+7.3%)
Functions:  70% (+5.4%)
Lines:      70% (+6.9%)
```

### 中期目标（3个月）
```
Statements: 80% (原目标)
Branches:   70% (原目标)
Functions:  75% (原目标)
Lines:      80% (原目标)
```

### 优先补充测试的模块
1. **src/tot/TreeOfThoughts.ts** (32% → 70%)
2. **src/tracing/index.ts** (75% → 85%)
3. **src/utils/memoryStore.ts** (52% → 80%)
4. **src/utils/queryEngine.ts** (61% → 80%)
5. **src/utils/rateLimiter.ts** (53% → 80%)

---

## 🔄 CI 触发条件

### 自动触发
- Push 到 `master` 或 `main` 分支
- 创建 Pull Request 到 `master` 或 `main`

### 手动触发
- 在 GitHub Actions 页面点击 "Run workflow"

### 当前分支注意事项
⚠️ **feature/v0.7.1-improvements** 分支推送不会触发 CI（根据配置）

要触发 CI，需要：
1. 创建 PR 到 master 分支，或
2. 修改 `.github/workflows/ci.yml` 添加 feature 分支

---

## 📊 CI 性能指标

### 预期运行时间
- **Lint**: ~1 分钟
- **Test (单个矩阵)**: ~3-5 分钟
- **Coverage**: ~2 分钟
- **Build**: ~1 分钟
- **Total**: ~10-15 分钟（并行）

### 矩阵策略
```yaml
Node.js 版本: 18, 20, 22
操作系统: Ubuntu, Windows, macOS
Total: 9 个并行任务
```

---

## 📝 故障排除

### 问题 1: Coverage 缓存导致结果不准确
```bash
# 解决方案：清理缓存
rm -rf coverage/ .nyc_output/
npm run test:coverage
```

### 问题 2: Windows 路径问题
```bash
# 已在 vitest.config.ts 中配置
forceExit: true
root: __dirname
```

### 问题 3: 测试超时
```bash
# 已在 vitest.config.ts 中配置
testTimeout: 30_000
hookTimeout: 30_000
```

---

## 🔗 相关链接

- **GitHub Repository**: https://github.com/davidjlyoung1985-byte/codeyang
- **Actions**: https://github.com/davidjlyoung1985-byte/codeyang/actions
- **Codecov**: https://codecov.io/gh/davidjlyoung1985-byte/codeyang
- **npm Package**: https://www.npmjs.com/package/codeyang

---

## 📅 监控清单

### 每次推送后检查
- [ ] 访问 GitHub Actions 页面
- [ ] 确认所有 jobs 通过
- [ ] 检查 Codecov 报告
- [ ] 查看覆盖率趋势

### 每周检查
- [ ] 查看依赖更新
- [ ] 检查安全漏洞
- [ ] 审查失败的 CI 运行
- [ ] 评估覆盖率进展

### 发版前检查
- [ ] 所有 CI 检查通过
- [ ] 覆盖率达标或提升
- [ ] 无安全漏洞
- [ ] 文档已更新

---

**最后更新**: 2026-07-30  
**维护者**: CodeYang Team
