# CodeYang VS Code Extension - Features

## 工具调用折叠功能

### 概述
VS Code扩展现在支持工具调用过程的折叠显示，让对话界面更简洁清晰。

### 功能特性

#### 1. 默认折叠模式（已启用）
- 🔧 所有工具调用（Bash, Read, Write, Edit, Grep, Glob等）自动折叠
- 显示摘要：`🔧 工具调用 (N 个)`
- 自动统计工具调用次数
- 点击可展开/收起查看详细信息
- 平滑展开/收起动画效果

#### 2. 展开模式（传统显示）
- 工具调用和结果按时间顺序逐行显示
- 适合需要实时查看每个工具执行过程的场景

### 使用方法

#### 切换折叠开关
在VS Code扩展的聊天界面底部，你会看到设置栏：

```
┌─────────────────────────────────────┐
│ 🔧 折叠工具调用  [●──]  ON          │
└─────────────────────────────────────┘
```

- **开启**（默认）：工具调用自动折叠，界面简洁
- **关闭**：工具调用完整显示，便于调试

#### 设置持久化
- 开关状态自动保存到浏览器 localStorage
- 重新打开扩展后保持上次的设置
- 每次切换时会显示确认消息

### 技术实现

#### 折叠样式
```css
.tool-section { /* 工具调用容器 */ }
.tool-collapse-header { /* 可点击的折叠头部 */ }
.tool-collapse-content { /* 折叠内容区域 */ }
.toggle-switch { /* 开关按钮样式 */ }
```

#### JavaScript API
```javascript
// 全局变量
collapseToolsEnabled // 折叠开关状态

// 核心函数
toggleToolCollapse()    // 切换折叠状态
addToolIndicator()      // 添加工具调用
addToolResult()         // 添加工具结果
toggleToolSection()     // 展开/收起具体区域
```

### 示例效果

#### 折叠模式（推荐）
```
🤖 CodeYang:
  我来帮你检查项目状态

🔧 工具调用 (5 个)  ▶  [点击展开]
  ├─ Bash(npm run lint)
  ├─ Read(package.json)
  ├─ Glob(src/**/*.ts)
  └─ ...

✅ 项目检查完成
```

#### 展开模式（传统）
```
🤖 CodeYang:
  我来帮你检查项目状态

> Bash(npm run lint)
  · ESLint 无错误

> Read(package.json)
  · 155 行

> Glob(src/**/*.ts)
  · 找到 142 个文件

✅ 项目检查完成
```

### 优势对比

| 特性 | 折叠模式 | 展开模式 |
|-----|---------|---------|
| 界面简洁度 | ⭐⭐⭐⭐⭐ | ⭐⭐ |
| 查看速度 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| 调试便利性 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| 上下文保留 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| 适用场景 | 日常使用 | 问题排查 |

### 兼容性

- ✅ VS Code 扩展
- ✅ 浏览器环境（localStorage 支持）
- ✅ 与现有工具系统完全兼容
- ✅ 向后兼容旧版本

### 未来计划

- [ ] CLI 终端版本的折叠支持
- [ ] Electron 桌面应用的折叠支持
- [ ] 可配置折叠阈值（例如：超过N个工具才折叠）
- [ ] 工具调用性能统计显示
- [ ] 导出工具调用日志

## 其他功能

### 64+ 内置工具
- 文件操作：Read, Write, Edit, Copy, Move, Delete
- 代码搜索：Glob, Grep, Search
- Git 操作：Status, Commit, Push, Pull, Diff
- 数据处理：JSON, YAML, CSV, XML
- 网络请求：HttpRequest, WebFetch
- 代码分析：AST, Complexity, Lint
- 更多...

### API 支持
- DeepSeek API（默认）
- Anthropic Claude API
- OpenAI 兼容 API

### 会话管理
- 自动保存对话历史
- 恢复上次会话
- 会话元数据索引
