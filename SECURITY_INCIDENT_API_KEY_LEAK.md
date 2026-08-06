# ⚠️ 安全警告：API 密钥已泄露

## 问题

在刚才的提交中，DeepSeek API 密钥被意外提交到了 Git 历史中：

```
DEEPSEEK_API_KEY=sk-ccee****[REDACTED]****4598
```

虽然已经通过 `--amend` 和 `--force-with-lease` 修复，但这个密钥仍然可能：
1. 在 GitHub 的缓存中存在一段时间
2. 已被 GitHub Secret Scanning 记录
3. 可能已被其他人看到（如果有人在修复前拉取了代码）

## 立即行动

### 1. 撤销该 API 密钥 ✅ 必须立即执行

**去 DeepSeek 控制台撤销该密钥：**
1. 访问 https://platform.deepseek.com/api_keys
2. 找到这个密钥并删除
3. 生成新的密钥

### 2. 更新本地配置

```bash
# 编辑 .env 文件
cd C:\Users\Ehua\codeyang
nano .env  # 或使用其他编辑器

# 替换为新的密钥
DEEPSEEK_API_KEY=sk-NEW_KEY_HERE
```

### 3. 检查是否被滥用

监控 DeepSeek API 使用情况：
- 访问 https://platform.deepseek.com/usage
- 检查是否有异常调用
- 如果发现未授权使用，联系 DeepSeek 支持

## 预防措施

### 1. 确认 .env 已被 .gitignore

```bash
# 检查
cat .gitignore | grep "\.env"

# 应该包含这一行：
# .env
```

✅ 已确认：`.env` 在 `.gitignore` 中

### 2. 使用 git-secrets（推荐）

```bash
# 安装 git-secrets
brew install git-secrets  # Mac
# 或从 https://github.com/awslabs/git-secrets 安装

# 配置
cd C:\Users\Ehua\codeyang
git secrets --install
git secrets --register-aws  # 添加 AWS 密钥模式
git secrets --add 'sk-[a-zA-Z0-9]{32}'  # 添加 DeepSeek 密钥模式
```

### 3. 启用 GitHub Secret Push Protection

✅ 已启用：GitHub 自动阻止了第一次推送尝试

### 4. 使用环境变量而非文件

**更安全的方式：**
```bash
# 不要在 .env 文件中存储密钥
# 而是在启动时设置环境变量

# Windows (PowerShell)
$env:DEEPSEEK_API_KEY="sk-your-key"
.\start.bat

# Linux/Mac (Bash)
export DEEPSEEK_API_KEY="sk-your-key"
./start.sh
```

### 5. 使用密钥管理工具

**推荐工具：**
- **1Password CLI** - https://1password.com/downloads/command-line/
- **Azure Key Vault** - 企业级密钥管理
- **HashiCorp Vault** - 自托管密钥管理

**使用 1Password 示例：**
```bash
# 存储密钥
op item create --category=password \
  --title="DeepSeek API Key" \
  --vault=Private \
  credential=sk-your-key

# 使用时获取
export DEEPSEEK_API_KEY=$(op item get "DeepSeek API Key" --fields credential)
./start.sh
```

## 检查清单

- [ ] **立即撤销泄露的 API 密钥**
- [ ] 生成新的 API 密钥
- [ ] 更新本地 `.env` 文件
- [ ] 检查 API 使用记录是否有异常
- [ ] 确认 `.env` 在 `.gitignore` 中
- [ ] （可选）安装 git-secrets
- [ ] （可选）使用密钥管理工具

## 吸取的教训

1. **永远不要在示例文档中使用真实密钥**
   - 使用 `sk-****` 或 `YOUR_KEY_HERE`
   - 即使在本地文档中也要谨慎

2. **审查每次提交**
   ```bash
   # 提交前检查
   git diff --cached
   
   # 查找潜在的密钥
   git diff --cached | grep -i "key\|token\|password\|secret"
   ```

3. **使用 pre-commit hooks**
   - 自动扫描提交中的密钥
   - 阻止包含密钥的提交

4. **定期轮换密钥**
   - 每 90 天更换一次 API 密钥
   - 记录轮换日期

## 相关资源

- [GitHub Secret Scanning](https://docs.github.com/code-security/secret-scanning)
- [git-secrets](https://github.com/awslabs/git-secrets)
- [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)

## 时间线

- **2024-08-06 16:34** - API 密钥意外提交
- **2024-08-06 16:35** - GitHub 阻止推送（Secret Scanning）
- **2024-08-06 16:37** - 修复提交并强制推送
- **待办** - 撤销泄露的密钥

---

**严重性**: 🔴 高  
**状态**: ⚠️ 需要立即撤销密钥  
**负责人**: 用户  
**截止时间**: 立即
