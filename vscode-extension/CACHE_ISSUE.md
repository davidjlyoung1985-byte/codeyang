# VS Code 扩展开关显示问题 - 解决方案

## 问题确认

HTML文件 `chat.html` 已正确添加开关代码（第106-114行），但在VS Code中看不到。

## 根本原因

VS Code的Webview具有**强缓存机制**，即使HTML文件已修改，Webview仍然使用旧版本的缓存。

## 解决方案（按顺序尝试）

### 方案1：强制重新加载扩展（推荐）

```bash
# 步骤1：完全关闭所有CodeYang面板
# 在VS Code中关闭所有打开的CodeYang聊天窗口

# 步骤2：重新加载VS Code窗口
# 按 F1 或 Ctrl+Shift+P
# 输入：Developer: Reload Window
# 回车执行

# 步骤3：清除扩展主机缓存
# 按 F1 或 Ctrl+Shift+P  
# 输入：Developer: Restart Extension Host
# 回车执行

# 步骤4：重新打开CodeYang
# 按 Ctrl+Shift+P
# 输入：CodeYang: Start Chat
# 查看是否显示开关
```

### 方案2：清除VS Code缓存

```bash
# 步骤1：完全退出VS Code

# 步骤2：删除缓存目录（Windows）
# 删除以下目录（保留用户数据）：
# C:\Users\<你的用户名>\AppData\Roaming\Code\Cache
# C:\Users\<你的用户名>\AppData\Roaming\Code\CachedData

# 步骤3：重新启动VS Code
```

### 方案3：修改HTML添加缓存破坏符

为了强制VS Code重新加载HTML，我们可以在extension.js中添加查询参数：

```javascript
// 在 extension.js 的 createOrShowPanel 函数中
// 修改HTML加载方式，添加时间戳
const htmlPath = path.join(context.extensionPath, 'chat.html');
let html = fs.readFileSync(htmlPath, 'utf-8');

// 添加缓存破坏符
const timestamp = Date.now();
html = html.replace('</head>', `<meta name="cache-bust" content="${timestamp}"></head>`);

panel.webview.html = html;
```

### 方案4：使用开发模式安装扩展

```bash
# 步骤1：在VS Code中打开 vscode-extension 目录
cd vscode-extension

# 步骤2：按 F5 启动调试模式
# 这会打开一个新的VS Code窗口（扩展开发主机）

# 步骤3：在新窗口中测试CodeYang
# 按 Ctrl+Shift+P
# 输入：CodeYang: Start Chat
```

## 验证步骤

### 1. 打开浏览器开发者工具

在VS Code的CodeYang面板中：
```
1. 右键点击聊天区域
2. 选择 "检查" 或 "Inspect"
3. 这会打开Chrome开发者工具
```

### 2. 检查DOM结构

在开发者工具的Elements标签中：
```
1. 查找 id="settings-bar" 的元素
2. 如果找不到，说明HTML未更新
3. 如果找到了，检查CSS display属性
```

### 3. 检查控制台错误

在开发者工具的Console标签中：
```
1. 查看是否有JavaScript错误
2. 查看是否有CSS加载失败
3. 尝试手动执行：document.getElementById('settings-bar')
```

## 快速测试命令

在VS Code的开发者工具Console中运行：

```javascript
// 检查元素是否存在
console.log('Settings bar:', document.getElementById('settings-bar'));

// 手动创建开关（临时测试）
const settingsBar = document.createElement('div');
settingsBar.id = 'settings-bar-test';
settingsBar.style.cssText = 'display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-top: 1px solid #333; background: #252526; font-size: 14px;';
settingsBar.innerHTML = '<span style="color: #d4d4d4;">🔧 折叠工具调用</span><label style="position: relative; display: inline-block; width: 40px; height: 20px;"><input type="checkbox" checked style="opacity: 0;"><span style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #0e639c; transition: 0.3s; border-radius: 20px;"><span style="position: absolute; content: \'\'; height: 14px; width: 14px; left: 23px; bottom: 3px; background-color: white; transition: 0.3s; border-radius: 50%;"></span></span></label>';

const inputArea = document.getElementById('input-area');
inputArea.parentNode.insertBefore(settingsBar, inputArea);
```

## 终极解决方案：重新安装扩展

如果以上方法都不行：

```bash
# 步骤1：卸载CodeYang扩展
# 在VS Code扩展面板中右键卸载

# 步骤2：清除所有缓存
# 删除 ~/.vscode/extensions/中的相关文件夹
# 删除 AppData/Roaming/Code/Cache

# 步骤3：重新安装扩展
# 从市场或本地VSIX文件安装
```

## 为什么测试页面能看到，但VS Code中看不到？

| 环境 | 缓存机制 | 刷新方式 |
|-----|---------|---------|
| **浏览器** | 标准HTTP缓存 | F5刷新即可 |
| **VS Code Webview** | 强制缓存 | 必须重启扩展主机 |

## 检查清单

- [ ] HTML文件已正确修改（第106-114行）
- [ ] CSS样式已正确添加（第65-72行）
- [ ] JavaScript函数已添加（toggleToolCollapse）
- [ ] VS Code窗口已重新加载
- [ ] 扩展主机已重启
- [ ] 所有CodeYang面板已关闭再打开
- [ ] 开发者工具中无JavaScript错误
- [ ] DOM中可以找到 #settings-bar 元素

## 下一步

1. ✅ 按 F1 → "Developer: Reload Window"
2. ✅ 按 Ctrl+Shift+P → "CodeYang: Start Chat"
3. ✅ 右键聊天区域 → "检查" → 查看DOM
4. ✅ 如果还看不到，尝试 "Developer: Restart Extension Host"

## 需要帮助？

如果以上方法都不行，请提供：
1. VS Code版本号
2. 开发者工具Console的截图
3. 开发者工具Elements中是否有 #settings-bar
4. 是否在开发模式运行扩展
