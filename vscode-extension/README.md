# CodeYang VS Code Extension

AI编码助手的VS Code扩展，支持64+工具和智能工具调用折叠。

## 快速开始

### 安装
1. 在VS Code中打开扩展面板（Ctrl+Shift+X）
2. 搜索 "CodeYang"
3. 点击安装

### 配置
1. 打开命令面板（Ctrl+Shift+P）
2. 运行 `CodeYang: Start Chat`
3. 输入API配置：
   - **API Base URL**: `https://api.deepseek.com/anthropic`
   - **Model**: `deepseek-v4-pro` 或 `deepseek-v4-flash`
   - **API Key**: 你的DeepSeek API密钥
4. 点击 "Connect"

## 核心功能

### 🔧 工具调用折叠（新功能）

**默认启用** - 让对话界面更简洁！

#### 开启折叠（推荐）
```
🔧 工具调用 (5 个)  ▶
```
- 自动折叠所有工具调用过程
- 点击展开查看详细信息
- 界面简洁清爽

#### 关闭折叠
```
> Bash(npm run build)
  · Build success
> Read(package.json)
  · 155 lines
```
- 实时显示每个工具执行
- 适合调试和问题排查

#### 如何切换？
在聊天界面底部找到设置栏：
```
🔧 折叠工具调用  [●──]  ON/OFF
```
点击开关即可切换，设置会自动保存。

### 💬 智能对话
- 自然语言编程
- 上下文理解
- 流式响应

### 🛠️ 64+ 工具支持

#### 文件操作
- `Read` - 读取文件
- `Write` - 写入文件
- `Edit` - 编辑文件
- `Glob` - 文件搜索
- `Grep` - 内容搜索

#### Git操作
- `Status` - 查看状态
- `Commit` - 提交更改
- `Push/Pull` - 推送/拉取
- `Diff` - 查看差异
- `Branch` - 分支管理

#### 代码分析
- `ParseAst` - AST解析
- `AnalyzeCode` - 代码分析
- `Complexity` - 复杂度分析
- `Lint` - 代码检查

#### 数据处理
- `JsonParse/Write` - JSON处理
- `YamlParse/Write` - YAML处理
- `CsvParse/Write` - CSV处理
- `XmlParse/Write` - XML处理

#### 网络请求
- `HttpRequest` - HTTP请求
- `WebFetch` - 网页抓取
- `ApiCall` - API调用

### 🔐 安全特性
- API密钥本地存储（不同步到云端）
- 命令黑名单保护
- 频率限制
- 内容安全策略（CSP）

## 使用示例

### 示例1：项目代码分析
```
你: 分析一下这个项目的代码结构

CodeYang: 我来帮你分析项目结构
🔧 工具调用 (3 个)  ▶
✅ 分析完成，项目包含：
- 142个TypeScript文件
- 38个测试文件
- 669个测试用例
```

### 示例2：修复代码错误
```
你: 修复 src/tools/BashTool.ts 中的类型错误

CodeYang: 我来检查并修复
🔧 工具调用 (4 个)  ▶
✅ 已修复类型错误，更新了2处代码
```

### 示例3：Git操作
```
你: 提交当前更改，消息为 "feat: add tool collapse"

CodeYang: 我来提交代码
🔧 工具调用 (3 个)  ▶
✅ 已提交：feat: add tool collapse (a1b2c3d)
```

## 快捷键

| 快捷键 | 功能 |
|-------|------|
| `Ctrl+Shift+P` → `CodeYang: Start Chat` | 打开CodeYang聊天 |
| `Enter` | 发送消息 |
| `Shift+Enter` | 换行 |

## 配置选项

### VS Code设置
```json
{
  "codeyang.apiBaseUrl": "https://api.deepseek.com/anthropic",
  "codeyang.model": "deepseek-v4-pro"
}
```

### 环境变量
```bash
CODEYANG_API_KEY=sk-xxx
CODEYANG_BASE_URL=https://api.deepseek.com/anthropic
CODEYANG_MODEL=deepseek-v4-pro
```

## 支持的模型

### DeepSeek（推荐）
- `deepseek-v4-pro` - 最强性能
- `deepseek-v4-flash` - 快速响应

### Anthropic Claude
- `claude-opus-4` - 最高质量
- `claude-sonnet-4` - 平衡性能
- `claude-haiku-4` - 快速低成本

### OpenAI兼容
- 任何兼容OpenAI API的模型

## 常见问题

### Q: 工具调用太多，界面很乱怎么办？
**A:** 启用"工具调用折叠"功能（默认已启用），所有工具调用会自动折叠。

### Q: 想看具体执行了哪些命令怎么办？
**A:** 点击 `🔧 工具调用 (N 个)` 展开查看详细信息。

### Q: API密钥存储在哪里？
**A:** 本地文件 `~/.codeyang/config.json`，不会同步到云端。

### Q: 支持哪些编程语言？
**A:** 所有主流语言，包括 TypeScript、JavaScript、Python、Java、C++、Rust等。

### Q: 如何切换折叠模式？
**A:** 点击底部设置栏的"折叠工具调用"开关。

## 故障排除

### 连接失败
1. 检查API密钥是否正确
2. 检查网络连接
3. 检查API Base URL配置

### 工具调用错误
1. 确保工作区已打开
2. 检查文件路径是否正确
3. 查看错误消息详情

### 界面卡顿
1. 启用"工具调用折叠"减少渲染
2. 清理历史会话
3. 重启VS Code

## 版本历史

### v0.7.0 (2026-06-23)
- ✨ 新增工具调用折叠功能
- ✨ 新增设置开关UI
- ✨ 支持localStorage持久化设置
- 🐛 修复工具调用显示问题
- 📝 更新文档和示例

### v0.6.0
- ✨ 支持DeepSeek V4 API
- ✨ 新增64+工具
- 🐛 修复安全漏洞

## 贡献指南

欢迎提交Issue和PR！

1. Fork本项目
2. 创建特性分支 (`git checkout -b feature/amazing`)
3. 提交更改 (`git commit -m 'feat: add amazing feature'`)
4. 推送分支 (`git push origin feature/amazing`)
5. 创建Pull Request

## 许可证

MIT License

## 相关链接

- [GitHub](https://github.com/davidjlyoung1985-byte/codeyang)
- [DeepSeek Platform](https://platform.deepseek.com)
- [VS Code Marketplace](https://marketplace.visualstudio.com)

## 致谢

感谢所有贡献者和用户的支持！

---

**享受更简洁的AI编程体验！** 🚀
