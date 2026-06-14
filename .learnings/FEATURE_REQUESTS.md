# Feature Requests

Capabilities requested by the user.

---

## 2026-06-14: 工具执行集成测试

- **request**: 添加完整 agent loop 的集成测试，验证工具调用、会话保存/加载、MCP 服务器连接等端到端流程
- **rationale**: 现有 30 个测试文件全是单元测试，重度 mock，无法发现跨模块集成问题
- **priority**: high

## 2026-06-14: Windows CI 测试

- **request**: GitHub Actions 测试矩阵增加 windows-latest
- **rationale**: BashTool.ts:83 在 Windows 上使用 powershell.exe，但 CI 只在 ubuntu-latest 运行，Windows 路径从未测试
- **priority**: medium
