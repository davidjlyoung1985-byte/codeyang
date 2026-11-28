# Gateway 改进建议

## 当前状况

Gateway 实现了完整的中间件架构（Auth → RateLimit → Audit），但 `finalHandler` 是一个空壳：

```typescript
// 当前实现 (src/gateway/index.ts:370-376)
const finalHandler = (req: Request): Promise<Response> => {
  return Promise.resolve({
    success: true,
    requestId: req.id,
    durationMs: Date.now() - t0,
  });
};
```

**问题：**
- `req.operation` 和 `req.payload` 完全没有被处理
- 中间件链只做"放行/拒绝"，不派发任何实际操作
- 审计日志记录不到任何实际内容（operation 有值但没有执行结果）

---

## 改进方案

### 方案 1: 添加 Operation Handler Registry（推荐）

在 Gateway 中添加操作处理器注册机制：

```typescript
export type OperationHandler = (req: Request) => Promise<Response>;

export class Gateway {
  private handlers = new Map<string, OperationHandler>();

  /**
   * 注册操作处理器
   * @example
   * gateway.register('agent.run', async (req) => {
   *   const agent = new Agent(req.payload);
   *   const result = await agent.run();
   *   return { success: true, data: result, ... };
   * });
   */
  register(operation: string, handler: OperationHandler) {
    this.handlers.set(operation, handler);
  }

  private async finalHandler(req: Request): Promise<Response> {
    const handler = this.handlers.get(req.operation);
    
    if (!handler) {
      return {
        success: false,
        requestId: req.id,
        durationMs: Date.now() - t0,
        error: `Unknown operation: ${req.operation}`,
      };
    }

    try {
      return await handler(req);
    } catch (err) {
      return {
        success: false,
        requestId: req.id,
        durationMs: Date.now() - t0,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
```

**使用示例：**
```typescript
// src/index.ts 中集成
const gateway = Gateway.getInstance();

gateway.register('agent.run', async (req) => {
  const agent = new Agent(req.payload as AgentConfig);
  const result = await agent.run();
  return { 
    success: true, 
    data: result, 
    requestId: req.id,
    durationMs: Date.now() - req.timestamp 
  };
});

gateway.register('session.list', async (req) => {
  const sessions = await listSessions();
  return { success: true, data: sessions, ... };
});

// 使用
const response = await gateway.handle({
  source: 'cli',
  operation: 'agent.run',
  payload: { prompt: 'Write a function...' },
  ...
});
```

---

### 方案 2: 通过 Middleware 实现业务逻辑

如果不想改动 Gateway 核心，可以通过用户自定义中间件实现：

```typescript
// 在应用层添加业务处理中间件
gateway.use(async (req, next) => {
  // 在这里处理 operation
  if (req.operation === 'agent.run') {
    const agent = new Agent(req.payload);
    const result = await agent.run();
    return {
      success: true,
      data: result,
      requestId: req.id,
      durationMs: Date.now() - req.timestamp,
    };
  }
  
  // 继续下一个中间件
  return next();
});
```

**缺点：** 业务逻辑和中间件混在一起，不够清晰。

---

### 方案 3: Gateway 只做网关，业务逻辑在外部

保持 Gateway 作为纯网关（认证、限速、审计），业务逻辑在外部处理：

```typescript
// 应用层
const gatewayResponse = await gateway.handle(request);
if (!gatewayResponse.success) {
  // 被网关拦截（认证失败、限速等）
  return gatewayResponse;
}

// 通过网关后，执行实际业务逻辑
const result = await executeOperation(request.operation, request.payload);
return result;
```

**优点：** Gateway 职责单一，只做"守门员"
**缺点：** 审计日志无法记录业务执行结果

---

## 推荐实施

**阶段 1：** 实现方案 1 的 Handler Registry（向后兼容）
- Gateway 保持当前 API 不变
- 添加 `register()` 方法
- `finalHandler` 检查是否有注册的 handler
  - 有：执行 handler
  - 无：返回当前的 `{success: true}`（兼容现有代码）

**阶段 2：** 在各入口点注册 handlers
- CLI: 注册 `agent.run`, `session.list` 等
- Bridge: 注册 `task.create`, `task.update` 等
- Web: 注册 Web 相关操作

**阶段 3：** 增强审计日志
- 记录实际执行结果
- 记录执行耗时
- 记录失败原因

---

## 实施示例

```typescript
// src/gateway/index.ts 修改
export class Gateway {
  private handlers = new Map<string, OperationHandler>();

  register(operation: string, handler: OperationHandler) {
    this.handlers.set(operation, handler);
  }

  async handle(req: Request): Promise<Response> {
    const t0 = Date.now();
    
    // ... 中间件管道不变 ...

    const finalHandler = async (req: Request): Promise<Response> => {
      const handler = this.handlers.get(req.operation);
      
      if (!handler) {
        // 向后兼容：没有注册handler时返回默认响应
        return {
          success: true,
          requestId: req.id,
          durationMs: Date.now() - t0,
        };
      }

      try {
        const response = await handler(req);
        // 确保 response 包含必需字段
        return {
          ...response,
          requestId: req.id,
          durationMs: Date.now() - t0,
        };
      } catch (err) {
        return {
          success: false,
          requestId: req.id,
          durationMs: Date.now() - t0,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    };

    // ... 执行中间件管道 ...
  }
}
```

---

## 测试计划

1. **单元测试：** 测试 `register()` 和 handler 执行
2. **集成测试：** 测试注册后的完整流程
3. **向后兼容测试：** 确保未注册 handler 时不影响现有功能
4. **审计日志测试：** 验证日志包含业务执行结果

---

## 风险评估

- **低风险：** 方案 1 是加法，不改动现有逻辑
- **中等风险：** 需要在各入口点添加 handler 注册代码
- **测试覆盖：** 需要为新功能添加测试

---

## 结论

**当前状态：** Gateway 是一个"结构先于需求"的实现 — 框架完整但功能空缺

**建议行动：** 实施方案 1（Handler Registry），保持向后兼容，逐步迁移各入口点

**优先级：** 中等（不影响当前功能，但完善后会让架构更合理）

**工作量：** 2-3 小时（实现 + 测试 + 集成）
