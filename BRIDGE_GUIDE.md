# CodeYang ↔ Claude Code 桥接通信指南

## 概述

本桥接方案允许 **CodeYang**（终端 AI 编码代理）与 **Claude Code**（VS Code 扩展 AI 代理）双向通信、协作完成任务。

## 架构

```
┌─────────────────────┐     HTTP API / WebSocket     ┌─────────────────────┐
│     CodeYang        │◄───────────────────────────►│    Claude Code      │
│  (AI Coding Agent)  │      localhost:9876           │  (VS Code 扩展)    │
└─────────┬───────────┘                              └──────────┬──────────┘
          │                                                      │
          │              ┌──────────────────────┐               │
          └─────────────►│    Bridge Server      │◄──────────────┘
                         │  src/bridge/server.ts  │
                         │  - 消息中继             │
                         │  - 任务队列             │
                         │  - 共享文件             │
                         │  - WebSocket 实时推送   │
                         └──────────────────────┘
```

## 通信方式

### 方式一：任务委托（Task）

CodeYang 将完整任务委托给 Claude Code 执行，等待结果返回。

**流程：**
1. CodeYang 通过 `claude_code` 工具（action=delegate）创建任务
2. Bridge Server 通过 WebSocket 实时推送给 Claude Code
3. Claude Code 终端中的 `claude-agent.ts` 收到任务并展示
4. 用户在 Claude Code 中完成任务后，在终端提交结果
5. 结果通过 Bridge Server 返回给 CodeYang

### 方式二：消息对话（Message）

CodeYang 与 Claude Code 直接对话，用于问答或简单交互。

**流程：**
1. CodeYang 发送消息到 Bridge Server
2. Bridge Server 推送给 Claude Code 终端
3. Claude Code 在终端看到消息后回复
4. 回复通过 `claude-agent.ts` 提交回 Bridge Server
5. CodeYang 轮询获取回复

### 方式三：共享文件（Shared File）

双方通过共享目录交换文件，适合大量数据传递。

## 快速启动

### 步骤 1：启动桥接服务器

```bash
# 终端 1
cd E:\qt\ai-code-agent
npx tsx src/bridge/server.ts
```

或者双击 `start-bridge.bat`。

### 步骤 2：在 Claude Code 中连接

在 VS Code 的 Claude Code 集成终端中运行：

```bash
cd E:\qt\ai-code-agent
set BRIDGE_TOKEN=<从桥接服务器获取的 token>
npx tsx src/bridge/claude-agent.ts
```

或者双击 `start-claude-agent.bat` 并输入 Token。

### 步骤 3：验证连接

```bash
curl http://127.0.0.1:9876/api/health -H "Authorization: Bearer <TOKEN>"
# 返回: {"status":"ok","agents":{"claude-code":true},"taskCount":0,"messageCount":0}
```

## CodeYang 侧：`claude_code` 工具

CodeYang 有 6 个操作可用：

### `check_status` — 检查连接状态
```json
{"action": "check_status"}
```

### `delegate` — 委托任务
```json
{
  "action": "delegate",
  "title": "重构 UserService",
  "description": "将 UserService 拆分为 UserAuthService 和 UserProfileService...",
  "priority": "high",
  "files": ["src/services/UserService.ts"],
  "wait": true,
  "timeout": 10
}
```

### `send_message` — 发送消息
```json
{
  "action": "send_message",
  "content": "你好，请帮忙检查这个文件的类型定义"
}
```

### `get_messages` — 获取消息
```json
{"action": "get_messages"}
```

### `write_shared` — 写共享文件
```json
{
  "action": "write_shared",
  "fileName": "context.md",
  "content": "项目背景信息..."
}
```

### `read_shared` — 读共享文件
```json
{"action": "read_shared", "fileName": "result.md"}
```

## Claude Code 侧：`claude-agent.ts` 终端命令

在 Claude Code 终端中运行的代理支持以下命令：

| 命令 | 说明 |
|------|------|
| `status` | 查看桥接状态和已连接代理 |
| `tasks` | 列出所有来自 CodeYang 的任务 |
| `exit` / `quit` / `q` | 断开连接并退出 |
| `help` | 显示帮助信息 |

**提交任务结果：** 完成任务后输入结果，按 `Ctrl+Z`（Windows）或 `Ctrl+D`（Unix）提交。

## API 参考

### Base URL: `http://127.0.0.1:9876`

所有 API 需要 `Authorization: Bearer <TOKEN>` 请求头。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 + 代理状态 |
| GET | `/api/info` | 桥接信息 |
| GET | `/api/tasks?agent=&status=` | 获取任务列表 |
| POST | `/api/tasks` | 创建任务 |
| GET | `/api/tasks/:id` | 获取单个任务 |
| PUT | `/api/tasks/:id` | 更新任务状态/结果 |
| GET | `/api/messages?agent=&since=` | 获取消息列表 |
| POST | `/api/messages` | 发送消息 |
| GET | `/api/shared` | 列出共享文件 |
| POST | `/api/shared` | 写入共享文件 |
| GET | `/api/shared/:name` | 读取共享文件 |

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `BRIDGE_PORT` | `9876` | 桥接服务器端口 |
| `BRIDGE_URL` | `http://127.0.0.1:9876` | 桥接服务器地址 |
| `BRIDGE_TOKEN` | - | 认证令牌（必须设置） |

## 项目文件结构

```
src/bridge/
├── types.ts          # 共享类型定义
├── server.ts         # 桥接服务器 (HTTP + WebSocket)
├── client.ts         # CodeYang 侧客户端 API
├── claude-agent.ts   # Claude Code 侧终端代理
└── index.ts          # 模块入口

src/tools/
└── ClaudeCodeTool.ts # CodeYang 的 claude_code 工具

start-bridge.bat      # 桥接服务器启动脚本
start-claude-agent.bat # Claude Code 代理启动脚本
```

## 注意事项

1. **编码问题**：发送中文时，用 `curl.exe -d @file.json` 或直接写文件，避免 PowerShell 管道导致乱码
2. **安全**：桥接服务器绑定 `127.0.0.1`（仅本地访问），需要 Token 认证
3. **持久化**：任务和消息存储在 `~/.codeyang/bridge/` 目录
4. **超时**：任务默认 5 分钟超时，可通过 `timeout` 参数调整
5. **实时性**：通过 WebSocket 实时推送，无需轮询

## 数据清理

桥接服务器运行过程中会产生持久化数据（任务记录、消息记录、共享文件），存储在 `~/.codeyang/bridge/` 目录下。定期清理可以释放磁盘空间并提高启动速度。

### 清理方法

**完全清理（删除所有桥接数据）：**

```bash
# 先停止桥接服务器
# 然后删除整个桥接数据目录
rm -rf ~/.codeyang/bridge/

# Windows PowerShell
Remove-Item -Recurse -Force "$env:USERPROFILE\.codeyang\bridge\"

# Windows CMD
rmdir /s /q "%USERPROFILE%\.codeyang\bridge\"
```

**选择性清理：**

| 数据 | 路径 | 说明 |
|------|------|------|
| 任务记录 | `~/.codeyang/bridge/tasks.json` | 删除后任务历史丢失 |
| 消息记录 | `~/.codeyang/bridge/messages.json` | 删除后消息历史丢失 |
| 共享文件 | `~/.codeyang/bridge/shared/` | 按需删除具体文件 |
| 认证 Token | `~/.codeyang/bridge/.token` | 删除后下次启动会生成新 Token |

**注意：** 删除 `~/.codeyang/bridge/` 目录或 `.token` 文件后，重新启动桥接服务器时会自动生成新的 Token，所有已连接的客户端需要重新认证。

### 保留策略建议

1. **日常使用**：无需手动清理，数据量通常较小（千条级别约数百 KB）
2. **定期清理**：建议每月清理一次消息和任务记录，保留最近 500 条即可
3. **共享文件**：任务完成后及时清理不再需要的共享文件
4. **Token 文件**：除非 Token 泄露或需要重置，否则不建议删除
5. **自动化脚本**：可创建定时任务（cron / Task Scheduler）定期清理过期数据

## 故障排查 (Troubleshooting)

### 连接失败

**现象：** curl 请求 `/api/health` 无响应或返回连接拒绝。

**可能原因及解决方案：**

1. **端口被占用**
   ```bash
   # 检查端口 9876 占用情况
   netstat -ano | findstr :9876
   
   # 找到 PID 后终止进程（Windows）
   taskkill /PID <PID> /F
   
   # 或更换端口启动
   set BRIDGE_PORT=9877
   npx tsx src/bridge/server.ts
   ```

2. **服务未启动**
   - 确认已执行 `npx tsx src/bridge/server.ts` 或双击 `start-bridge.bat`
   - 检查终端是否显示了启动 Banner（含 Token 信息）
   - 查看启动日志中是否有错误信息

3. **主机绑定错误**
   - 确认服务器绑定 `127.0.0.1` 而非 `0.0.0.0`
   - 如果使用远程连接，需修改配置为 `0.0.0.0`（注意安全风险）

### Token 认证错误

**现象：** 请求返回 `401 Unauthorized`。

**可能原因及解决方案：**

1. **Token 未设置**
   ```bash
   # 确保请求头包含 Authorization
   curl http://127.0.0.1:9876/api/health -H "Authorization: Bearer <TOKEN>"
   ```

2. **Token 不匹配**
   - 启动桥接服务器时，终端会显示 Token（前 16 位）
   - 完整 Token 存储在 `~/.codeyang/bridge/.token` 文件中
   - 可以用以下命令查看：`type "%USERPROFILE%\.codeyang\bridge\.token"`
   - 确认客户端使用的 Token 与该文件内容一致

3. **Token 已更改**
   - 删除 `~/.codeyang/bridge/.token` 文件后重启服务器会生成新 Token
   - 所有旧 Token 立即失效，客户端需要更新

### WebSocket 断线排查

**现象：** 客户端连接后频繁断开或无法建立 WebSocket 连接。

**排查步骤：**

1. **检查服务端日志**
   - 查看桥接服务器终端输出，是否有 `disconnected` 或错误信息
   - WebSocket 认证超时默认 10 秒，超时未认证会断开

2. **检查 Token 认证**
   - WebSocket 连接建立后需发送 `auth` 消息进行认证
   - 认证消息格式：`{"type":"auth","payload":{"token":"<TOKEN>"}}`
   - Token 错误会被立即断开（错误码 4001）

3. **网络问题**
   - 确认客户端和服务器在同一台机器上（都使用 `127.0.0.1`）
   - 检查防火墙是否阻止 WebSocket 连接
   - 代理软件可能干扰 WebSocket 协议

4. **日志级别**
   - 设置环境变量 `CODEX_DEBUG=1` 可输出更详细的调试日志

### 任务挂起如何处理

**现象：** 任务提交后长时间处于 `pending` 状态，状态不更新。

**排查步骤：**

1. **检查 Claude Code 是否在线**
   ```bash
   curl http://127.0.0.1:9876/api/health -H "Authorization: Bearer <TOKEN>"
   # 查看 agents.claude-code 是否为 true
   ```

2. **手动查询任务状态**
   ```bash
   curl http://127.0.0.1:9876/api/tasks -H "Authorization: Bearer <TOKEN>"
   ```

3. **强制更新任务状态**
   ```bash
   # 将任务标记为失败，以便重新提交
   curl -X PUT http://127.0.0.1:9876/api/tasks/<TASK_ID> \
     -H "Authorization: Bearer <TOKEN>" \
     -H "Content-Type: application/json" \
     -d "{\"status\":\"failed\",\"result\":\"手动取消 - 任务超时\"}"
   ```

4. **重启桥接**
   - 停止桥接服务器（Ctrl+C）
   - 删除 `~/.codeyang/bridge/tasks.json` 中的卡住任务（可选）
   - 重新启动桥接服务器

### 常见错误码说明

| 状态码 | 含义 | 说明 |
|--------|------|------|
| `200` | OK | 请求成功 |
| `201` | Created | 资源创建成功（任务/消息/文件） |
| `400` | Bad Request | 请求体 JSON 格式错误或参数缺失 |
| `401` | Unauthorized | Token 无效或缺失 |
| `404` | Not Found | 请求的资源不存在 |
| `413` | Payload Too Large | 请求体超过 10MB 限制 |
| `500` | Internal Server Error | 服务器内部错误 |
| `4001` | WS Auth Failed | WebSocket 认证失败（Token 错误） |
| `4001` | WS Auth Timeout | WebSocket 认证超时（10 秒内未认证） |
