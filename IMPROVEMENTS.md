# 项目改进计划

## 问题清单与解决方案

### 1. ⚠️ 实验模块未覆盖测试
**问题**: qt (4078行)、reflexion、continual-learning (1227行) 被排除在覆盖率统计外
**影响**: 实际未测试代码量 ~5305行，占项目相当比例

**解决方案**:
- [ ] 将实验模块纳入覆盖率统计
- [ ] 为 qt 模块补充测试（当前1657行测试 vs 4078行代码，覆盖率约40%）
- [ ] 为 reflexion/continual-learning 补充测试（当前711行测试 vs 1227行代码，覆盖率约58%）
- [ ] 更新 vitest.config.ts，将这些模块加入 coverage.include
- [ ] 设置合理的覆盖率目标：实验模块至少达到60%

### 2. ⚠️ 文档数字自相矛盾
**问题**: 
- README.md 第36行: "80+ built-in tools"
- README.md 第311行: "81 registered tools"
- package.json 第4行: "64+ tools"

**实际统计**: 
- 内置工具: 58个 (来自15个定义文件)
- ClaudeCodeTool: 1个
- 核心工具总计: 59个
- 动态工具 (MCP + Qt): 根据环境变化

**解决方案**:
- [ ] 统一描述为 "60+ core tools"
- [ ] 说明动态工具 (MCP servers + Qt tools when detected)
- [ ] 添加工具计数测试，防止文档与代码脱节

### 3. ⚠️ 原创性有限
**问题**: 架构、工具命名、agent loop 都 "heavily inspired by Claude Code"

**解决方案**:
- [ ] 在 README 增加"差异化价值"章节
- [ ] 明确列出原创贡献:
  - Multi-provider LLM support (Claude, DeepSeek, OpenAI)
  - MCP client integration (Claude Code 不包含)
  - Process sandbox with fork/IPC isolation
  - Qt framework deep integration (5000+ lines)
  - Reflexion self-critique engine
  - Web/Desktop/VSCode 多端支持
  - Ponytail methodology (YAGNI enforcement)
- [ ] 在 CONTRIBUTING.md 说明欢迎原创功能贡献

### 4. ⚠️ 覆盖率阈值偏松
**问题**: 
- 实际: statements 76.7%, branches 79.8%, functions 86.1%, lines 76.6%
- 阈值: statements 75%, branches 78%, functions 84%, lines 75%
- 间隙: 仅 1-2 个百分点，防回归能力弱

**解决方案**:
- [ ] 提高覆盖率阈值到:
  - statements: 78% (留 1.3% 缓冲)
  - branches: 81% (留 1.2% 缓冲)
  - functions: 87% (留 0.9% 缓冲)
  - lines: 78% (留 1.4% 缓冲)
- [ ] 为核心模块设置更高标准 (agent, tools, security: 85%+)
- [ ] 添加覆盖率趋势监控

### 5. ⚠️ 版本与平台兼容性问题
**问题**:
- 版本仍是 0.9.0 Beta
- 网络隔离在 Win/macOS 需管理员权限
- Windows 上 Git 操作可能超时

**解决方案**:
- [ ] 制定 v1.0.0 发布检查清单:
  - [ ] 所有核心模块覆盖率 ≥85%
  - [ ] 实验模块覆盖率 ≥60%
  - [ ] 文档数字一致性检查通过
  - [ ] CI 在 Linux/macOS/Windows 全部绿色
  - [ ] 性能基准测试通过
  - [ ] 安全审计无高危漏洞
- [ ] 改进平台兼容性:
  - [ ] 为 Windows Git 操作增加重试机制
  - [ ] 网络隔离降级策略文档化
  - [ ] 添加平台特定的测试套件
- [ ] 更新 README 的"已知限制"章节

## 实施优先级

### P0 (立即修复)
1. 统一工具数量描述
2. 提高覆盖率阈值

### P1 (本周完成)
3. 补充实验模块测试
4. 增加"差异化价值"章节

### P2 (v1.0.0 前完成)
5. 制定并执行 v1.0.0 发布检查清单
6. 改进平台兼容性

## 预期效果

修复后的项目评分提升:
- **代码质量**: 17/20 → 19/20 (覆盖率提升至85%+)
- **文档完善度**: 16/20 → 18/20 (消除矛盾，增加原创性说明)
- **工程实践**: 16/20 → 18/20 (发布v1.0.0)

**总分**: 85/100 → **92/100**
