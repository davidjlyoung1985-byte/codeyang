# CodeYang Web

浏览器版 CodeYang AI 代码助手

## 架构

- **前端**: React + TypeScript + Vite
- **后端**: Node.js + WebSocket
- **通信**: 实时双向 WebSocket 连接

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 启动开发环境

```bash
# 同时启动后端和前端（推荐）
npm run web:dev

# 或者分别启动
npm run web:server  # 后端 WebSocket 服务器 (端口 3000)
npm run web:client  # 前端开发服务器 (端口 5173)
```

### 3. 访问

打开浏览器访问: http://localhost:5173

## 功能特性

✅ 实时聊天界面  
✅ WebSocket 双向通信  
✅ 工具调用实时展示  
✅ 执行状态显示  
✅ 取消执行功能  
✅ 重置会话功能  
✅ 自动滚动到最新消息  
✅ 连接状态指示器

## 生产构建

```bash
# 构建前端
npm run web:build

# 构建后的文件在 dist-web/client/
# 部署时需要同时运行后端服务器
npm run web:server
```

## API 端点

### WebSocket: `ws://localhost:3000`

#### 客户端 → 服务器

```json
// 发送提示
{
  "type": "prompt",
  "prompt": "你的问题或指令"
}

// 取消执行
{
  "type": "cancel"
}

// 重置会话
{
  "type": "reset"
}
```

#### 服务器 → 客户端

```json
// 连接成功
{
  "type": "connected",
  "message": "Connected to CodeYang Web Server"
}

// AI 响应文本
{
  "type": "assistant_text",
  "text": "响应内容"
}

// 工具调用
{
  "type": "tool_call",
  "toolName": "Read"
}

// 工具结果
{
  "type": "tool_result",
  "toolName": "Read",
  "result": "文件内容..."
}

// 状态更新
{
  "type": "status",
  "status": "processing" | "completed" | "cancelled" | "reset"
}

// 错误
{
  "type": "error",
  "error": "错误信息"
}
```

## 目录结构

```
web/
├── server/
│   └── index.ts          # WebSocket 服务器
└── client/
    ├── src/
    │   ├── App.tsx       # 主应用组件
    │   ├── App.css       # 样式
    │   └── main.tsx      # 入口文件
    ├── index.html        # HTML 模板
    └── tsconfig.json     # TypeScript 配置
```

## 注意事项

- 后端服务器需要访问本地文件系统和 shell
- 前端通过 WebSocket 与后端通信，不直接访问 API
- API Key 配置在后端 (.env 文件)
- 生产环境需要配置反向代理 (nginx/caddy)

## 环境变量

在项目根目录创建 `.env` 文件：

```env
ANTHROPIC_API_KEY=your_api_key_here
PORT=3000
```

## 开发提示

- WebSocket 服务器运行在 http://localhost:3000
- Vite 开发服务器运行在 http://localhost:5173
- 热更新已启用，修改代码自动刷新
- 使用浏览器开发者工具查看 WebSocket 消息

## 故障排除

### WebSocket 连接失败

1. 确认后端服务器正在运行: `npm run web:server`
2. 检查端口 3000 是否被占用
3. 查看浏览器控制台错误信息

### 前端无法启动

1. 删除 `node_modules` 重新安装: `rm -rf node_modules && npm install`
2. 清除 Vite 缓存: `rm -rf node_modules/.vite`

### API Key 错误

确保 `.env` 文件中配置了有效的 `ANTHROPIC_API_KEY`
