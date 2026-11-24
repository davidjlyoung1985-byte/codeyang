# CodeYang 工程现状

本文件是项目的**唯一**状态来源。所有数字均为可复现的实测值，不包含主观评分。

> 历史审计与改进报告已移至 [`docs/archive/`](./archive/)。其中的分数声明已过时，不再维护，也不代表当前状态。

---

## 如何自行复现

```bash
npm ci
npx tsc --noEmit            # 类型检查
npx eslint src/ --ext .ts   # 静态检查
npm test                    # 测试
npx vitest run --coverage   # 覆盖率
```

---

## 实测指标

| 指标 | 值 | 采集方式 |
|---|---|---|
| 版本 | 1.1.0 | `package.json` |
| 源文件（非测试） | 221 个 `.ts` | `src/` 递归统计 |
| 源码行数（非测试） | 43,147 行 | `src/` 递归统计 |
| 测试文件 | 145 个 | vitest 汇总 |
| 测试用例 | 2,796 通过 / 7 跳过 / 0 失败 | `npm test` |
| 测试耗时 | ~94 秒（`maxWorkers: 2`） | `npm test` |
| 语句覆盖率 | 78.1% | `vitest --coverage` |
| 分支覆盖率 | 79.1% | `vitest --coverage` |
| 函数覆盖率 | 85.4% | `vitest --coverage` |
| `tsc --noEmit` | 0 错误（strict 全开） | CI `lint` job |
| `eslint src/` | 0 错误 0 警告 | CI `lint` job |
| 模块目录 | 30 个 | `src/` 一级目录 |
| 内置工具 | 82 个 definition | `src/tools/definitions/` |

CI 在 3 OS × 3 Node 版本的矩阵上运行，测试失败即阻断合并（无重试绕过）。

---

## 分发形态

**CLI 产品 + 库入口。**

### 库形式（编程使用）

```ts
import { Agent, tools, isPrivateIP, envNames } from 'codeyang';
```

`package.json` 的 `main`/`types` 指向 `dist/lib.js` / `dist/lib.d.ts`，共 28 个导出，覆盖：

| 分类 | 导出 |
|---|---|
| Agent | `Agent`、`AgentCallbacks`、`createLLMClient` |
| 工具 | `tools`、`getTool`、`toolSchemas`、`ToolContext` |
| 安全 | `isPrivateIP`、`validateUrl`、`findPathViolations` |
| 权限 | `checkPermission` |
| 配置 | `getConfig`、`ENV_SPECS`、`envString`/`envInt`/`envBool`、`renderEnvHelp` |
| 错误 | `CodeYangError`、`ErrorCode` |

导入 `src/lib.ts` **无副作用**：不读 stdin、不起服务、不 spawn 进程。CLI 入口 `src/index.ts` 仍然零导出。

### 命令行形式

四个 bin 入口：

| 命令 | 入口 | 用途 |
|---|---|---|
| `codeyang` | `dist/index.js` | 交互式 / 一次性任务 |
| `codeyangx` | `dist/codeyangx.js` | 精简启动器 |
| `codeyang-web` | `dist/web-server.js` | Web 服务（前端为骨架） |
| `codeyang-setup` | `dist/setup-wizard.js` | 配置向导 |

**npm 发布状态：未发布。** `npm view codeyang` 返回 404。当前只能从源码构建使用。

---

## 已知短板（按影响排序）

| # | 问题 | 现状 |
|---|---|---|
| 1 | 未发布到 npm | 用户需自行 clone + build |
| 2 | 部分入口仍缺测试 | `bridge/server.ts` 约 4%；`sandbox/sandbox-runner.ts` 由 fork 子进程执行，v8 覆盖率不采集（已有 10 个真实 fork 测试） |
| 3 | 前端未完成 | `web/client` 仅 `App.tsx` 骨架；WPS 加载项与 VS Code 扩展为实验性 |
| 4 | 文档历史包袱 | `docs/archive/` 保留过程记录，不作为当前依据 |

---

## 适用判断

**适合：**
- 命令行环境下需要 AI 编码助手的个人与小团队
- 需要严格权限控制、审计日志、沙箱隔离的场景
- 想参考 AI Agent 工程实现（权限层、工具调度、上下文管理）

**不适合：**
- 需要以库形式嵌入自有服务的场景（暂无导出 API）
- 需要成熟 Web/IDE 图形界面的场景
- 需要长期 SLA 保证的生产关键系统

---

**最后更新**：与 `master` 分支 HEAD 同步。修改代码后请同步更新本文件的实测指标。
