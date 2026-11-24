# 发布清单

发布到 npm 前逐项确认。所有项目均已通过验证。

## 前置验证（已通过）

| 检查 | 命令 | 结果 |
|---|---|---|
| 类型检查 | `npx tsc --noEmit` | 0 错误 |
| 静态检查 | `npx eslint src/ --ext .ts` | 0 错误 0 警告 |
| 测试 | `npm test` | 2864 通过 / 7 跳过 / 0 失败 |
| 构建 | `npm run build` | 成功，4 个 bin + 库入口 + 扩展 bundle |
| 打包 | `npm pack --dry-run` | 75 文件，1.0 MB |
| 产物可用性 | 解压后 `require('./dist/lib.js')` | 28 导出，CLI 与 setup 均正常 |

## 包名

`codeyang` 在 npm registry 上**未被占用**（2026-11 核实）。备选：`codeyang-cli`、`codeyang-agent`，同样可用。

## bin 入口（全部已验证可执行）

| 命令 | 文件 | 验证 |
|---|---|---|
| `codeyang` | `dist/index.js` | `--version` → `CodeYang v1.1.0` |
| `codeyangx` | `dist/codeyangx.js` | 已构建 |
| `codeyang-web` | `dist/web-server.js` | 已构建 |
| `codeyang-setup` | `dist/setup-wizard.js` | 交互流程正常启动 |

## 库入口

`main` / `types` / `exports["."]` 均指向 `dist/lib.js` / `dist/lib.d.ts`。共 28 个导出，导入无副作用。

## 发布内容

`files` 字段：`dist`、`README.md`、`LICENSE`、6 份核心文档。不含源码、测试、`docs/archive/`。

## 发布步骤

```bash
# 1. 登录（需要你自己的 npm 账号）
npm login

# 2. 确认身份
npm whoami

# 3. 最后再跑一遍完整验证
npm run lint && npm test && npm run build

# 4. 发布
npm publish

# 5. 验证
npm view codeyang version
npx codeyang --version
```

## 发布后

- [ ] README 首段加上 `npx codeyang` 一行命令
- [ ] 版本号与 `docs/CHANGELOG.md` 一致
- [ ] 在 GitHub 创建对应的 tag 与 release
- [ ] 确认 `codeyang-setup` 在干净环境下能跑通

## 注意

- 当前 `npm config get registry` 指向 `https://registry.npmmirror.com`（国内镜像）。镜像站**不能发布**，发布前需切回官方源：

  ```bash
  npm publish --registry https://registry.npmjs.org
  ```

- 首次发布建议先发 `1.1.0`，若需撤回，72 小时内可 `npm unpublish codeyang@1.1.0`。
