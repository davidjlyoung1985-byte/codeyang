# 沙箱改善计划

## 问题分析

### 1. 伪沙箱问题
当前的沙箱实现存在以下"伪"特性：

**问题点：**
- ❌ `ResourceLimiter.getSpawnOptions()` 返回的选项**从未被使用**
- ❌ 内存限制 (`maxMemoryMb`) 只是声明，实际不生效
- ❌ 网络隔离 (`blockNetwork`) 只设置环境变量，无真正隔离
- ❌ `ulimit` 命令构造了但从未传递给 `fork()`
- ❌ 路径验证 (`PathValidator`) 创建了但**从未调用**

**根本原因：**
```typescript
// src/sandbox/index.ts:233
const runnerPath = this.getSandboxRunnerPath();
this.childProcess = fork(runnerPath, [], {
  cwd: this.workDir,
  stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  // ❌ 缺少：env, execArgv 等来自 ResourceLimiter 的选项
});
```

### 2. 两套安全规则未收敛

**重复的安全检查：**

1. **BashTool 中的检查** (`src/tools/BashTool.ts`)
   - `isDenied()` - 命令黑名单匹配
   - `sanitizeForLogging()` - 日志脱敏
   - Permission 系统集成

2. **Sandbox 中的检查** (`src/sandbox/index.ts`)
   - `PathValidator.isAllowed()` - 路径白/黑名单
   - `blockedPathPatterns` - 危险路径模式
   - 环境变量过滤

**问题：**
- 两套规则独立维护，容易不一致
- BashTool 可以绕过 Sandbox 直接调用 `execa`
- Sandbox 的安全检查从未被 BashTool 使用
- 缺乏统一的安全策略管理

### 3. 工程收尾问题

**提交污染：**
```bash
# 不该提交的测试文件
.test-git-tools           # 已删除但在 index 中
barchart.svg             # 测试生成的 SVG
coordinate.svg
function.svg
pie.svg
scatter.svg
triangle.svg
temp/test-*.txt          # 测试输出文件
```

**假状态：**
- `.test-git-tools` 显示为 deleted 但仍在提交中
- 多个 SVG 文件在根目录（测试残留）
- `.reasonix/` 下有大量测试输出（已在 .gitignore 中但已提交）
- stash 中有未完成的 Agent 重构代码（TypeScript 错误）

## 改善方案

### 方案 1：修复伪沙箱（核心）

#### 1.1 让 ResourceLimiter 生效

```typescript
// src/sandbox/index.ts
async run(command: string, args: string[] = [], options?: RunOptions): Promise<SandboxResult> {
  // ... 前置准备 ...
  
  const runnerPath = this.getSandboxRunnerPath();
  
  // ✅ 使用 ResourceLimiter 的配置
  const spawnOptions = this.resourceLimiter.getSpawnOptions();
  
  this.childProcess = fork(runnerPath, [], {
    cwd: this.workDir,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    env: {
      ...process.env,
      ...(spawnOptions.env as Record<string, string>),
      CODEYANG_SANDBOX_TIMEOUT: this.config.timeoutMs.toString(),
      CODEYANG_SANDBOX_MAX_STDOUT: this.config.maxStdoutBytes.toString(),
      CODEYANG_SANDBOX_MAX_STDERR: this.config.maxStderrBytes.toString(),
      CODEYANG_SANDBOX_COMMAND: command,
      CODEYANG_SANDBOX_ARGS: JSON.stringify(args),
      CODEYANG_SANDBOX_CWD: this.workDir,
    },
    execArgv: spawnOptions.execArgv as string[], // Node.js 参数
  });
  
  // ...
}
```

#### 1.2 实现路径验证

```typescript
// src/sandbox/index.ts
async run(command: string, args: string[] = [], options?: RunOptions): Promise<SandboxResult> {
  // ✅ 验证命令路径
  if (!this.pathValidator.isAllowed(command)) {
    throw new Error(`[SANDBOX] Command path blocked: ${command}`);
  }
  
  // ✅ 验证参数中的路径
  for (const arg of args) {
    if (arg.startsWith('/') || arg.startsWith('C:\\')) {
      if (!this.pathValidator.isAllowed(arg)) {
        throw new Error(`[SANDBOX] Argument path blocked: ${arg}`);
      }
    }
  }
  
  // ...
}
```

#### 1.3 增强网络隔离（可选）

```typescript
// src/sandbox/sandbox-runner.ts
// 在执行命令前检查网络标志
if (process.env.CODEYANG_SANDBOX_NETWORK_BLOCKED === '1') {
  // Linux: 使用 unshare --net
  // Windows: 显示警告（真正隔离需要 Job Objects）
  if (platform() === 'linux') {
    // 在命令前加 unshare --net
    command = 'unshare';
    args = ['--net', originalCommand, ...originalArgs];
  } else {
    // Windows: 仅警告
    console.warn('[SANDBOX] Network blocking requested but not fully supported on Windows');
  }
}
```

### 方案 2：收敛安全规则

#### 2.1 创建统一的安全策略模块

```typescript
// src/security/SecurityPolicy.ts
export class SecurityPolicy {
  // 命令黑名单（从 BashTool 迁移）
  static isCommandDenied(command: string): boolean { ... }
  
  // 路径验证（从 Sandbox 迁移）
  static isPathAllowed(path: string, config: SecurityConfig): boolean { ... }
  
  // 环境变量过滤
  static filterEnvVars(env: NodeJS.ProcessEnv, allowList: string[]): Record<string, string> { ... }
  
  // 日志脱敏
  static sanitizeForLogging(text: string): string { ... }
}
```

#### 2.2 让 BashTool 使用 Sandbox

```typescript
// src/tools/BashTool.ts
export async function executeBash(command: string, cwd?: string, timeoutSecs = 30): Promise<string> {
  // 检查权限
  await checkPermission('bash', command);
  
  // ✅ 使用 Sandbox 执行
  const sandbox = new Sandbox({
    timeoutMs: timeoutSecs * 1000,
    cleanupTempDir: true,
  });
  
  const result = await sandbox.run('sh', ['-c', command], {
    cwd: cwd || process.cwd(),
  });
  
  if (!result.success) {
    throw new Error(result.stderr || 'Command failed');
  }
  
  return result.stdout;
}
```

### 方案 3：清理工程状态

#### 3.1 清理提交污染

```bash
# 从 git 中移除测试文件
git rm -f .test-git-tools
git rm -f *.svg  # 根目录下的测试 SVG
git rm -f temp/test-*.txt

# 更新 .gitignore
echo "*.svg" >> .gitignore
echo "temp/" >> .gitignore

# 提交清理
git commit -m "chore: remove test artifacts from git"
```

#### 3.2 处理 stash 中的代码

```bash
# 查看 stash
git stash list

# 选项 1：丢弃（如果不需要）
git stash drop

# 选项 2：创建新分支继续工作
git stash branch feature/agent-refactor
```

## 实施优先级

### 优先级 1（必须）
- ✅ 让 ResourceLimiter 生效（修复伪沙箱的核心问题）
- ✅ 实现路径验证调用
- ✅ 清理 git 提交污染

### 优先级 2（重要）
- 🔄 收敛安全规则到统一模块
- 🔄 让 BashTool 使用 Sandbox

### 优先级 3（可选）
- ⏳ 真正的网络隔离（需要 OS 特性）
- ⏳ 内存限制（Linux cgroups / Windows Job Objects）

## 测试计划

### 测试 ResourceLimiter 生效
```typescript
test('should apply resource limits', async () => {
  const sandbox = new Sandbox({
    maxMemoryMb: 100,
    blockNetwork: true,
  });
  
  // 验证环境变量传递
  const result = await sandbox.run('node', ['-e', 'console.log(process.env.CODEYANG_SANDBOX_NETWORK_BLOCKED)']);
  expect(result.stdout.trim()).toBe('1');
});
```

### 测试路径验证
```typescript
test('should block dangerous paths', async () => {
  const sandbox = new Sandbox({
    blockedPathPatterns: ['/etc/shadow'],
  });
  
  await expect(
    sandbox.run('cat', ['/etc/shadow'])
  ).rejects.toThrow('path blocked');
});
```

### 测试统一安全策略
```typescript
test('BashTool should use Sandbox', async () => {
  const spy = jest.spyOn(Sandbox.prototype, 'run');
  
  await executeBash('echo hello');
  
  expect(spy).toHaveBeenCalled();
});
```

## 预期效果

### 修复后
- ✅ 沙箱真正隔离（资源限制生效）
- ✅ 安全规则统一且一致
- ✅ 代码库干净（无测试污染）
- ✅ 所有测试通过
- ✅ 文档准确反映实现

### 技术债务清除
- 移除未使用的代码（空的 ResourceLimiter 返回值）
- 合并重复的安全逻辑
- 清理临时文件和测试残留
