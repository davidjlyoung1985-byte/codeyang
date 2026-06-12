# CodeYang × WPS Office 集成

## 加载宏方式（推荐）

### 安装 VBA 宏

1. **先启动 CodeYang Web 服务器**
```powershell
cd C:\Users\Ehua\codeyang
npm run build
node dist\web-server.js
```

2. **在 WPS 中导入宏**
   - 打开 WPS 文字 / 表格 / 演示
   - 点击 `开发工具` → `Visual Basic`（或按 Alt+F11）
   - 菜单 `文件` → `导入` → 选择 `wps-addin\CodeYangAI.bas`
   - 关闭 VBA 编辑器

3. **运行宏**
   - 按 Alt+F8 打开宏对话框
   - 选择 `CodeYang_OpenPanel` → 运行

### 快捷键设置（可选）
- Alt+F8 → 选中 `CodeYang_OpenPanel` → 选项 → 设置快捷键（如 Ctrl+Shift+Y）

---

## JS 宏方式（WPS 专业版）

1. `开发工具` → `JS宏` → `导入` → 选择 `wps-addin\CodeYangAI.js`
2. 在 JS 宏列表中运行 `CodeYangAI`

---

## 文件说明

| 文件 | 说明 |
|------|------|
| `CodeYangAI.bas` | VBA 宏（推荐，兼容性好） |
| `CodeYangAI.js` | JS 宏（WPS 专业版） |
| `panel.html` | 本地面板页面 |
| `manifest.xml` | 加载项清单（部分版本支持） |

---

## 使用方式对比

| 方式 | 步骤 | 兼容性 |
|------|------|--------|
| **VBA 宏** | 导入 .bas → Alt+F8 运行 | ⭐⭐⭐ 最兼容 |
| JS 宏 | 导入 .js → JS宏中运行 | ⭐⭐ WPS专业版 |
| 加载项 | 添加 manifest.xml | ⭐ 部分版本 |
| 浏览器 | 直接打开 http://localhost:3456/wps | ⭐⭐⭐⭐⭐ 最稳定 |
