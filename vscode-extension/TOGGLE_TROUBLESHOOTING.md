# VS Code 扩展工具调用折叠开关 - 使用说明

## 问题诊断

如果你在VS Code扩展中看不到折叠开关，可能是以下原因：

### 1. 扩展未重新加载

**解决方法：**
```
1. 在VS Code中按 F1 或 Ctrl+Shift+P
2. 输入 "Developer: Reload Window"
3. 选择并执行
4. 重新打开 CodeYang: Start Chat
```

### 2. 扩展未更新

**解决方法：**
```bash
# 在 vscode-extension 目录下
cd vscode-extension

# 如果有package.json，运行
npm install

# 或者直接重新加载扩展
```

### 3. Webview缓存问题

**解决方法：**
```
1. 关闭所有CodeYang聊天面板
2. 重启VS Code
3. 重新打开 CodeYang: Start Chat
```

## 验证开关位置

开关应该显示在以下位置：

```
┌─────────────────────────────────────┐
│ 🤖 CodeYang                         │
│ [消息区域]                           │
│                                     │
├─────────────────────────────────────┤ ← 这里是设置栏
│ 🔧 折叠工具调用  [●──]  ON         │ ← 折叠开关
├─────────────────────────────────────┤
│ [输入框]                    [发送]  │
└─────────────────────────────────────┘
```

## 测试页面

我创建了一个独立的测试页面，你可以直接在浏览器中打开验证功能：

**文件位置：** `vscode-extension/test-toggle.html`

**打开方法：**
1. 在文件资源管理器中找到该文件
2. 右键 → "在默认浏览器中打开"
3. 或直接双击打开

**测试步骤：**
1. 页面加载后应该看到一个开关按钮
2. 点击开关，状态文字会变化
3. 点击"工具调用 (5 个)"可以展开/收起
4. 刷新页面，设置应该保持

## 检查HTML文件

确认 `vscode-extension/chat.html` 中包含以下内容：

### CSS部分（应该在第65-72行）
```css
#settings-bar { display: flex; align-items: center; gap: 12px; padding: 8px 16px; border-top: 1px solid #333; background: #252526; font-size: 12px; }
.toggle-switch { position: relative; display: inline-block; width: 40px; height: 20px; }
.toggle-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #555; transition: 0.3s; border-radius: 20px; }
input:checked + .toggle-slider { background-color: #0e639c; }
```

### HTML部分（应该在第106-114行）
```html
<div id="settings-bar">
  <label class="settings-label">
    <span>🔧 折叠工具调用</span>
    <label class="toggle-switch">
      <input type="checkbox" id="collapse-tools-toggle" checked onchange="toggleToolCollapse()">
      <span class="toggle-slider"></span>
    </label>
  </label>
</div>
```

### JavaScript部分（应该在第388-393行）
```javascript
function toggleToolCollapse() {
  collapseToolsEnabled = document.getElementById('collapse-tools-toggle').checked;
  localStorage.setItem('collapseTools', collapseToolsEnabled);
  addSystemMessage(collapseToolsEnabled ? '✅ 工具调用折叠已启用' : '✅ 工具调用折叠已禁用');
}
```

## 手动验证步骤

### 步骤1：打开测试页面
```bash
# 在项目根目录
cd vscode-extension
start test-toggle.html  # Windows
# 或
open test-toggle.html   # Mac
# 或
xdg-open test-toggle.html  # Linux
```

### 步骤2：检查功能
- ✅ 看到开关按钮
- ✅ 点击开关，状态改变
- ✅ 点击工具调用区域，展开/收起
- ✅ 刷新页面，设置保持

### 步骤3：在VS Code中验证
1. 重新加载VS Code窗口
2. 打开 CodeYang: Start Chat
3. 查看聊天界面底部（输入框上方）
4. 应该看到设置栏和开关

## 常见问题

### Q1: 开关不显示
**A:** 
1. 检查 `chat.html` 是否正确修改
2. 重新加载VS Code窗口
3. 清除浏览器缓存（如果使用webview）

### Q2: 点击开关没反应
**A:**
1. 打开浏览器开发者工具（F12）
2. 查看Console是否有JavaScript错误
3. 确认 `toggleToolCollapse()` 函数已定义

### Q3: 设置不保存
**A:**
1. 检查localStorage是否可用
2. 确认webview允许localStorage访问
3. 查看浏览器安全设置

## 截图位置示例

```
╔═════════════════════════════════════╗
║ CodeYang                            ║
╠═════════════════════════════════════╣
║ 🤖 CodeYang:                        ║
║   我来帮你检查项目                   ║
║                                     ║
║ 🔧 工具调用 (5 个)  ▶               ║
║                                     ║
║ ✅ 检查完成！                        ║
╠═════════════════════════════════════╣
║ 🔧 折叠工具调用  [●──]  ON    ← 这里 ║
╠═════════════════════════════════════╣
║ [Ask CodeYang...]        [Send]    ║
╚═════════════════════════════════════╝
```

## 获取帮助

如果以上方法都不能解决问题，请提供：

1. VS Code 版本号
2. 操作系统
3. `chat.html` 文件的第65-114行内容
4. 浏览器控制台的错误信息（如果有）
5. 测试页面是否正常工作

## 下一步

1. 打开 `test-toggle.html` 验证功能
2. 重新加载VS Code
3. 启动CodeYang扩展
4. 检查设置栏是否显示
