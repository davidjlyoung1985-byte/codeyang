# CodeYang 高优先级改进实施计划

## 项目现状分析

### 当前指标
- **版本**: v0.8.0
- **测试覆盖率**: 
  - 语句: 74.69% (目标: 64%)
  - 分支: 78.8% (目标: 52%) ✅ **已超过70%**
  - 函数: 83.55% (目标: 67%)
  - 行: 74.69% (目标: 65%)
- **测试数量**: 2076个测试，106个测试文件
- **源文件数**: 178个非测试TypeScript文件
- **Git标签**: 仅有v0.8.0
- **版本发布**: 使用RELEASE-v0.8.0.md文件追踪，无规范流程

### 低覆盖率模块识别
从覆盖率报告分析：
1. **bridge/** - 2.95% 语句覆盖率（几乎无测试）
2. **agent/LLMClient.ts** - 14.23% 语句覆盖率
3. **agent/ContextManager.ts** - 28.91% 语句覆盖率
4. **agent/ponytail-prompt.ts** - 28.57% 语句覆盖率（分支33.33%）
5. **mcp/McpManager.ts** - 35.06% 语句覆盖率
6. **closed-loop/VerificationPipeline.ts** - 41.86% 语句覆盖率

## 优先级1：提升分支覆盖率至70%+ ✅

**状态**: **目标已达成 78.8%，可进一步提升至85%+**

### 需要改进的模块（分支覆盖率<70%）
1. **agent/ponytail-prompt.ts** - 33.33% 分支
2. **agent/system-prompt.ts** - 37.5% 分支
3. **agent/ToolExecutor.ts** - 61.11% 分支
4. **closed-loop/VerificationPipeline.ts** - 65% 分支
5. **mcp/McpManager.ts** - 66.66% 分支

### 实施策略
为低覆盖率模块补充边界测试和异常路径测试

**具体任务**:
1. 为`agent/ponytail-prompt.ts`添加完整测试套件
2. 为`agent/system-prompt.ts`添加条件分支测试
3. 扩展`closed-loop/VerificationPipeline.ts`的错误处理测试
4. 增加`mcp/McpManager.ts`的异常场景测试
5. 补充`agent/ToolExecutor.ts`的边界情况测试

**预期结果**: 整体分支覆盖率提升至85%+

## 优先级2：建立规范的版本发布流程

**问题**:
- 仅有1个git标签（v0.8.0）
- 使用Markdown文件追踪发布（RELEASE-v0.8.0.md）
- 无自动化发布工作流
- 无CHANGELOG自动生成

### 实施策略

#### 2.1 创建版本发布工作流
**文件**: `.github/workflows/release.yml`

**功能**:
- 自动创建GitHub Release
- 自动生成CHANGELOG
- 自动标记git tag
- 构建和上传artifacts
- 可选：发布到NPM

#### 2.2 创建发布脚本
**文件**: `scripts/release.sh` 和 `scripts/release.ps1`

**功能**:
- 版本号验证和升级（major/minor/patch）
- 自动更新package.json
- 生成CHANGELOG条目
- 创建git tag
- 推送到远程仓库

#### 2.3 标准化发布文档
**文件**: `docs/RELEASE_PROCESS.md`

**内容**:
- 发布前检查清单
- 版本号规范（语义化版本）
- 发布步骤详解
- 回滚流程

#### 2.4 补充历史标签
**任务**: 为历史版本补充git标签
- 查找`docs/archive/RELEASE_v*.md`
- 根据发布日期和commit历史创建标签
- 至少补充：v0.6.1, v0.7.0, v0.7.1

## 优先级3：完善Windows/macOS网络隔离

**现状**:
- Linux: ✅ 完整支持（unshare网络命名空间）
- Windows: ⚠️ 仅软阻塞（环境变量标记）
- macOS: ⚠️ 仅软阻塞（环境变量标记）

**问题**: `os-isolation.ts`已实现检测逻辑，但Windows/macOS返回不支持

### 实施策略

#### 3.1 Windows网络隔离实现
**方法**: Windows Filtering Platform (WFP) 或 netsh防火墙规则

**推荐方案**: netsh防火墙规则（无需native模块）

**实施代码**:
```typescript
// 创建防火墙规则阻塞特定进程的出站连接
function createWindowsNetworkBlock(processPath: string, pid: number): void {
  execSync(`netsh advfirewall firewall add rule 
    name="CodeYang_Sandbox_${pid}" 
    dir=out action=block 
    program="${processPath}" 
    enable=yes`);
}

function removeWindowsNetworkBlock(pid: number): void {
  execSync(`netsh advfirewall firewall delete rule 
    name="CodeYang_Sandbox_${pid}"`);
}
```

**步骤**:
1. 创建`src/sandbox/os-isolation-windows.ts`
2. 实现防火墙规则管理（创建/删除）
3. 检测管理员权限（需要提升权限）
4. 添加清理逻辑（确保规则不残留）
5. 更新`os-isolation.ts`的Windows检测逻辑
6. 添加测试套件

**注意**: 需要管理员权限，优雅降级到软阻塞

#### 3.2 macOS网络隔离实现
**方法**: sandbox-exec（macOS原生沙箱）

**实施代码**:
```bash
sandbox-exec -p '(version 1)
(deny default)
(allow process-exec*)
(deny network*)' command args
```

**步骤**:
1. 创建`src/sandbox/os-isolation-macos.ts`
2. 实现sandbox-exec配置文件生成
3. 处理SIP（System Integrity Protection）限制
4. 更新`os-isolation.ts`的macOS检测逻辑
5. 添加测试套件

**注意**: SIP可能限制某些二进制文件的沙箱化

#### 3.3 统一接口设计
更新`src/sandbox/os-isolation.ts`接口：

```typescript
export interface NetworkIsolationCapabilities {
  supported: boolean;
  method?: 'unshare' | 'wfp' | 'sandbox-exec';
  requiresRoot?: boolean;
  requiresAdmin?: boolean; // Windows特定
  error?: string;
}
```

## 实施顺序

### 阶段1：版本发布流程（1-2小时，优先级最高）
1. 创建`.github/workflows/release.yml`
2. 创建发布脚本`scripts/release.sh`和`scripts/release.ps1`
3. 创建`docs/RELEASE_PROCESS.md`文档
4. 补充历史git标签
5. 测试发布流程（创建v0.8.1-beta测试标签）

### 阶段2：测试覆盖率提升（2-3小时）
1. 分析未覆盖代码路径
2. 为`agent/ponytail-prompt.ts`添加测试
3. 为`agent/system-prompt.ts`添加测试
4. 扩展`closed-loop`模块测试
5. 扩展`mcp/McpManager.ts`测试
6. 运行覆盖率验证，确保达到85%+

### 阶段3：Windows网络隔离（3-4小时）
1. 创建`os-isolation-windows.ts`
2. 实现netsh防火墙规则管理
3. 添加管理员权限检测
4. 集成到主沙箱系统
5. 添加测试和文档

### 阶段4：macOS网络隔离（2-3小时）
1. 创建`os-isolation-macos.ts`
2. 实现sandbox-exec包装
3. 处理SIP限制
4. 集成到主沙箱系统
5. 添加测试和文档

## 成功标准

### 版本发布流程
- [ ] GitHub Actions工作流可用
- [ ] 发布脚本在Windows和Unix上运行
- [ ] 所有历史版本有git标签
- [ ] 文档完整且易于遵循

### 测试覆盖率
- [ ] 整体分支覆盖率 ≥ 85%
- [ ] 所有核心模块语句覆盖率 ≥ 70%
- [ ] 新增测试通过CI

### 网络隔离
- [ ] Windows支持netsh防火墙阻塞
- [ ] macOS支持sandbox-exec
- [ ] 自动检测和降级到软阻塞
- [ ] 文档说明各平台能力和限制

## 风险和缓解

### 风险1：Windows防火墙需要管理员权限
**缓解**: 优雅降级到软阻塞，记录警告日志

### 风险2：macOS SIP限制sandbox-exec
**缓解**: 检测SIP状态，提供用户指南

### 风险3：测试覆盖率提升可能发现新bug
**缓解**: 每个模块独立测试，隔离影响范围

### 风险4：发布工作流可能破坏现有流程
**缓解**: 先创建测试标签，验证后再用于正式发布

## 时间估算

| 任务 | 预计时间 | 优先级 |
|------|---------|--------|
| 版本发布流程 | 1-2小时 | 高 ⭐⭐⭐ |
| 测试覆盖率提升 | 2-3小时 | 高 ⭐⭐⭐ |
| Windows网络隔离 | 3-4小时 | 高 ⭐⭐⭐ |
| macOS网络隔离 | 2-3小时 | 高 ⭐⭐⭐ |
| **总计** | **8-12小时** | - |
