# 沙箱安全边界声明

## 📋 当前实现级别

### ✅ 已实现的隔离

#### 1. **进程级隔离**（Production Ready）
- ✅ 使用 `child_process.fork()` 在独立进程中执行
- ✅ 父进程崩溃不影响主进程
- ✅ 通过 IPC 通道安全通信
- ✅ 进程可被强制终止（SIGTERM/SIGKILL）

#### 2. **超时控制**（Production Ready）
- ✅ 可配置的执行超时（默认 30 秒）
- ✅ 超时自动终止子进程
- ✅ 防止无限循环和挂起

#### 3. **输出限制**（Production Ready）
- ✅ stdout/stderr 大小限制（默认 1MB）
- ✅ 自动截断超出部分
- ✅ 防止输出淹没主进程

#### 4. **文件系统隔离**（Production Ready）
- ✅ 独立的临时工作目录
- ✅ 路径白名单/黑名单验证
- ✅ 自动清理临时目录
- ✅ 防止访问敏感系统路径（/etc/shadow, /sys/*, etc.）

#### 5. **环境变量控制**（Production Ready）
- ✅ 环境变量白名单过滤
- ✅ 沙箱标识注入（CODEYANG_SANDBOX=1）
- ✅ 防止敏感环境变量泄露

### ⚠️ 部分实现的隔离

#### 6. **网络隔离标记**（Soft Limit）
- ⚠️ 设置 `CODEYANG_SANDBOX_NETWORK_BLOCKED=1` 环境变量
- ⚠️ 应用程序需要主动检查并遵守
- ❌ **无法阻止恶意代码绕过**

**适用场景：**
- 可信脚本的网络访问控制
- 配合应用层检查使用

**不适用场景：**
- 不可信第三方代码
- 需要强制网络隔离的场景

#### 7. **内存限制标记**（Soft Limit）
- ⚠️ 设置 `CODEYANG_SANDBOX_MAX_MEMORY_MB` 环境变量
- ⚠️ 应用程序需要主动检查并限制
- ❌ **无法强制执行**

**适用场景：**
- 协作式内存管理
- 与监控系统配合使用

**不适用场景：**
- 防止内存炸弹攻击
- 需要硬性内存限制

### ❌ 未实现的隔离

#### 8. **真正的网络隔离**（需要 OS 级支持）
- ❌ Linux: 需要 network namespaces (`unshare --net`)
- ❌ Windows: 需要 Job Objects with network restrictions
- ❌ macOS: 需要 sandbox-exec 或 App Sandbox

#### 9. **真正的内存限制**（需要 OS 级支持）
- ❌ Linux: 需要 cgroups v2
- ❌ Windows: 需要 Job Objects memory limits
- ❌ macOS: 需要 rlimit 或 launchctl

#### 10. **CPU 限制**（需要 OS 级支持）
- ❌ Linux: 需要 cgroups cpu quota
- ❌ Windows: 需要 Job Objects CPU rate limits
- ❌ macOS: 需要 nice 或 launchctl

#### 11. **系统调用过滤**（需要 OS 级支持）
- ❌ Linux: 需要 seccomp-bpf
- ❌ Windows: 无直接支持
- ❌ macOS: 需要 sandbox-exec

---

## 🎯 安全边界定义

### ✅ **适用场景**（Safe to Use）

1. **可信代码执行**
   - 用户自己的脚本
   - 经过审核的插件
   - 开发环境的工具脚本

2. **协作式隔离**
   - 代码主动遵守沙箱限制
   - 配合权限系统使用
   - 开发调试场景

3. **资源管理**
   - 防止意外的无限循环
   - 限制输出大小
   - 临时文件隔离

4. **进程崩溃隔离**
   - 防止子进程崩溃影响主进程
   - 恢复能力
   - 日志和错误收集

### ⚠️ **限制场景**（Use with Caution）

1. **部分可信代码**
   - 需要配合其他安全措施
   - 代码审查 + 沙箱
   - 监控 + 告警

2. **测试环境**
   - 非生产环境
   - 有额外安全层保护
   - 网络隔离的测试网络

### ❌ **不适用场景**（Do NOT Use）

1. **完全不可信的第三方代码**
   - ❌ 随机下载的脚本
   - ❌ 用户提交的任意代码
   - ❌ 恶意代码分析

   **原因：** 无法防止网络访问、系统调用滥用、资源耗尽攻击

2. **需要强隔离的场景**
   - ❌ 多租户代码执行平台
   - ❌ 在线代码运行沙箱
   - ❌ 安全敏感的生产环境

   **替代方案：** 使用 Docker、gVisor、Firecracker 等容器技术

3. **需要防御恶意攻击**
   - ❌ 防范蓄意破坏
   - ❌ 防范权限提升
   - ❌ 防范数据窃取

   **替代方案：** 使用 VM、容器 + seccomp + AppArmor/SELinux

---

## 🔧 OS 级增强选项

### 可选集成（需要手动启用）

#### 选项 1：Linux + unshare（网络隔离）

```typescript
// src/sandbox/os-isolation/linux-network.ts
export function enableLinuxNetworkIsolation(): boolean {
  if (process.platform !== 'linux') return false;
  
  try {
    // 检查 unshare 是否可用
    execSync('which unshare', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function wrapCommandWithNetworkIsolation(command: string, args: string[]): [string, string[]] {
  return ['unshare', ['--net', command, ...args]];
}
```

**启用方式：**
```typescript
const sandbox = new Sandbox({
  blockNetwork: true,
  useOsNetworkIsolation: true,  // 新选项
});
```

**要求：**
- Linux 系统
- unshare 命令可用
- 可能需要 CAP_SYS_ADMIN 权限

#### 选项 2：Linux + cgroups v2（内存和 CPU 限制）

```typescript
// src/sandbox/os-isolation/linux-cgroups.ts
export class CgroupsManager {
  async createCgroup(name: string, limits: { memory?: number; cpu?: number }): Promise<string> {
    const cgroupPath = `/sys/fs/cgroup/codeyang-sandbox-${name}`;
    // 创建 cgroup
    // 设置限制
    // 返回 cgroup 路径
  }
  
  async moveToCgroup(pid: number, cgroupPath: string): Promise<void> {
    // 将进程移入 cgroup
  }
  
  async cleanupCgroup(cgroupPath: string): Promise<void> {
    // 清理 cgroup
  }
}
```

**要求：**
- Linux 内核 >= 4.5
- cgroups v2 挂载
- root 权限或适当的 capabilities

#### 选项 3：Docker 集成（完整隔离）

```typescript
// src/sandbox/backends/docker-backend.ts
export class DockerSandbox implements ISandboxBackend {
  async run(command: string, args: string[], opts: SandboxOptions): Promise<SandboxResult> {
    // 在 Docker 容器中运行
    // 使用 --network=none 禁用网络
    // 使用 --memory 限制内存
    // 使用 --cpus 限制 CPU
  }
}
```

**启用方式：**
```typescript
const sandbox = new Sandbox({
  backend: 'docker',  // 'node' (默认) | 'docker'
  dockerImage: 'node:20-alpine',
});
```

**要求：**
- Docker 已安装
- Docker daemon 运行中
- 适当的 Docker 权限

---

## 📊 功能对比表

| 功能 | 当前实现 | Linux + unshare | Linux + cgroups | Docker | VM |
|------|---------|----------------|-----------------|--------|-----|
| 进程隔离 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 超时控制 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 输出限制 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 文件系统隔离 | ✅ (软) | ✅ (软) | ✅ (软) | ✅ (硬) | ✅ (硬) |
| 环境变量控制 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 网络隔离 | ⚠️ (标记) | ✅ (硬) | ⚠️ (需配合) | ✅ (硬) | ✅ (硬) |
| 内存限制 | ⚠️ (标记) | ❌ | ✅ (硬) | ✅ (硬) | ✅ (硬) |
| CPU 限制 | ❌ | ❌ | ✅ (硬) | ✅ (硬) | ✅ (硬) |
| 系统调用过滤 | ❌ | ❌ | ❌ | ✅ (seccomp) | ✅ |
| 启动开销 | 极低 (~10ms) | 低 (~20ms) | 低 (~30ms) | 中 (~200ms) | 高 (~1s+) |
| 跨平台 | ✅ | ❌ (仅 Linux) | ❌ (仅 Linux) | ✅ | ✅ |
| 依赖 | 无 | unshare | cgroups v2 | Docker | QEMU/VMware |

---

## 🚦 使用决策树

```
需要运行代码？
├─ 是自己写的或可信的代码？
│  ├─ 是 → ✅ 使用当前沙箱（足够）
│  └─ 否 → 继续下一步
│
├─ 只需要防止意外崩溃和资源滥用？
│  ├─ 是 → ✅ 使用当前沙箱（足够）
│  └─ 否 → 继续下一步
│
├─ 需要防止网络访问吗？
│  ├─ 是 → 使用 Linux + unshare 或 Docker
│  └─ 否 → 继续下一步
│
├─ 需要强制内存/CPU 限制吗？
│  ├─ 是 → 使用 Linux + cgroups 或 Docker
│  └─ 否 → 继续下一步
│
├─ 代码完全不可信或恶意吗？
│  ├─ 是 → ❌ 使用 Docker + seccomp 或 VM
│  └─ 否 → ✅ 使用当前沙箱可能足够
```

---

## 💡 推荐实践

### 当前沙箱适用的场景

1. **开发工具执行**
   ```typescript
   // 运行 linters、formatters、测试
   const sandbox = new Sandbox({ timeoutMs: 60000 });
   await sandbox.run('npm', ['run', 'lint']);
   ```

2. **用户脚本执行（可信）**
   ```typescript
   // 用户的自动化脚本
   const sandbox = new Sandbox({
     cleanupTempDir: true,
     blockedPathPatterns: ['/etc/*', '/sys/*'],
   });
   await sandbox.run('node', ['user-script.js']);
   ```

3. **插件系统（审核后）**
   ```typescript
   // 经过安全审核的插件
   const sandbox = new Sandbox({
     allowedEnvVars: ['NODE_PATH', 'PATH'],
     timeoutMs: 30000,
   });
   await sandbox.run('node', ['plugin-index.js']);
   ```

### 需要增强隔离的场景

1. **第三方代码执行**
   ```typescript
   // 使用 Docker backend（未来实现）
   const sandbox = new Sandbox({
     backend: 'docker',
     networkIsolation: 'full',
     memoryLimitMb: 512,
   });
   ```

2. **多租户平台**
   ```typescript
   // 每个租户独立容器
   // 使用 gVisor 或 Firecracker
   ```

---

## 📝 总结

### 当前沙箱的定位

**CodeYang Sandbox 是一个轻量级的进程级沙箱，适用于：**

✅ 可信代码的隔离执行  
✅ 防止意外崩溃和资源滥用  
✅ 开发和测试环境  
✅ 协作式安全控制  

**不适用于：**

❌ 完全不可信的第三方代码  
❌ 需要强隔离的多租户平台  
❌ 防御恶意攻击  

### 未来增强方向

1. **短期（可选）**
   - Linux + unshare 网络隔离
   - 明确的边界文档（本文档）

2. **中期（可选）**
   - Linux + cgroups 内存/CPU 限制
   - Windows Job Objects 集成

3. **长期（可选）**
   - Docker backend 支持
   - gVisor/Firecracker 集成

### 使用建议

**对于大多数用例，当前的沙箱实现已经足够。**

如果你需要更强的隔离，请评估：
1. 代码的可信度
2. 潜在的风险
3. 性能开销的接受度
4. 平台兼容性要求

然后选择合适的增强方案或替代技术（Docker、VM）。
