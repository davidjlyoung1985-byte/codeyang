# CodeYang v1.0.0 发布检查清单

## 代码质量

### 测试覆盖率
- [ ] 核心模块覆盖率 ≥ 85%
  - [ ] `src/agent/` ≥ 85%
  - [ ] `src/tools/` ≥ 85%
  - [ ] `src/security/` ≥ 85%
  - [ ] `src/mcp/` ≥ 85%
  - [ ] `src/sandbox/` ≥ 85%
- [ ] 实验模块覆盖率 ≥ 60%
  - [ ] `src/qt/` ≥ 60% (当前 ~40%)
  - [ ] `src/experimental/reflexion/` ≥ 60% (当前 ~58%)
  - [ ] `src/experimental/continual-learning/` ≥ 60% (当前 ~58%)
- [ ] 整体覆盖率 ≥ 80%
  - [ ] statements ≥ 80%
  - [ ] branches ≥ 81%
  - [ ] functions ≥ 87%
  - [ ] lines ≥ 80%

### 测试稳定性
- [ ] 所有测试在 Linux 上 100% 通过（连续 10 次运行）
- [ ] 所有测试在 macOS 上 100% 通过（连续 10 次运行）
- [ ] 所有测试在 Windows 上 100% 通过（连续 10 次运行）
- [ ] 并行测试无超时（maxWorkers: 4）
- [ ] Windows Git 操作超时问题已修复

### 代码质量检查
- [ ] `npm run check` (tsc --noEmit) 通过
- [ ] `npm run lint` 无错误
- [ ] `npm run format:check` 通过
- [ ] `npm audit --audit-level=high` 无高危漏洞

## 文档完善

### 一致性检查
- [x] 工具数量统一为 "60+ core tools"
  - [x] README.md
  - [x] package.json
  - [x] 所有相关文档
- [ ] 版本号在所有文件中一致
  - [ ] package.json
  - [ ] CHANGELOG.md
  - [ ] README.md

### 文档完整性
- [ ] README.md 包含差异化价值说明
- [ ] CONTRIBUTING.md 欢迎原创功能贡献
- [ ] CHANGELOG.md 包含 v1.0.0 所有变更
- [ ] API 文档完整（至少核心模块）
- [ ] 所有示例代码可运行
- [ ] 故障排查文档覆盖常见问题

## 功能完整性

### 核心功能
- [ ] 60+ 核心工具全部正常工作
- [ ] MCP 集成稳定
- [ ] 多 LLM 提供商支持（Claude, DeepSeek, OpenAI）
- [ ] Agent loop 稳定执行
- [ ] 流式响应无丢失
- [ ] 会话持久化正常

### 高级功能
- [ ] 沙箱隔离在所有平台正常工作
  - [ ] Linux: unshare --net
  - [ ] macOS: sandbox-exec
  - [ ] Windows: WFP firewall rule
- [ ] 权限系统正常拦截危险操作
- [ ] Memory 系统正常工作
- [ ] Git 操作稳定（包括 Windows）

### 实验功能
- [ ] Qt 集成自动检测并注入
- [ ] Reflexion 引擎正常工作
- [ ] Continual learning 正常合并记忆
- [ ] Ponytail methodology 正确执行

## 平台兼容性

### Linux
- [ ] Ubuntu 20.04+ 完全支持
- [ ] 网络隔离 (unshare --net) 正常
- [ ] 所有测试通过

### macOS
- [ ] macOS 11+ 完全支持
- [ ] 网络隔离 (sandbox-exec) 正常
- [ ] 降级策略（无 admin 权限时）正常
- [ ] 所有测试通过

### Windows
- [ ] Windows 10+ 完全支持
- [ ] 网络隔离 (WFP) 正常（需 admin）
- [ ] 降级策略（无 admin 权限时）正常
- [ ] Git 操作稳定，无超时
- [ ] 所有测试通过

## 性能与安全

### 性能
- [ ] 性能基准测试通过
- [ ] 大文件操作不卡顿
- [ ] 流式响应延迟 < 100ms
- [ ] 内存使用合理（< 500MB 正常会话）

### 安全
- [ ] SSRF 防护测试通过
- [ ] 输入验证完整
- [ ] 沙箱逃逸测试通过
- [ ] 敏感信息不泄露
- [ ] 依赖安全扫描通过

## CI/CD

### 持续集成
- [ ] CI 在所有平台通过（Linux, macOS, Windows）
- [ ] 覆盖率门禁生效
- [ ] Lint 门禁生效
- [ ] Type check 门禁生效

### 发布流程
- [ ] Git tags 规范（v1.0.0）
- [ ] CHANGELOG.md 更新
- [ ] GitHub Release 创建
- [ ] npm publish（如适用）

## 用户体验

### CLI
- [ ] 交互式命令全部工作
- [ ] 错误提示友好
- [ ] 帮助文档完整
- [ ] 启动时间 < 2s

### VS Code 扩展
- [ ] 安装流程顺畅
- [ ] 与编辑器集成良好
- [ ] 性能可接受

### 桌面应用
- [ ] 打包正常（Windows, macOS, Linux）
- [ ] UI 响应流畅
- [ ] 无崩溃

### Web UI
- [ ] 服务启动正常
- [ ] 浏览器兼容性好
- [ ] WebSocket 连接稳定

## 发布前最终检查

- [ ] 所有 TODO 标记已处理或转为 issue
- [ ] 所有 FIXME 已修复
- [ ] 代码审查完成
- [ ] 变更日志完整
- [ ] 发布说明撰写完成
- [ ] 社区公告准备完成

## 发布后

- [ ] 监控 GitHub issues
- [ ] 收集用户反馈
- [ ] 制定 v1.1.0 路线图

---

**完成日期目标**: 待定  
**责任人**: 项目维护者  
**当前进度**: 🟡 进行中 (已完成文档一致性修复和覆盖率阈值提升)
