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
