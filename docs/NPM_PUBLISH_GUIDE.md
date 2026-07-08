# npm 发布操作指南 - CodeYang v0.7.0

**当前状态**: 需要 npm 登录

---

## 步骤 1: 登录 npm

请在终端执行以下命令：

```bash
npm login
```

按提示输入：
1. **Username**: 您的 npm 用户名
2. **Password**: 您的 npm 密码
3. **Email**: 您的邮箱地址
4. **OTP** (如果启用了两步验证): 输入验证码

---

## 步骤 2: 验证登录

```bash
npm whoami
```

应该显示您的 npm 用户名。

---

## 步骤 3: 最终检查

```bash
# 确认版本号
cat package.json | grep version

# 确认构建产物存在
ls dist/

# 运行最后一次测试
npm test
```

---

## 步骤 4: 发布到 npm

```bash
# 发布
npm publish

# 如果是 scoped package (@yourname/codeyang)，使用：
# npm publish --access public
```

---

## 步骤 5: 验证发布

```bash
# 查看 npm 上的包信息
npm view codeyang

# 在另一个目录测试安装
cd /tmp
npm install -g codeyang@0.7.0

# 验证版本
codeyang --version
```

---

## 预期输出

### npm publish 成功

```
npm notice 
npm notice 📦  codeyang@0.7.0
npm notice === Tarball Contents === 
npm notice 1.1kB  package.json      
npm notice 4.5kB  README.md         
npm notice 173kB  dist/index.js     
npm notice ...    
npm notice === Tarball Details === 
npm notice name:          codeyang                                
npm notice version:       0.7.0                                   
npm notice filename:      codeyang-0.7.0.tgz                      
npm notice package size:  XXX kB                                  
npm notice unpacked size: XXX kB                                  
npm notice shasum:        xxxxx                                   
npm notice integrity:     xxxxx                                   
npm notice total files:   XX                                      
npm notice 
npm notice Publishing to https://registry.npmjs.org/
+ codeyang@0.7.0
```

### npm view 成功

```
codeyang@0.7.0 | MIT | deps: 28 | versions: X
Terminal-based AI coding agent with 64+ tools, code refactoring, MCP support
https://github.com/您的用户名/codeyang

keywords: ai, coding-agent, llm, tools, refactoring, qt

dist
.tarball: https://registry.npmjs.org/codeyang/-/codeyang-0.7.0.tgz
.shasum: xxxxx
.integrity: xxxxx
.unpackedSize: XXX kB

dependencies:
@anthropic-ai/sdk: ^0.x.x
...

maintainers:
- 您的用户名 <email@example.com>

dist-tags:
latest: 0.7.0

published X minutes ago by 您的用户名 <email@example.com>
```

---

## 常见问题

### 问题 1: 包名已存在

```
npm ERR! 403 Forbidden - PUT https://registry.npmjs.org/codeyang - You do not have permission to publish "codeyang".
```

**解决方案**: 
- 检查包名是否已被占用：`npm view codeyang`
- 如果已占用，修改 package.json 中的 name 为 `@yourname/codeyang`
- 或选择其他名称

### 问题 2: 版本号已存在

```
npm ERR! 403 Forbidden - PUT https://registry.npmjs.org/codeyang - You cannot publish over the previously published versions: 0.7.0.
```

**解决方案**:
```bash
npm version patch  # 0.7.0 → 0.7.1
npm publish
```

### 问题 3: 需要两步验证

```
npm ERR! code EOTP
npm ERR! This operation requires a one-time password.
```

**解决方案**:
```bash
npm publish --otp=123456  # 替换为您的 OTP 验证码
```

### 问题 4: 文件过大

```
npm ERR! code E413
npm ERR! Payload Too Large
```

**解决方案**:
- 检查 `.npmignore` 文件
- 确保只包含必要文件
- 排除 `node_modules/`, `*.log`, `test/` 等

---

## 发布后操作

### 1. 验证全局安装

```bash
# 全局安装
npm install -g codeyang

# 测试运行
codeyang --version
codeyang --help
```

### 2. 推送到 GitHub

```bash
git push origin master
git tag v0.7.0
git push origin v0.7.0
```

### 3. 创建 GitHub Release

访问: `https://github.com/您的用户名/codeyang/releases/new`

---

## 快速命令参考

```bash
# 完整发布流程
npm login
npm whoami
npm test
npm publish
npm view codeyang

# 验证
npm install -g codeyang@0.7.0
codeyang --version

# Git 操作
git push origin master
git tag v0.7.0
git push origin v0.7.0
```

---

**准备就绪**: ✅  
**下一步**: 执行 `npm login` 然后 `npm publish`

---

**创建时间**: 2026-06-10  
