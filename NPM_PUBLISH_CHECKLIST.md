# NPM 发布检查清单

## 发布前验证

### 1. 确认所有测试通过
```bash
npm test
```
✅ 应该显示：**3005 passed / 7 skipped / 0 failed**

### 2. 确认类型检查通过
```bash
npx tsc --noEmit
```
✅ 应该显示：**0 errors**

### 3. 确认代码质量检查
```bash
npm run lint
```
✅ 应该显示：**0 errors, 11 warnings (all in test files)**

### 4. 确认构建成功
```bash
npm run build
```
✅ 检查 `dist/` 目录是否包含编译后的文件

### 5. 验证打包内容
```bash
npm pack --dry-run
```
✅ 确认只包含必要的文件（dist/, docs/, README, LICENSE 等）
✅ 确认没有包含 src/, .github/, test files 等开发文件

---

## 发布步骤

### 首次发布（推荐使用 --dry-run 先测试）

```bash
# 1. 确保已登录 npm
npm whoami
# 如果未登录：npm login

# 2. 干运行（不实际发布，只检查）
npm publish --dry-run

# 3. 实际发布
npm publish

# 如果是 scoped package 且想公开发布
npm publish --access public
```

### 验证发布成功

```bash
# 检查 npm 上的包信息
npm view codeyang

# 尝试安装
npm install -g codeyang

# 验证命令可用
codeyang --version
```

---

## 发布后

### 1. 创建 Git Tag
```bash
git tag v2.0.1
git push origin v2.0.1
```

### 2. 创建 GitHub Release
在 GitHub 上基于 tag 创建 release，使用 `RELEASE_NOTES_v2.0.1.md` 的内容

### 3. 更新文档
- 在 README.md 中添加安装说明：`npm install -g codeyang`
- 更新 STATUS.md 中的"npm 发布状态"

---

## 常见问题

### 发布失败：403 Forbidden
- 确认已登录：`npm whoami`
- 确认包名未被占用：`npm view codeyang`
- 如果包名已存在但不是你的，需要改名或使用 scoped package：`@your-username/codeyang`

### 包名冲突
如果 `codeyang` 已被占用，考虑：
- 使用 scoped package：`@davidjlyoung1985-byte/codeyang`
- 更改包名（需同步更新 package.json 的 name 字段）

### 版本冲突
- 不能发布已存在的版本
- 使用 `npm version patch/minor/major` 自动更新版本号

---

## 当前状态

- ✅ 所有测试通过（3005 个）
- ✅ 类型检查通过
- ✅ Lint 检查通过（0 错误）
- ✅ 构建成功
- ✅ `.npmignore` 已配置
- ✅ `package.json` files 字段已配置
- ⏳ **待执行：npm publish**
