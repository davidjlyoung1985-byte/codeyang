# 超时和挂起问题改进方案

## 问题分析

"跑着跑着就会停下来，没有反馈"的原因：

1. **流超时**：默认5分钟超时可能不够
2. **无心跳机制**：长时间运行没有进度反馈
3. **网络中断**：连接丢失后没有自动重试
4. **静默失败**：错误被吞掉，没有显示给用户

## 改进方案

### 1. 增加心跳和进度提示

```typescript
// 在长时间操作时定期输出进度
class ProgressReporter {
  private timer: NodeJS.Timeout | null = null;

  start(message: string = '正在处理...') {
    let dots = 0;
    this.timer = setInterval(() => {
      dots = (dots + 1) % 4;
      process.stdout.write(`\r${message}${'.'.repeat(dots)}   `);
    }, 1000);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      process.stdout.write('\r\n');
    }
  }
}
```

### 2. 更好的超时处理

```typescript
// 添加可配置的超时和重试
const config = {
  // 流超时（默认10分钟，可以更长）
  streamTimeout: parseInt(process.env.CODEYANG_STREAM_TIMEOUT || '600000', 10),

  // 心跳间隔（30秒）
  heartbeatInterval: 30000,

  // 自动重试次数
  maxRetries: 3,

  // 空闲超时（15分钟无活动则警告）
  idleTimeout: 900000,
};
```

### 3. 连接状态监控

```typescript
class ConnectionMonitor {
  private lastActivity: number = Date.now();
  private healthCheckTimer: NodeJS.Timeout | null = null;

  startMonitoring(onTimeout: () => void) {
    this.healthCheckTimer = setInterval(() => {
      const idleTime = Date.now() - this.lastActivity;

      if (idleTime > config.idleTimeout) {
        console.warn('⚠️ 长时间无响应，可能出现问题');
        console.warn('提示：按 Ctrl+C 中断，或等待自动恢复');
      }

      // 每30秒显示心跳
      if (idleTime % 30000 < 5000) {
        process.stdout.write('.');
      }
    }, 5000);
  }

  recordActivity() {
    this.lastActivity = Date.now();
  }

  stop() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
  }
}
```

### 4. 流式响应改进

```typescript
// 在 Agent.ts 的 stream 方法中添加
async *streamWithHeartbeat(params) {
  const monitor = new ConnectionMonitor();
  monitor.startMonitoring(() => {
    this.cbs.onError?.('连接超时，正在尝试重连...');
  });

  try {
    for await (const event of this.client.stream(params)) {
      monitor.recordActivity();
      yield event;
    }
  } finally {
    monitor.stop();
  }
}
```

### 5. 错误捕获和显示

```typescript
// 确保所有错误都被捕获并显示
try {
  // ... 执行操作
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);

  // 显示给用户
  console.error(`\n❌ 错误: ${message}`);

  // 记录详细日志
  logger.error('Operation failed:', error);

  // 提供恢复建议
  if (message.includes('timeout')) {
    console.log('\n💡 建议:');
    console.log('1. 增加超时时间: export CODEYANG_STREAM_TIMEOUT=1200000');
    console.log('2. 检查网络连接');
    console.log('3. 尝试更小的请求');
  }

  throw error;
}
```

## 立即可用的临时方案

### 方法1：增加超时时间

```bash
# 设置超时为20分钟（1,200,000毫秒）
export CODEYANG_STREAM_TIMEOUT=1200000

# Windows PowerShell
$env:CODEYANG_STREAM_TIMEOUT="1200000"

npm start
```

### 方法2：启用调试日志

```bash
# 查看详细日志，了解卡在哪里
export CODEYANG_DEBUG=true

npm start
```

### 方法3：使用更可靠的模型

```bash
# 某些模型更稳定
export CODEYANG_MODEL=claude-3-sonnet-20240229

npm start
```

## 需要实现的功能

- [ ] 添加心跳机制（每30秒输出进度）
- [ ] 添加连接监控（检测长时间无响应）
- [ ] 改进错误提示（显示具体原因和建议）
- [ ] 添加自动重连（网络中断后重试）
- [ ] 添加进度条（显示大型操作的进度）
- [ ] 添加取消机制（允许用户中断长时间操作）

## 配置建议

根据使用场景调整超时：

```bash
# 简单任务（5分钟）
CODEYANG_STREAM_TIMEOUT=300000

# 中等任务（10分钟）
CODEYANG_STREAM_TIMEOUT=600000

# 复杂任务（20分钟）
CODEYANG_STREAM_TIMEOUT=1200000

# 超大任务（30分钟）
CODEYANG_STREAM_TIMEOUT=1800000
```
