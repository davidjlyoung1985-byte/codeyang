# CodeYang 全局安装指南

## ✅ 已完成全局安装

CodeYang 现在已经安装为全局命令！

## 🚀 使用方法

### 启动 CodeYang
```bash
codeyang
```

### 查看版本
```bash
codeyang --version
```

### 查看帮助
```bash
codeyang --help
```

### 指定 API Key
```bash
codeyang --api-key "your-api-key"
```

### 恢复会话
```bash
codeyang --resume <session-id>
```

### 列出会话
```bash
codeyang --list
```

## 📝 配置文件

API key 会自动保存在：
```
~/.codeyang/config.json
```

首次运行时会提示输入 API key，选择保存后下次就无需再输入。

## 🔧 更新全局安装

当代码有更新时，重新链接：
```bash
cd /path/to/codeyang
npm run build
npm link
```

## 🗑️ 卸载

如果需要移除全局命令：
```bash
npm unlink -g codeyang
```

## 💡 使用场景

现在可以在**任何目录**下直接运行 `codeyang`：

```bash
# 在项目目录
cd ~/my-project
codeyang

# 在任何其他目录
cd /tmp
codeyang
```

CodeYang 会在当前目录工作，可以访问该目录下的所有文件和项目。

---

**全局安装完成时间**: 2026/06/09  
**版本**: CodeYang v0.6.0  
**命令**: `codeyang`
