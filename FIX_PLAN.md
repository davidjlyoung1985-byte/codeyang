# 修复计划：三个遗留问题

## 问题 1：CODEYANG_CWD 配置不生效 (P0)

### 当前问题
```typescript
// config.ts 读取了环境变量
config.cwd = process.env['CODEYANG_CWD'] || process.cwd();

// 但 BashTool 等工具使用的是 process.cwd()
await execa(cmd, args, { cwd: cwd || process.cwd() });
//                                 ^^^^^^^^^^^^^^^^ 总是用 process.cwd()
```

### 修复方案
1. 在 Config 接口中添加 `cwd` 字段
2. 更新 BashTool/PowerShellTool 使用 `config.cwd`
3. 添加测试验证

---

## 问题 2：库模式不读配置文件 (P0)

### 当前问题
```typescript
// CLI 模式（index.ts）
loadConfig();  // ✅ 自动加载
const agent = new Agent();

// 库模式（lib.ts）
import { Agent } from 'codeyang';
const agent = new Agent();  // ❌ config.apiKey 为空
```

### 修复方案
1. Agent 构造函数中检查配置
2. 如果未加载，自动调用 loadConfig()
3. 允许通过构造函数参数覆盖

---

## 问题 3：PowerShell 管道掩盖退出码 (P2)

### 当前问题
```powershell
node --test | Select-Object -Last 25
# $LASTEXITCODE = 1
# 但进程退出码 = 0
```

### 修复方案
在 PowerShellTool 描述中添加警告

---

## 实施顺序
1. ✅ 问题分析完成
2. 🔄 实施修复（下一步）
3. ⏳ 测试验证
4. ⏳ 文档更新
5. ⏳ PR 提交
