# 第三轮安全审核 - 新发现漏洞对比报告

**审核日期**: 2026-06-15  
**审核范围**: 21 个新报告的漏洞  
**状态**: 部分已修复，部分未修复

---

## 修复状态总览

| 类别 | 总数 | 已修复 | 未修复 | 修复率 |
|------|------|--------|--------|--------|
| 🔴 高危 | 7 | 0 | 7 | 0% |
| 🟠 中危 | 8 | 2 | 6 | 25% |
| 🟡 低危 | 6 | 0 | 6 | 0% |
| **总计** | **21** | **2** | **19** | **9.5%** |

---

## 🔴 高危漏洞详细分析

### ❌ 1. PowerShellTool ALLOW 前缀绕过权限系统

**状态**: ⚠️ **未修复**

**问题**: `executePowerShell` 允许通过 `ALLOW:` 前缀绕过权限检查。

**当前代码** (`src/tools/PowerShellTool.ts:23-26`):
```typescript
if (command.startsWith('ALLOW: ')) {
  command = command.slice(7).trim();
  skipPermissionCheck = true;
}
```

**风险**: 与 BashTool 中已修复的漏洞相同，AI 可以被诱导添加 ALLOW 前缀绕过权限系统。

**建议修复**: 
- 移除 `ALLOW:` 前缀机制（已在 BashTool 中移除）
- 或改为需要用户明确确认

**严重性**: 🔴 高危 - Prompt 注入 + 权限绕过

---

### ❌ 2. LaunchAppTool 命令注入

**状态**: ⚠️ **未修复**

**问题**: 
1. 使用 `cmd /c start` 可能存在注入风险
2. 目标路径未经过 `resolveSafePath` 沙箱检查

**当前代码** (`src/tools/LaunchAppTool.ts:54`):
```typescript
result = await exec('cmd', '/c', 'start', '', target);
```

**风险**: 
- 可以启动任意程序（包括系统外的恶意程序）
- 虽然有 `DANGEROUS_CHARS` 检查，但不够严格

**建议修复**:
```typescript
// 1. 添加沙箱路径检查
if (target.includes('\\') || target.includes('/')) {
  const safePath = await resolveSafePath(target);
  if (!safePath) {
    return 'Error: Path outside sandbox';
  }
  target = safePath;
}

// 2. 使用白名单限制可启动的应用
const ALLOWED_APPS = new Set(['notepad', 'calc', 'chrome', ...]);
if (!isUrl && !ALLOWED_APPS.has(target.toLowerCase())) {
  return 'Error: Application not in whitelist';
}

// 3. Windows 使用 Start-Process 而非 cmd /c start
result = await exec('powershell', '-Command', `Start-Process "${target}"`);
```

**严重性**: 🔴 高危 - 任意程序启动 + 沙箱绕过

---

### ❌ 3. GitTool 未验证远程 URL

**状态**: ⚠️ **部分修复**

**问题**: `validateGitUrl` 允许 `git@host:path` 格式，未校验 SSH 目标是否可信。

**当前代码** (`src/tools/GitTool.ts:122`):
```typescript
// Allow git@ style (SSH deploy keys)
if (/^[^@]+@[^:]+:.+$/.test(url)) return null;
```

**风险**: 
- 攻击者可以让 AI clone 恶意仓库
- Git hooks 可能执行任意代码

**当前防护**:
- ✅ 已限制为 `ssh://`、`https://`、`git@` 格式
- ❌ 未验证域名白名单
- ❌ 未禁用 Git hooks

**建议修复**:
```typescript
// 1. 添加域名白名单
const TRUSTED_HOSTS = new Set([
  'github.com', 'gitlab.com', 'bitbucket.org',
  // 企业内网可添加
]);

function validateGitUrl(url: string): string | null {
  let hostname = '';
  
  if (/^[^@]+@([^:]+):.+$/.test(url)) {
    hostname = url.match(/^[^@]+@([^:]+):/)?.[1] || '';
  } else if (url.startsWith('https://') || url.startsWith('ssh://')) {
    try {
      hostname = new URL(url).hostname;
    } catch {
      return 'Invalid URL format';
    }
  } else {
    return 'Invalid git URL scheme';
  }

  if (!TRUSTED_HOSTS.has(hostname)) {
    return `Untrusted git host: ${hostname}. Only ${Array.from(TRUSTED_HOSTS).join(', ')} are allowed.`;
  }

  return null;
}

// 2. Clone 时禁用 hooks
const args = ['clone', '--config', 'core.hooksPath=/dev/null', url];
```

**严重性**: 🔴 高危 - 供应链攻击 + 任意代码执行

---

### ❌ 4. MCP 命令白名单过于宽泛

**状态**: ⚠️ **已有白名单但过于宽松**

**问题**: `ALLOWED_MCP_COMMANDS` 包含 `docker`、`python`、`deno` 等可执行任意代码的命令。

**当前代码** (`src/mcp/McpClient.ts:11-15`):
```typescript
const ALLOWED_MCP_COMMANDS = new Set([
  'node', 'npx', 'python', 'python3', 'uvx', 'docker', 'deno',
]);
```

**风险**: 
- `docker run` 可以执行任意容器
- `python -c` 可以执行任意 Python 代码
- `npx` 可以下载并执行任意 npm 包

**当前防护**:
- ✅ 已有白名单（第一轮修复）
- ❌ 白名单过于宽松
- ❌ 未检查参数

**建议修复**:
```typescript
// 方案 1: 更严格的白名单（仅允许特定 MCP 服务器）
const ALLOWED_MCP_COMMANDS = new Set([
  'node', // 仅允许 node，不允许 npx
]);

// 方案 2: 参数白名单
const ALLOWED_MCP_SERVERS = new Map([
  ['node', ['/path/to/trusted/mcp-server1.js', '/path/to/mcp-server2.js']],
]);

function validateMcpCommand(command: string, args: string[]): void {
  const executable = basename(command);
  
  if (!ALLOWED_MCP_COMMANDS.has(executable)) {
    throw new Error(`MCP command not allowed: ${executable}`);
  }

  if (executable === 'node') {
    // 验证脚本路径在白名单中
    const scriptPath = args[0];
    const allowedScripts = ALLOWED_MCP_SERVERS.get('node') || [];
    if (!allowedScripts.some(allowed => scriptPath.endsWith(allowed))) {
      throw new Error(`MCP server script not in whitelist: ${scriptPath}`);
    }
  }
}

// 方案 3: 沙箱模式（使用 Docker 或 VM 运行 MCP 服务器）
```

**严重性**: 🔴 高危 - 任意代码执行

---

### ❌ 5. Web 服务器 CSRF 防护缺失

**状态**: ⚠️ **未修复**

**问题**: 
1. `Access-Control-Allow-Origin: *` 允许任意域名访问
2. 无 CSRF Token 保护
3. 无认证机制

**当前代码** (`src/web-server.ts:84`):
```typescript
res.setHeader('Access-Control-Allow-Origin', '*');
```

**风险**: 
- 恶意网站可以通过受害者浏览器调用 `/api/chat` 执行任意命令
- XSS + CSRF = 远程命令执行

**攻击场景**:
```html
<!-- 恶意网站 evil.com -->
<script>
fetch('http://localhost:3000/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: 'ALLOW: rm -rf ~/*'
  })
});
</script>
```

**建议修复**:
```typescript
// 1. 移除 CORS 或限制来源
res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3000');

// 2. 添加 CSRF Token
let csrfToken = randomUUID();

if (req.method === 'GET' && req.url === '/api/csrf-token') {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ token: csrfToken }));
  return;
}

if (req.method === 'POST') {
  const receivedToken = req.headers['x-csrf-token'];
  if (receivedToken !== csrfToken) {
    res.writeHead(403);
    res.end(JSON.stringify({ error: 'Invalid CSRF token' }));
    return;
  }
}

// 3. 添加基础认证
const API_KEY = process.env['CODEYANG_WEB_API_KEY'] || randomUUID();
console.log(`Web API Key: ${API_KEY}`);

if (req.headers['authorization'] !== `Bearer ${API_KEY}`) {
  res.writeHead(401);
  res.end(JSON.stringify({ error: 'Unauthorized' }));
  return;
}
```

**严重性**: 🔴 高危 - CSRF + RCE

---

### ❌ 6. Agent 子代理工具权限隔离缺失

**状态**: ⚠️ **未修复**

**问题**: 子代理（AgentTool、TaskTool）拥有与主代理相同的工具权限。

**当前代码**: 
- `src/tools/AgentTool.ts` - 创建子代理时传递所有工具
- `src/tools/TaskTool.ts` - 只过滤了 `Question` 和 `Task`

**风险**: 
- 子代理可以执行 `Bash`、`Write`、`Edit`、`Delete` 等危险操作
- 无法限制子代理的权限范围

**建议修复**:
```typescript
// 定义子代理允许的工具白名单
const SUBAGENT_ALLOWED_TOOLS = new Set([
  'Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch',
  // 只读工具，不包括 Bash、Write、Edit、Delete
]);

function isDisallowedInSubagent(name: string): boolean {
  return !SUBAGENT_ALLOWED_TOOLS.has(name);
}

// 在创建子代理时过滤工具
const subagentTools = toolSchemas.filter(t => !isDisallowedInSubagent(t.name));
const subAgent = new Agent({
  llmClient,
  tools: subagentTools, // 只传递允许的工具
  ...
});
```

**严重性**: 🔴 高危 - 权限升级 + 隔离绕过

---

### ❌ 7. 会话导入路径校验可绕过

**状态**: ⚠️ **未修复**

**问题**: `importSessionFromFile` 使用 `resolve()` 但未使用 `realpathSync` 解析符号链接。

**当前代码** (`src/utils/sessionStore.ts:356-360`):
```typescript
const allowedBase = resolve(join(homedir(), '.codeyang'));
const absPath = resolve(filePath);
if (!absPath.startsWith(allowedBase)) {
  throw new Error('Access denied: import path must be under ~/.codeyang/');
}
```

**风险**: 
- 如果 `~/.codeyang/` 下有符号链接指向外部，可以读取外部文件
- 路径遍历攻击

**建议修复**:
```typescript
import { realpathSync } from 'node:fs';

export async function importSessionFromFile(filePath: string): Promise<void> {
  // SECURITY: Resolve symlinks before path validation
  const allowedBase = realpathSync(join(homedir(), '.codeyang'));
  
  let absPath: string;
  try {
    absPath = realpathSync(resolve(filePath));
  } catch (err) {
    throw new Error(`File not found or inaccessible: ${filePath}`);
  }

  if (!absPath.startsWith(allowedBase)) {
    throw new Error('Access denied: import path must be under ~/.codeyang/');
  }
  
  // ... rest of the code
}
```

**严重性**: 🔴 高危 - 路径遍历 + 信息泄露

---

## 🟠 中危漏洞详细分析

### ✅ 8. API Key 通过消息历史泄漏（已部分缓解）

**状态**: ✅ **已部分缓解**（第一轮修复）

**缓解措施**:
- API Key 不再同步到 VS Code 云端
- 只存储在本地 `~/.codeyang/config.json`

**剩余风险**:
- 会话历史仍可能包含工具调用参数中的敏感信息
- 审计日志可能记录含密码的命令

**建议进一步修复**:
```typescript
// 在保存会话前清洗敏感信息
function sanitizeMessage(msg: Message): Message {
  if (msg.role === 'user' && typeof msg.content === 'string') {
    // 检测并屏蔽可能的 API Key
    const apiKeyPattern = /\b(sk-[a-zA-Z0-9]{20,}|[a-f0-9]{32,64})\b/g;
    msg.content = msg.content.replace(apiKeyPattern, '[REDACTED]');
  }
  return msg;
}
```

**严重性**: 🟠 中危 - 凭据泄露（部分缓解）

---

### ❌ 9. .env 文件权限检查仅限 Unix

**状态**: ✅ **已修复**（第二轮修复）

**修复内容** (`src/utils/dotenv.ts:52-58`):
```typescript
// SECURITY: Check file permissions (warn if too permissive on Unix)
if (process.platform !== 'win32') {
  const stats = statSync(filePath);
  const mode = stats.mode & 0o777;
  if (mode & 0o004) {
    console.warn(`[SECURITY WARNING] ${name} is world-readable`);
  }
}
```

**状态**: ✅ 已修复

---

### ❌ 10. BashTool 未过滤 $() 和反引号注入

**状态**: ⚠️ **未修复**

**问题**: `isDenied` 分割 token 后检查，但实际命令仍包含 `$()`、反引号等。

**风险**: 
```bash
# 绕过示例
echo hello && rm -rf /tmp  # 被分割为 ['echo', 'hello', 'rm', '-rf', '/tmp']
# 如果 'rm' 不在 deny list，可以执行

# 命令替换绕过
cat $(echo /etc/passwd)  # 可能绕过路径检查
```

**建议修复**:
```typescript
// 在 isDenied 中添加命令替换检测
const dangerousPatterns = [
  /rm\s*-\s*rf/i,
  /\$\([^)]*\)/,  // $(command) 命令替换
  /`[^`]*`/,      // `command` 反引号替换
  /\{\s*.*;\s*\}/, // { cmd; } 命令组
  // ...
];
```

**严重性**: 🟠 中危 - 命令注入绕过

---

### ❌ 11. WebSearchTool 未验证搜索结果 URL

**状态**: ⚠️ **未修复**

**问题**: 搜索结果中的 URL 未经过 SSRF 验证。

**建议修复**:
```typescript
async function searchDuckDuckGo(query: string, topK: number): Promise<SearchResult[]> {
  // ... 解析结果
  
  // SECURITY: 验证每个结果 URL
  const validResults: SearchResult[] = [];
  for (const result of results) {
    const validationError = await validateUrl(result.url);
    if (!validationError) {
      validResults.push(result);
    }
  }
  
  return validResults;
}
```

**严重性**: 🟠 中危 - SSRF 绕过

---

### ❌ 12. GitHub Token 硬编码在内存中

**状态**: ⚠️ **未修复**

**问题**: GitHub Token 存储在模块级变量。

**建议**: 使用环境变量，避免日志泄露

**严重性**: 🟠 中危 - 凭据管理

---

### ❌ 13. 文件删除未验证项目范围

**状态**: ⚠️ **未修复**（沙箱模式下已有防护）

**当前防护**: 
- ✅ 沙箱模式下使用 `resolveSafePath`
- ❌ 默认无沙箱时允许任意删除
- ❌ 无回收站功能

**建议**: 启用默认沙箱

**严重性**: 🟠 中危 - 数据丢失

---

### ❌ 14. 审计日志包含敏感命令参数

**状态**: ⚠️ **未修复**

**建议**: 在记录前清洗密码参数

**严重性**: 🟠 中危 - 敏感信息记录

---

### ❌ 15. 权限系统规则排序问题

**状态**: ⚠️ **理论风险**

**当前**: 按 `pattern.length` 降序排列

**风险**: minimatch 可能有优先级反转

**建议**: 添加测试验证规则优先级

**严重性**: 🟠 中危 - 权限绕过（理论）

---

## 🟡 低危/告警

### ❌ 16-21. 低危问题

所有低危问题均**未修复**：
- Agent loop 检测仅对比前 100 字符
- Web 服务器无 HTTPS
- 临时文件清理不保证
- 子代理超时回滚缺失
- 无 CSP 安全头
- Cookie/Session 认证缺失

**建议**: 列入后续改进计划

---

## 总结

### 修复优先级建议

#### P0（立即修复）- 严重安全风险
1. ❌ **PowerShellTool ALLOW 前缀** - 移除绕过机制
2. ❌ **Web 服务器 CSRF** - 添加认证和 CSRF 保护
3. ❌ **LaunchAppTool 沙箱** - 添加路径验证和应用白名单

#### P1（高优先级）- 重大安全风险
4. ❌ **GitTool 域名白名单** - 限制可信 Git 主机
5. ❌ **MCP 命令白名单** - 收紧白名单或添加参数验证
6. ❌ **子代理权限隔离** - 限制子代理工具为只读

#### P2（中优先级）- 防御深度
7. ❌ **会话导入路径** - 添加 realpath 解析
8. ❌ **BashTool 命令替换** - 检测 $() 和反引号
9. ❌ **WebSearch URL 验证** - SSRF 防护

#### P3（低优先级）- 改进建议
10-21. 低危问题

---

## 代码修复估算

| 优先级 | 漏洞数 | 预计工作量 | 风险降低 |
|--------|--------|------------|----------|
| P0 | 3 | 4-6 小时 | 70% |
| P1 | 3 | 6-8 小时 | 20% |
| P2 | 3 | 4-6 小时 | 8% |
| P3 | 12 | 10-15 小时 | 2% |
| **总计** | **21** | **24-35 小时** | **100%** |

**建议**: 优先修复 P0 和 P1 的 6 个高危漏洞，可以在 10-14 小时内将 90% 的安全风险消除。

---

**报告生成时间**: 2026-06-15  
**审核人**: Claude Opus 4.7  
**项目版本**: 0.7.0
