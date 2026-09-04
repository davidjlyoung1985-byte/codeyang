# 高级中断恢复系统

## 功能概述

高级中断恢复系统为 CodeYang 提供了强大的任务恢复能力，可以在以下情况下恢复中断的会话：

- **网络中断**：API 请求超时或连接断开
- **用户中断**：Ctrl+C 强制退出
- **系统崩溃**：意外退出或错误
- **超时**：长时间运行的任务

## 核心组件

### 1. RecoveryManager

负责检查点的创建、存储和恢复。

#### 主要功能：
- 自动定期保存检查点
- 管理检查点生命周期
- 文件系统更改跟踪
- 检查点清理

#### 使用示例：

```typescript
import { RecoveryManager } from './recovery/RecoveryManager.js';

const recoveryManager = new RecoveryManager({
  checkpointDir: '~/.codeyang/checkpoints',
  autoSaveInterval: 30000, // 每30秒自动保存
  maxCheckpoints: 10, // 最多保留10个检查点
  enableFileSystemTracking: true,
});

await recoveryManager.initialize();

// 创建检查点
const checkpointId = await recoveryManager.createCheckpoint({
  sessionId: 'my-session',
  turnIndex: 5,
  messages: [...],
  toolExecutionState: {...},
  fileSystemSnapshot: {...},
  context: {...},
  recoveryMetadata: {
    canResume: true,
  },
});

// 恢复检查点
const checkpoint = await recoveryManager.restoreFromCheckpoint(checkpointId);
```

### 2. RecoveryIntegration

将恢复管理器集成到 Agent 系统中。

#### 主要功能：
- 自动捕获 Agent 状态
- 检测未完成的会话
- 一键恢复会话

#### 使用示例：

```typescript
import { RecoveryIntegration } from './recovery/RecoveryIntegration.js';

const recoveryIntegration = new RecoveryIntegration({
  agent: myAgent,
  recoveryManager: recoveryManager,
  autoCheckpointEnabled: true,
  promptUserOnRecovery: true,
});

await recoveryIntegration.initialize();

// 手动创建检查点
await recoveryIntegration.createCheckpoint();

// 从检查点恢复
await recoveryIntegration.restoreFromCheckpoint('checkpoint-id');

// 列出可恢复的会话
const sessions = await recoveryIntegration.listRecoverableCheckpoints();
```

## 检查点结构

```typescript
interface Checkpoint {
  id: string;
  timestamp: number;
  sessionId: string;
  turnIndex: number;

  // 对话状态
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    toolCalls?: Array<{ name: string; args: Record<string, unknown> }>;
    toolResults?: Array<{ output: string; isError: boolean }>;
  }>;

  // 工具执行状态
  toolExecutionState: {
    completedTools: string[];
    pendingTools: Array<{ name: string; args: Record<string, unknown> }>;
    failedTools: Array<{ name: string; error: string }>;
  };

  // 文件系统快照
  fileSystemSnapshot: {
    modifiedFiles: string[];
    createdFiles: string[];
    deletedFiles: string[];
  };

  // 上下文信息
  context: {
    cwd: string;
    model: string;
    apiKey?: string;
    config: Record<string, unknown>;
  };

  // 恢复元数据
  recoveryMetadata: {
    canResume: boolean;
    resumeReason?: string;
    interruptionType?: 'user' | 'network' | 'crash' | 'timeout';
  };
}
```

## CLI 命令

### 查看可恢复的会话

```bash
/recovery list
```

输出：
```
Available checkpoints:
1. session-abc123 (2026-09-02 14:30:15) - Turn 5
2. session-def456 (2026-09-02 13:15:42) - Turn 3
```

### 恢复特定会话

```bash
/recovery restore <checkpoint-id>
```

### 删除检查点

```bash
/recovery delete <checkpoint-id>
```

### 清理所有旧检查点

```bash
/recovery cleanup
```

## 配置选项

### 环境变量

```bash
# 启用自动恢复
export CODEYANG_AUTO_RECOVERY=true

# 检查点保存间隔（毫秒）
export CODEYANG_CHECKPOINT_INTERVAL=30000

# 最大检查点数量
export CODEYANG_MAX_CHECKPOINTS=10

# 检查点存储目录
export CODEYANG_CHECKPOINT_DIR=~/.codeyang/checkpoints
```

### 配置文件

在 `~/.codeyang/config.json` 中添加：

```json
{
  "recovery": {
    "enabled": true,
    "autoSaveInterval": 30000,
    "maxCheckpoints": 10,
    "promptOnStartup": true
  }
}
```

## 工作流程

### 1. 正常运行时

```
User Input → Agent Processing → Auto Checkpoint (every 30s)
                ↓
           Tool Execution
                ↓
        Track File Changes
                ↓
          Create Checkpoint
```

### 2. 中断恢复

```
Startup → Detect Unfinished Sessions
            ↓
      Prompt User to Restore
            ↓
    Restore from Checkpoint
            ↓
      Continue Execution
```

## 最佳实践

### 1. 何时创建检查点

- **每个重要操作前**：Git commit、文件删除等
- **长时间任务中**：定期自动保存
- **用户明确请求**：手动保存点

### 2. 检查点管理

- 定期清理旧检查点（保留最近 10 个）
- 会话完成后删除检查点
- 磁盘空间不足时清理

### 3. 恢复策略

- 优先恢复最近的检查点
- 检查文件系统状态一致性
- 验证工具执行结果

## 注意事项

### 安全性

- 检查点文件包含敏感信息（API key 等）
- 存储在用户目录下，权限受限
- 不要在公共目录创建检查点

### 性能

- 自动保存间隔不宜过短（推荐 30 秒以上）
- 检查点文件大小随会话增长
- 定期清理避免磁盘占用过多

### 兼容性

- 检查点格式可能在版本更新时变化
- 跨版本恢复可能失败
- 建议在同一版本内恢复

## 故障排查

### 问题：无法创建检查点

**原因**：磁盘空间不足或权限问题

**解决**：
```bash
# 检查磁盘空间
df -h ~/.codeyang

# 检查权限
ls -la ~/.codeyang/checkpoints
```

### 问题：恢复失败

**原因**：检查点文件损坏或版本不兼容

**解决**：
```bash
# 验证检查点文件
cat ~/.codeyang/checkpoints/<id>.json | jq .

# 删除损坏的检查点
/recovery delete <id>
```

### 问题：恢复后状态不一致

**原因**：文件系统在中断期间被外部修改

**解决**：
- 检查 fileSystemSnapshot 中的文件
- 手动解决冲突
- 继续或重新开始任务

## 技术细节

### 存储格式

检查点以 JSON 格式存储，文件名：`ckpt-<timestamp>-<random>.json`

### 自动保存机制

使用 Node.js `setInterval` 定期触发保存，间隔可配置。

### 文件系统跟踪

监听工具调用，记录所有文件操作：
- Write → 创建文件
- Edit → 修改文件
- Delete → 删除文件

### 会话识别

每个会话有唯一的 sessionId，格式：`session-<timestamp>-<random>`

## 未来计划

- [ ] 支持增量检查点（只保存差异）
- [ ] 云端检查点备份
- [ ] 跨设备会话恢复
- [ ] 智能恢复建议
- [ ] 检查点压缩
- [ ] 更细粒度的状态捕获

## 参考

- [Agent.ts](../agent/Agent.ts) - Agent 核心实现
- [types.ts](../types.ts) - 类型定义
- [session.ts](../utils/session.ts) - 会话管理
