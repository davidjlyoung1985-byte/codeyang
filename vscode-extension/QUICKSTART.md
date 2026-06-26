# VS Code 扩展快速配置指南

## 📦 扩展已安装

扩展名称：**CodeYang**  
版本：**0.1.0**  
位置：`E:\Qt\ai-code-agent\vscode-extension\codeyang-vscode-0.1.0.vsix`

---

## ⚙️ 配置步骤

### 步骤 1：打开 VS Code 设置

**方式 A（快捷键）：**
```
Ctrl + ,
```

**方式 B（菜单）：**
```
文件 → 首选项 → 设置
```

---

### 步骤 2：搜索 CodeYang

在设置搜索框中输入：
```
CodeYang
```

你会看到以下选项：

---

### 步骤 3：配置选项

#### 必填项 ⚠️

**CodeYang: Api Key**
```
你的 Claude API Key (sk-ant-...)
```

没有 API Key？访问：https://console.anthropic.com/settings/keys

---

#### 可选项

| 设置项 | 默认值 | 说明 |
|--------|--------|------|
| **Enable Inline Completion** | `true` | 启用实时补全 |
| **Completion Delay** | `300` | 触发延迟（毫秒） |
| **Max Completion Length** | `500` | 最大补全长度（字符） |

---

### 步骤 4：验证配置

打开命令面板（`Ctrl+Shift+P`），输入：
```
Developer: Reload Window
```

重启 VS Code 使配置生效。

---

## 🧪 测试扩展

### 测试 1：打开测试文件

```bash
# 在 VS Code 中打开
E:\Qt\ai-code-agent\vscode-extension\test-completion.ts
```

---

### 测试 2：尝试单行补全

**输入：**
```typescript
const add = (a: number, b: number
```

**等待 300ms，应该看到：**
```typescript
const add = (a: number, b: number): number => a + b;
                                   ^^^^^^^^^^^^^^^^
                                   （灰色补全建议）
```

**按 `Tab` 接受补全**

---

### 测试 3：尝试多行补全

**输入：**
```typescript
function calculateTotal(items: Item[]) {

```

**应该看到：**
```typescript
function calculateTotal(items: Item[]) {
  return items.reduce((sum, item) => sum + item.price, 0);
}
  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  （灰色多行补全建议）
```

**按 `Tab` 接受补全**

---

## 🎮 快捷键

| 功能 | 快捷键 | 说明 |
|------|--------|------|
| **手动触发补全** | `Ctrl+Shift+Space` | 立即触发补全 |
| **接受补全** | `Tab` 或 `Enter` | 接受当前建议 |
| **拒绝补全** | `Esc` | 取消补全 |
| **重构选中代码** | `Ctrl+Shift+P` → "CodeYang: Refactor" | 智能重构 |
| **生成测试** | `Ctrl+Shift+P` → "CodeYang: Generate Tests" | 生成单元测试 |

---

## 🔍 查看扩展是否激活

### 方式 1：查看状态栏

扩展激活后，状态栏右下角应该显示 CodeYang 图标。

---

### 方式 2：查看已安装扩展

1. 按 `Ctrl+Shift+X` 打开扩展面板
2. 搜索 "CodeYang"
3. 应该看到扩展已启用

---

### 方式 3：查看开发者控制台

1. 按 `Ctrl+Shift+I` 打开开发者工具
2. 切换到 "控制台" 标签
3. 应该看到：`CodeYang extension activated`

---

## 🐛 常见问题

### ❌ 问题 1：没有补全提示

**解决方案：**

1. **检查 API Key**
   ```
   设置 → 搜索 "CodeYang" → 确认 API Key 已填写
   ```

2. **检查扩展是否激活**
   ```
   Ctrl+Shift+X → 搜索 "CodeYang" → 确认已启用
   ```

3. **重新加载窗口**
   ```
   Ctrl+Shift+P → Developer: Reload Window
   ```

4. **查看错误日志**
   ```
   Ctrl+Shift+I → 控制台 → 查看是否有错误
   ```

---

### ❌ 问题 2：补全太慢

**解决方案：**

1. **减少延迟**
   ```
   设置 → Completion Delay → 改为 200
   ```

2. **检查网络**
   ```
   确保能访问 api.anthropic.com
   ```

3. **查看 API 配额**
   ```
   访问 https://console.anthropic.com/settings/usage
   ```

---

### ❌ 问题 3：多行补全不生效

**解决方案：**

1. **确保光标后有空行**
   ```typescript
   function test() {
   ↓（光标位置）
   ↓（空行）
   }
   ```

2. **手动触发**
   ```
   Ctrl+Shift+Space
   ```

---

## 📊 监控补全效果

打开开发者控制台查看日志：

```javascript
// 补全请求
CodeYang completion requested: {...}

// 补全成功
CodeYang completion success: 120 chars

// 补全失败
CodeYang completion error: [错误信息]
```

---

## 🎯 下一步

### 选项 A：立即测试

```bash
# 1. 打开测试文件
code E:\Qt\ai-code-agent\vscode-extension\test-completion.ts

# 2. 配置 API Key
# Ctrl+, → 搜索 "CodeYang" → 填写 API Key

# 3. 开始测试
# 在测试文件中输入代码，体验补全
```

### 选项 B：查看详细文档

```bash
# 打开测试指南
code E:\Qt\ai-code-agent\vscode-extension\TESTING.md
```

---

## ✅ 配置检查清单

- [ ] 扩展已安装
- [ ] VS Code 已重启
- [ ] API Key 已配置
- [ ] 测试文件已打开
- [ ] 能看到补全建议
- [ ] Tab 键能接受补全

---

需要我帮你：
1. **自动打开测试文件并配置**
2. **生成一个配置说明视频**
3. **创建更多测试场景**
4. **其他帮助**

你想做什么？
